import crypto from 'node:crypto';
import { Hono } from 'hono';
import postgres, { type Sql } from 'postgres';
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

interface ApiConfig {
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSCODE?: string;
}

interface ApiRequest {
  config: ApiConfig;
  authUser?: StoredUser;
  db: Sql;
  headers: { authorization: string; 'user-agent': string };
  body: Record<string, unknown>;
  query: Record<string, string>;
  params: Record<string, string>;
}

function jsonResponse() {
  let status = 200;
  return {
    status(code: number) {
      status = code;
      return this;
    },
    json(data: unknown) {
      return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    },
  };
}

type ApiResponse = ReturnType<typeof jsonResponse>;
type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<Response>;

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

function createSessionToken(user: StoredUser, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      usr: user.username,
      rol: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string, secret: string): { sub: string; usr: string; rol: UserRole } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
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

function generateProtocol(): string {
  return 'RP-' + new Date().getFullYear() + '-' + crypto.randomBytes(10).toString('hex').toUpperCase();
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

export function createApi() {
  const app = new Hono<{ Bindings: ApiConfig }>();
  function route(method: string, path: string, handler: ApiHandler, requiresAuth = false) {
    app.on(method, path, async (context) => {
      const config = context.env;
      const res = jsonResponse();
      if (!config.DATABASE_URL || (config.SESSION_SECRET?.length ?? 0) < 32) {
        return res.status(503).json({ error: 'Servidor ainda não configurado.' });
      }
      let body: Record<string, unknown> = {};
      if (method === 'POST' || method === 'PATCH') {
        try {
          const reader = context.req.raw.body?.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          if (reader) {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                return res.status(413).json({ error: 'Corpo da requisição muito grande.' });
              }
              chunks.push(value);
            }
          }
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return res.status(400).json({ error: 'Corpo da requisição inválido.' });
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return res.status(400).json({ error: 'Corpo da requisição inválido.' });
        }
      }
      const db = postgres(config.DATABASE_URL, { ssl: 'verify-full', prepare: false, max: 1, connect_timeout: 8 });
      const req: ApiRequest = {
        config,
        db,
        body,
        headers: {
          authorization: context.req.header('authorization') ?? '',
          'user-agent': context.req.header('user-agent') ?? '',
        },
        query: context.req.query(),
        params: context.req.param(),
      };
      try {
        if (requiresAuth) {
          const denied = await requireAuth(req, res);
          if (denied) return denied;
        }
        return await handler(req, res);
      } catch (error) {
        console.error('Falha na API', (error as { code?: string }).code ?? 'unknown');
        return res.status(503).json({ error: 'Banco de dados indisponível. Tente novamente.' });
      } finally {
        await db.end({ timeout: 0 });
      }
    });
  }

  const findUserById = async (db: Sql, id: string) =>
    (await db<{ record: StoredUser }[]>`select record from rp_financeira.panel_users where id = ${id}`)[0]?.record;
  const findUserByUsername = async (db: Sql, username: string) =>
    (await db<{ record: StoredUser }[]>`select record from rp_financeira.panel_users where username = ${username}`)[0]?.record;
  const findActiveAgentByCode = async (db: Sql, code: string) =>
    (await db<{ record: StoredUser }[]>`select record from rp_financeira.panel_users where agent_code = ${code}
      and record->>'active' = 'true'`)[0]?.record;

  const requireAuth = async (req: ApiRequest, res: ApiResponse) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Sessão expirada ou não autenticada.' });
    }
    const decoded = verifySessionToken(token, req.config.SESSION_SECRET!);
    if (!decoded) {
      return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
    }
    const user = await findUserById(req.db, decoded.sub);
    if (!user || !user.active) {
      return res.status(403).json({ error: 'Usuário desativado ou não encontrado.' });
    }
    req.authUser = user;
  };

  route('GET', '/api/health', async (req, res) => {
    await req.db`select id from rp_financeira.panel_users limit 1`;
    return res.json({ ok: true, storage: 'postgresql' });
  });

  route('GET', '/api/auth/status', async (req, res) => {
    await req.db`select id from rp_financeira.panel_users limit 1`;
    return res.json({ needsAdminSetup: false });
  });

  route('POST', '/api/auth/login', async (req, res) => {
    const username = sanitizeString(req.body?.username, 60).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password || password.length > 128) {
      return res.status(400).json({ error: 'Informe usuário e senha válidos.' });
    }

    // Environment-configured Admin Master overrides any local fallback
    const envPasscode = (req.config.ADMIN_PASSCODE || '').trim();
    const envUsername = (req.config.ADMIN_USERNAME || 'coringa').trim().toLowerCase();

    if (envPasscode && timingSafeTextEqual(username, envUsername)) {
      if (!timingSafeTextEqual(password, envPasscode)) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      }
      let adminUser = await findUserByUsername(req.db, envUsername);
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
        await req.db`insert into rp_financeira.panel_users (id, username, agent_code, record)
          values (${adminUser.id}, ${adminUser.username}, ${adminUser.agentCode}, ${req.db.json({ ...adminUser })})
          on conflict (username) do nothing`;
        adminUser = await findUserByUsername(req.db, envUsername);

      }
      if (adminUser?.role !== 'admin' || !adminUser.active) {
        return res.status(403).json({ error: 'Administrador indisponível.' });
      }
      const token = createSessionToken(adminUser, req.config.SESSION_SECRET!);
      return res.json({ token, user: toPublicUser(adminUser) });
    }

    const user = await findUserByUsername(req.db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Este acesso está pausado pelo administrador.' });
    }

    const token = createSessionToken(user, req.config.SESSION_SECRET!);
    return res.json({ token, user: toPublicUser(user) });
  });

  route('GET', '/api/auth/me', async (req, res) => {
    return res.json({ user: toPublicUser(req.authUser!) });
  }, true);

  // Validate agent link & log visit
  route('POST', '/api/visits', async (req, res) => {
    const rawCode = sanitizeString(req.body?.agentCode, 50);
    const agentCode = sanitizeSlug(rawCode);
    if (!agentCode) {
      return res.status(400).json({ valid: false, error: 'Código de atendimento inválido.' });
    }
    const agent = await findActiveAgentByCode(req.db, agentCode);
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
    await req.db`insert into rp_financeira.visits (id, agent_id, visited_at, record)
      values (${visit.id}, ${visit.agentId}, ${visit.visitedAt}, ${req.db.json({ ...visit })})`;

    return res.status(201).json({
      valid: true,
      agentName: agent.name,
      agentCode: agent.agentCode,
    });
  });

  // Panel Dashboard (Admin Master or Employee)
  route('GET', '/api/panel/dashboard', async (req, res) => {
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

    const db = req.db;
    const begin = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    const agentScope = authUser.role === 'admin' ? db`true` : db`agent_id = ${authUser.id}`;
    const visitsInRange = (await db<{ record: VisitRecord }[]>`select record from rp_financeira.visits
      where visited_at between ${begin} and ${end} and ${agentScope}`).map((row) => row.record);
    const contractsInRange = (await db<{ record: SignedLoanContract }[]>`select record from rp_financeira.contracts
      where signed_at between ${begin} and ${end} and ${agentScope}`).map((row) => row.record);

    const filteredVisits = filterAgentId
      ? visitsInRange.filter((v) => v.agentId === filterAgentId)
      : visitsInRange;
    const filteredContracts = (
      filterAgentId
        ? contractsInRange.filter((c) => c.agentId === filterAgentId)
        : contractsInRange
    ).sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());

    const visibleUsers =
      authUser.role === 'admin'
        ? (await db<{ record: StoredUser }[]>`select record from rp_financeira.panel_users`).map((row) => row.record)
        : [authUser];

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
  }, true);

  // Admin Master: Manage Employees
  route('POST', '/api/panel/employees', async (req, res) => {
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

    const inserted = await req.db`insert into rp_financeira.panel_users (id, username, agent_code, record)
      values (${newEmployee.id}, ${newEmployee.username}, ${newEmployee.agentCode}, ${req.db.json({ ...newEmployee })})
      on conflict do nothing returning id`;
    if (!inserted.length) {
      return res.status(409).json({ error: 'Este login ou código de link já está em uso.' });
    }

    return res.status(201).json({ employee: toPublicUser(newEmployee) });
  }, true);

  route('PATCH', '/api/panel/employees/:id', async (req, res) => {
    if (req.authUser!.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    }
    const target = await findUserById(req.db, String(req.params.id));
    if (!target) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    const changes: Partial<StoredUser> = {};
    if (typeof req.body?.active === 'boolean' && target.role !== 'admin') {
      changes.active = req.body.active;
    }
    if (typeof req.body?.password === 'string' && req.body.password.length >= 4 && req.body.password.length <= 128) {
      changes.passwordHash = hashPassword(req.body.password);
    }

    const [updated] = await req.db<{ record: StoredUser }[]>`update rp_financeira.panel_users
      set record = record || ${req.db.json({ ...changes })} where id = ${target.id} returning record`;
    if (!updated) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    return res.json({ employee: toPublicUser(updated.record) });
  }, true);

  route('DELETE', '/api/panel/employees/:id', async (req, res) => {
    if (req.authUser!.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    }
    const target = await findUserById(req.db, String(req.params.id));
    if (!target) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Não é possível excluir o Administrador Master.' });
    }
    await req.db`delete from rp_financeira.panel_users where id = ${target.id}`;
    return res.json({ ok: true });
  }, true);

  // Contract submission (requires valid active agentCode)
  route('POST', '/api/contracts', async (req, res) => {
    try {
      const body = req.body as Partial<LoanContractInput>;
      const agentCode = sanitizeSlug(sanitizeString(body.agentCode, 50));
      const agent = agentCode ? await findActiveAgentByCode(req.db, agentCode) : undefined;
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
      const protocol = generateProtocol();
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

      await req.db`insert into rp_financeira.contracts (protocol, agent_id, signed_at, record)
        values (${protocol}, ${agent.id}, ${signedAt}, ${req.db.json({ ...signedContract })})`;

      const audit = buildVerificationAudit(signedContract);
      return res.status(201).json({ contract: signedContract, audit });
    } catch (err) {
      console.error('Falha ao registrar contrato', (err as { code?: string }).code ?? 'unknown');
      return res.status(500).json({ error: 'Erro interno ao registrar o contrato.' });
    }
  });

  route('GET', '/api/contracts/lookup', async (req, res) => {
    const protocol = sanitizeString(req.query.protocol, 40).toUpperCase();
    const token = sanitizeString(req.query.token, 64);
    const cpf = onlyDigits(sanitizeString(req.query.cpf, 20));

    if (!protocol) {
      return res.status(400).json({ error: 'Informe o número do protocolo do contrato.' });
    }

    const [row] = await req.db<{ record: SignedLoanContract }[]>`select record
      from rp_financeira.contracts where protocol = ${protocol}`;
    const contract = row?.record;
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

  app.notFound(() => jsonResponse().status(404).json({ error: 'Rota não encontrada.' }));
  return app;
}
