import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { calculateInstallmentValue, COMPANY_INFO, isValidCPF, onlyDigits } from './src/lib/loanTable.ts';
import type { ContractVerificationAudit, LoanContractInput, SignedLoanContract } from './src/types/contract.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'contracts.json');

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function loadContracts(): Map<string, SignedLoanContract> {
  ensureStorage();
  const map = new Map<string, SignedLoanContract>();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.protocol === 'string') {
          map.set(item.protocol.toUpperCase(), item as SignedLoanContract);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao ler contratos salvos:', err);
  }
  return map;
}

function persistContracts(map: Map<string, SignedLoanContract>): void {
  ensureStorage();
  const list = Array.from(map.values());
  const tmpFile = `${DATA_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function computeIntegrityHash(contract: Omit<SignedLoanContract, 'integrityHash'>): string {
  const canonicalPayload = JSON.stringify({
    company: COMPANY_INFO.name,
    cnpj: COMPANY_INFO.cnpj,
    protocol: contract.protocol,
    loanAmount: contract.loanAmount,
    installments: contract.installments,
    installmentValue: contract.installmentValue,
    fullName: contract.fullName,
    cpf: onlyDigits(contract.cpf),
    bankName: contract.bankName,
    agency: contract.agency,
    accountNumber: contract.accountNumber,
    pixKey: contract.pixKey,
    acceptedTerms: contract.acceptedTerms,
    acceptedDataTruth: contract.acceptedDataTruth,
    signatureDigest: crypto.createHash('sha256').update(contract.signatureDataUrl).digest('hex'),
    signedAt: contract.signedAt,
  });
  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function generateProtocol(existing: Map<string, SignedLoanContract>): string {
  const year = new Date().getFullYear();
  for (let i = 0; i < 20; i++) {
    const rand = crypto.randomInt(100000, 999999);
    const candidate = `RP-${year}-${rand}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `RP-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function buildVerificationAudit(contract: SignedLoanContract): ContractVerificationAudit {
  const expectedHash = computeIntegrityHash({
    ...contract,
  });
  const personalDataComplete =
    contract.fullName.length >= 5 &&
    contract.rgOrCnh.length >= 4 &&
    contract.birthDate.length >= 8 &&
    onlyDigits(contract.phone).length >= 10 &&
    contract.email.includes('@') &&
    contract.street.length >= 3 &&
    contract.city.length >= 2 &&
    contract.state.length === 2;

  const bankDataComplete =
    contract.bankName.length >= 3 &&
    contract.agency.length >= 2 &&
    contract.accountNumber.length >= 3 &&
    contract.pixKey.length >= 3;

  const expectedInstallment = calculateInstallmentValue(contract.loanAmount, contract.installments);
  const loanTermsValid =
    contract.loanAmount >= 1000 &&
    contract.loanAmount <= 100000 &&
    contract.installments >= 6 &&
    contract.installments <= 120 &&
    Math.abs(contract.installmentValue - expectedInstallment) <= 0.1;

  return {
    personalDataComplete,
    cpfValid: isValidCPF(contract.cpf),
    bankDataComplete,
    loanTermsValid,
    clausesAccepted: Boolean(contract.acceptedTerms && contract.acceptedDataTruth),
    signaturePresent: contract.signatureDataUrl.startsWith('data:image/png;base64,') && contract.signatureDataUrl.length > 500,
    hashVerified: contract.integrityHash === expectedHash,
  };
}

function timingSafeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  const contractsStore = loadContracts();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, company: COMPANY_INFO.name, cnpj: COMPANY_INFO.cnpj });
  });

  app.post('/api/contracts', (req, res) => {
    try {
      const body = req.body as Partial<LoanContractInput>;
      const loanAmount = Number(body.loanAmount);
      const installments = Number(body.installments);

      if (!Number.isFinite(loanAmount) || loanAmount < 1000 || loanAmount > 100000) {
        return res.status(400).json({ error: 'Valor do empréstimo inválido (entre R$ 1.000,00 e R$ 100.000,00).' });
      }
      if (!Number.isInteger(installments) || installments < 6 || installments > 120) {
        return res.status(400).json({ error: 'Quantidade de parcelas inválida.' });
      }

      const fullName = sanitizeString(body.fullName, 140);
      const cpf = sanitizeString(body.cpf, 20);
      const rgOrCnh = sanitizeString(body.rgOrCnh, 40);
      const birthDate = sanitizeString(body.birthDate, 20);
      const maritalStatus = sanitizeString(body.maritalStatus, 40);
      const occupation = sanitizeString(body.occupation, 80);
      const monthlyIncome = sanitizeString(body.monthlyIncome, 40);
      const phone = sanitizeString(body.phone, 25);
      const email = sanitizeString(body.email, 120);

      const cep = sanitizeString(body.cep, 15);
      const street = sanitizeString(body.street, 160);
      const number = sanitizeString(body.number, 25);
      const complement = sanitizeString(body.complement, 80);
      const neighborhood = sanitizeString(body.neighborhood, 80);
      const city = sanitizeString(body.city, 80);
      const state = sanitizeString(body.state, 2).toUpperCase();

      const bankName = sanitizeString(body.bankName, 100);
      const accountType = body.accountType;
      const agency = sanitizeString(body.agency, 20);
      const accountNumber = sanitizeString(body.accountNumber, 30);
      const pixKeyType = body.pixKeyType;
      const pixKey = sanitizeString(body.pixKey, 120);
      const firstDueDate = sanitizeString(body.firstDueDate, 20);

      if (fullName.length < 5) {
        return res.status(400).json({ error: 'Informe o nome completo do contratante.' });
      }
      if (!isValidCPF(cpf)) {
        return res.status(400).json({ error: 'CPF inválido. Verifique os dígitos informados.' });
      }
      if (rgOrCnh.length < 4 || birthDate.length < 8) {
        return res.status(400).json({ error: 'Informe RG/CNH e data de nascimento válidos.' });
      }
      if (onlyDigits(phone).length < 10 || !email.includes('@')) {
        return res.status(400).json({ error: 'Informe telefone/WhatsApp e e-mail válidos.' });
      }
      if (street.length < 3 || number.length < 1 || city.length < 2 || state.length !== 2) {
        return res.status(400).json({ error: 'Preencha o endereço completo corretamente.' });
      }
      if (!bankName || !agency || !accountNumber || !pixKey) {
        return res.status(400).json({ error: 'Preencha todos os dados bancários e chave PIX para recebimento.' });
      }
      if (accountType !== 'Conta Corrente' && accountType !== 'Conta Poupança' && accountType !== 'Conta Pagamento') {
        return res.status(400).json({ error: 'Tipo de conta bancária inválido.' });
      }
      if (pixKeyType !== 'CPF' && pixKeyType !== 'Celular' && pixKeyType !== 'E-mail' && pixKeyType !== 'Chave Aleatória') {
        return res.status(400).json({ error: 'Tipo de chave PIX inválido.' });
      }
      if (body.acceptedTerms !== true || body.acceptedDataTruth !== true) {
        return res.status(400).json({ error: 'É obrigatório aceitar os termos e cláusulas do contrato.' });
      }

      const signatureDataUrl = typeof body.signatureDataUrl === 'string' ? body.signatureDataUrl.trim() : '';
      if (!signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length < 500 || signatureDataUrl.length > 900000) {
        return res.status(400).json({ error: 'Assinatura digital inválida ou não desenhada.' });
      }

      const serverInstallment = calculateInstallmentValue(loanAmount, installments);
      const totalPayable = Math.round(serverInstallment * installments * 100) / 100;
      const protocol = generateProtocol(contractsStore);
      const accessToken = crypto.randomBytes(12).toString('hex');
      const certificateCode = `ICP-RP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const signedAt = new Date().toISOString();
      const rawUa = sanitizeString(req.headers['user-agent'] || 'Navegador Web', 120);

      const unsignedRecord: Omit<SignedLoanContract, 'integrityHash'> = {
        protocol,
        accessToken,
        certificateCode,
        signedAt,
        signerDevice: rawUa,
        status: 'SIGNED_VERIFIED',
        loanAmount,
        installments,
        installmentValue: serverInstallment,
        monthlyRatePercent: COMPANY_INFO.monthlyRatePercent,
        totalPayable,
        firstDueDate: firstDueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        fullName,
        cpf,
        rgOrCnh,
        birthDate,
        maritalStatus: maritalStatus || 'Não informado',
        occupation: occupation || 'Não informado',
        monthlyIncome: monthlyIncome || 'Não informada',
        phone,
        email,
        cep,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        bankName,
        accountType,
        agency,
        accountNumber,
        pixKeyType,
        pixKey,
        acceptedTerms: true,
        acceptedDataTruth: true,
        signatureDataUrl,
      };

      const integrityHash = computeIntegrityHash(unsignedRecord);
      const signedContract: SignedLoanContract = {
        ...unsignedRecord,
        integrityHash,
      };

      contractsStore.set(protocol.toUpperCase(), signedContract);
      persistContracts(contractsStore);

      const audit = buildVerificationAudit(signedContract);
      return res.status(201).json({ contract: signedContract, audit });
    } catch (err) {
      console.error('Erro ao registrar contrato:', err);
      return res.status(500).json({ error: 'Erro interno ao registrar o contrato.' });
    }
  });

  app.get('/api/contracts/lookup', (req, res) => {
    const protocol = sanitizeString(req.query.protocol, 40).toUpperCase();
    const token = sanitizeString(req.query.token, 64);
    const cpf = onlyDigits(sanitizeString(req.query.cpf, 20));

    if (!protocol) {
      return res.status(400).json({ error: 'Informe o número do protocolo do contrato.' });
    }

    const contract = contractsStore.get(protocol);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato não encontrado. Verifique o número de protocolo.' });
    }

    const authorizedByToken = Boolean(token && timingSafeMatch(token, contract.accessToken));
    const authorizedByCpf = Boolean(cpf.length === 11 && timingSafeMatch(cpf, onlyDigits(contract.cpf)));

    if (!authorizedByToken && !authorizedByCpf) {
      return res.status(403).json({
        error: 'Chave de autenticação ou CPF não confere com o protocolo informado.',
      });
    }

    const audit = buildVerificationAudit(contract);
    return res.json({ contract, audit });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RP Financeira server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
