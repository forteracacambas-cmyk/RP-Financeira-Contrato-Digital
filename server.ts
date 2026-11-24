import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { calculateInstallmentValue, COMPANY_INFO, isValidCPF, onlyDigits } from './src/lib/loanTable.ts';
import type {
  ContractVerificationAudit,
  DashboardEmployeeStat,
  LoanContractInput,
  PanelUserPublic,
  SignedLoanContract,
  UserRole,
  VisitRecord,
} from './src/types/contract.ts';

interface StoredUser extends PanelUserPublic {
  passwordHash: string;
}

interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONTRACTS_FILE = path.join(DATA_DIR, 'contracts.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const file of [CONTRACTS_FILE, USERS_FILE, VISITS_FILE]) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf-8');
    }
  }
}

function readJsonArray<T>(filePath: string): T[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err);
    return [];
  }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureStorage();
  const tmpFile = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSessionToken(user: StoredUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      usr: user.username,
      rol: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { sub: string; usr: string; rol: UserRole } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!timingSafeTextEqual(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { sub: String(parsed.sub), usr: String(parsed.usr), rol: parsed.rol as UserRole };
  } catch {
    return null;
  }
}

function toPublicUser(user: StoredUser): PanelUserPublic {
  const { passwordHash: _ignored, ...pub } = user;
  return pub;
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
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
  const expectedHash = computeIntegrityHash({ ...contract });
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
    signaturePresent:
      contract.signatureDataUrl.startsWith('data:image/png;base64,') &&
      contract.signatureDataUrl.length > 500,
    hashVerified: contract.integrityHash === expectedHash,
  };
}

function getDateRangeBounds(
  preset: string,
  customStart?: string,
  customEnd?: string,
  tzOffsetMinutes?: number
): { startMs: number; endMs: number } {
  // Default to America/Sao_Paulo (UTC-3 => +180 min offset) when client tzOffset is omitted
  const offsetMin = Number.isFinite(tzOffsetMinutes) ? (tzOffsetMinutes as number) : 180;
  const offsetMs = offsetMin * 60 * 1000;
  const shiftedNow = new Date(Date.now() - offsetMs);
  const startOfToday =
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate(), 0, 0, 0, 0) +
    offsetMs;
  const endOfToday =
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate(), 23, 59, 59, 999) +
    offsetMs;
  const DAY = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'today':
      return { startMs: startOfToday, endMs: endOfToday };
    case 'yesterday':
      return { startMs: startOfToday - DAY, endMs: startOfToday - 1 };
    case '7d':
      return { startMs: startOfToday - 6 * DAY, endMs: endOfToday };
    case '15d':
      return { startMs: startOfToday - 14 * DAY, endMs: endOfToday };
    case '30d':
      return { startMs: startOfToday - 29 * DAY, endMs: endOfToday };
    case 'custom': {
      const parseYmd = (ymd: string, endOfDay: boolean): number => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
        if (!m) return endOfDay ? endOfToday : 0;
        const base = Date.UTC(
          Number(m[1]),
          Number(m[2]) - 1,
          Number(m[3]),
          endOfDay ? 23 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 999 : 0
        );
        return base + offsetMs;
      };
      return {
        startMs: customStart ? parseYmd(customStart, false) : 0,
        endMs: customEnd ? parseYmd(customEnd, true) : endOfToday,
      };
    }
    default:
      return { startMs: 0, endMs: endOfToday };
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  const contractsList = readJsonArray<SignedLoanContract>(CONTRACTS_FILE);
  const contractsStore = new Map<string, SignedLoanContract>();
  for (const c of contractsList) {
    if (c && c.protocol) contractsStore.set(c.protocol.toUpperCase(), c);
  }

  let usersList = readJsonArray<StoredUser>(USERS_FILE);
  let visitsList = readJsonArray<VisitRecord>(VISITS_FILE);

  const findUserById = (id: string) => usersList.find((u) => u.id === id);
  const findUserByUsername = (username: string) =>
    usersList.find((u) => u.username.toLowerCase() === username.toLowerCase());
  const findActiveAgentByCode = (code: string) =>
    usersList.find((u) => u.agentCode === code && u.active);

  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Sessão expirada ou não autenticada.' });
    }
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
    }
    const user = findUserById(decoded.sub);
    if (!user || !user.active) {
      return res.status(403).json({ error: 'Usuário desativado ou não encontrado.' });
    }
    req.authUser = user;
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, company: COMPANY_INFO.name, cnpj: COMPANY_INFO.cnpj });
  });

  // Auth status & one-time Admin Master bootstrap
  app.get('/api/auth/status', (_req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const hasAdmin = usersList.some((u) => u.role === 'admin');
    res.json({ needsAdminSetup: !envPasscode && !hasAdmin });
  });

  app.post('/api/auth/setup', (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const hasAdmin = usersList.some((u) => u.role === 'admin');
    if (envPasscode || hasAdmin) {
      return res.status(409).json({ error: 'Administrador Master já configurado.' });
    }

    const username = sanitizeString(req.body?.username, 40).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = sanitizeString(req.body?.name, 80) || 'Administrador Master';

    if (username.length < 3 || !/^[a-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Usuário inválido (mínimo 3 caracteres alfanuméricos).' });
    }
    if (password.length < 4 || password.length > 128) {
      return res.status(400).json({ error: 'A senha deve ter entre 4 e 128 caracteres.' });
    }

    const agentCode = sanitizeSlug(username) || 'master';
    const adminUser: StoredUser = {
      id: crypto.randomUUID(),
      username,
      name,
      role: 'admin',
      agentCode,
      active: true,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };

    usersList = [adminUser, ...usersList];
    writeJsonAtomic(USERS_FILE, usersList);

    const token = createSessionToken(adminUser);
    return res.status(201).json({ token, user: toPublicUser(adminUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = sanitizeString(req.body?.username, 60).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password || password.length > 128) {
      return res.status(400).json({ error: 'Informe usuário e senha válidos.' });
    }

    // Environment-configured Admin Master overrides any local fallback
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const envUsername = (process.env.ADMIN_USERNAME || 'coringa').trim().toLowerCase();

    if (envPasscode && timingSafeTextEqual(username, envUsername)) {
      if (!timingSafeTextEqual(password, envPasscode)) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      }
      let adminUser = usersList.find((u) => u.role === 'admin');
      if (!adminUser) {
        adminUser = {
          id: crypto.randomUUID(),
          username: envUsername,
          name: 'Administrador Master',
          role: 'admin',
          agentCode: sanitizeSlug(envUsername) || 'master',
          active: true,
          createdAt: new Date().toISOString(),
          passwordHash: hashPassword(envPasscode),
        };
        usersList = [adminUser, ...usersList];
        writeJsonAtomic(USERS_FILE, usersList);
      }
      const token = createSessionToken(adminUser);
      return res.json({ token, user: toPublicUser(adminUser) });
    }

    const user = findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Este acesso está pausado pelo administrador.' });
    }

    const token = createSessionToken(user);
    return res.json({ token, user: toPublicUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    return res.json({ user: toPublicUser(req.authUser!) });
  });

  // Validate agent link & log visit
  app.post('/api/visits', (req, res) => {
    const rawCode = sanitizeString(req.body?.agentCode, 50);
    const agentCode = sanitizeSlug(rawCode);
    if (!agentCode) {
      return res.status(400).json({ valid: false, error: 'Código de atendimento inválido.' });
    }
    const agent = findActiveAgentByCode(agentCode);
    if (!agent) {
      return res.status(404).json({
        valid: false,
        error: 'Link de atendimento inválido ou desativado.',
      });
    }

    const visit: VisitRecord = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      agentCode: agent.agentCode,
      visitedAt: new Date().toISOString(),
    };
    visitsList.push(visit);
    writeJsonAtomic(VISITS_FILE, visitsList);

    return res.status(201).json({
      valid: true,
      agentName: agent.name,
      agentCode: agent.agentCode,
    });
  });

  // Panel Dashboard (Admin Master or Employee)
  app.get('/api/panel/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const preset = sanitizeString(req.query.preset, 20) || 'today';
    const customStart = sanitizeString(req.query.start, 20);
    const customEnd = sanitizeString(req.query.end, 20);
    const rawTzOffset = req.query.tzOffset !== undefined ? Number(req.query.tzOffset) : undefined;
    const tzOffset = rawTzOffset !== undefined && Number.isFinite(rawTzOffset) && Math.abs(rawTzOffset) <= 840
      ? rawTzOffset
      : undefined;
    const filterAgentId =
      authUser.role === 'admin' ? sanitizeString(req.query.agentId, 60) : authUser.id;

    const { startMs, endMs } = getDateRangeBounds(preset, customStart, customEnd, tzOffset);

    const allContracts = Array.from(contractsStore.values());
    const visitsInRange = visitsList.filter((v) => {
      const t = new Date(v.visitedAt).getTime();
      return t >= startMs && t <= endMs;
    });
    const contractsInRange = allContracts.filter((c) => {
      const t = new Date(c.signedAt).getTime();
      return t >= startMs && t <= endMs;
    });

    const filteredVisits = filterAgentId
      ? visitsInRange.filter((v) => v.agentId === filterAgentId)
      : visitsInRange;
    const filteredContracts = (
      filterAgentId
        ? contractsInRange.filter((c) => c.agentId === filterAgentId)
        : contractsInRange
    ).sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());

    const visibleUsers =
      authUser.role === 'admin' ? usersList : usersList.filter((u) => u.id === authUser.id);

    const employeesStats: DashboardEmployeeStat[] = visibleUsers.map((u) => {
      const empVisits = visitsInRange.filter((v) => v.agentId === u.id).length;
      const empContracts = contractsInRange.filter((c) => c.agentId === u.id);
      const empVolume = empContracts.reduce((sum, c) => sum + c.loanAmount, 0);
      return {
        ...toPublicUser(u),
        visitsCount: empVisits,
        contractsCount: empContracts.length,
        totalVolume: empVolume,
      };
    });

    const totalVisits = filteredVisits.length;
    const totalContracts = filteredContracts.length;
    const totalVolume = filteredContracts.reduce((sum, c) => sum + c.loanAmount, 0);
    const conversionRate =
      totalVisits > 0 ? Math.round((totalContracts / totalVisits) * 1000) / 10 : 0;

    return res.json({
      user: toPublicUser(authUser),
      totalVisits,
      totalContracts,
      totalVolume,
      conversionRate,
      employees: employeesStats,
      contracts: filteredContracts,
    });
  });

  // Admin Master: Manage Employees
  app.post('/api/panel/employees', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser!.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas o Administrador Master pode cadastrar funcionários.' });
    }

    const name = sanitizeString(req.body?.name, 80);
    const username = sanitizeString(req.body?.username, 40).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestedSlug = sanitizeSlug(sanitizeString(req.body?.agentCode, 40) || username);

    if (name.length < 3) {
      return res.status(400).json({ error: 'Informe o nome completo do funcionário.' });
    }
    if (username.length < 3 || !/^[a-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Usuário inválido (use letras, números, ponto ou hífen).' });
    }
    if (password.length < 4 || password.length > 128) {
      return res.status(400).json({ error: 'A senha do funcionário deve ter entre 4 e 128 caracteres.' });
    }
    if (!requestedSlug || requestedSlug.length < 2) {
      return res.status(400).json({ error: 'Código do link inválido.' });
    }
    if (findUserByUsername(username)) {
      return res.status(409).json({ error: 'Já existe um usuário com este login.' });
    }
    if (usersList.some((u) => u.agentCode === requestedSlug)) {
      return res.status(409).json({ error: 'Este código de link já está em uso por outro usuário.' });
    }

    const newEmployee: StoredUser = {
      id: crypto.randomUUID(),
      username,
      name,
      role: 'employee',
      agentCode: requestedSlug,
      active: true,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };

    usersList.push(newEmployee);
    writeJsonAtomic(USERS_FILE, usersList);

    return res.status(201).json({ employee: toPublicUser(newEmployee) });
  });

  app.patch('/api/panel/employees/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser!.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    }
    const target = findUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    if (typeof req.body?.active === 'boolean' && target.role !== 'admin') {
      target.active = req.body.active;
    }
    if (typeof req.body?.password === 'string' && req.body.password.length >= 4 && req.body.password.length <= 128) {
      target.passwordHash = hashPassword(req.body.password);
    }

    writeJsonAtomic(USERS_FILE, usersList);
    return res.json({ employee: toPublicUser(target) });
  });

  app.delete('/api/panel/employees/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser!.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    }
    const target = findUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Não é possível excluir o Administrador Master.' });
    }
    usersList = usersList.filter((u) => u.id !== target.id);
    writeJsonAtomic(USERS_FILE, usersList);
    return res.json({ ok: true });
  });

  // Contract submission (requires valid active agentCode)
  app.post('/api/contracts', (req, res) => {
    try {
      const body = req.body as Partial<LoanContractInput>;
      const agentCode = sanitizeSlug(sanitizeString(body.agentCode, 50));
      const agent = agentCode ? findActiveAgentByCode(agentCode) : undefined;
      if (!agent) {
        return res.status(403).json({
          error: 'Link de atendimento inválido ou desativado. Solicite um link válido a um consultor autorizado.',
        });
      }

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
      if (onlyDigits(cep).length !== 8 || street.length < 3 || number.length < 1 || city.length < 2 || state.length !== 2) {
        return res.status(400).json({ error: 'Preencha um CEP válido e o endereço completo corretamente.' });
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
        agentId: agent.id,
        agentName: agent.name,
        agentCode: agent.agentCode,
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
      writeJsonAtomic(CONTRACTS_FILE, Array.from(contractsStore.values()));

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

    const authorizedByToken = Boolean(token && timingSafeTextEqual(token, contract.accessToken));
    const authorizedByCpf = Boolean(cpf.length === 11 && timingSafeTextEqual(cpf, onlyDigits(contract.cpf)));

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
