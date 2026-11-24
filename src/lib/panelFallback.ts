import type {
  DashboardEmployeeStat,
  DashboardPayload,
  DatePreset,
  PanelUserPublic,
  SignedLoanContract,
  VisitRecord,
} from '../types/contract';
import { getStoredLocalContracts } from './portableContract';

interface LocalStoredUser extends PanelUserPublic {
  passwordHash: string;
}

const USERS_KEY = 'rp_panel_users_v1';
const VISITS_KEY = 'rp_panel_visits_v1';

async function hashWithSalt(password: string, existingSalt?: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  if (!existingSalt) {
    window.crypto.getRandomValues(saltBytes);
  }
  const salt =
    existingSalt ||
    Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${salt}:${hash}`;
}

async function verifyPasswordLocal(password: string, stored: string): Promise<boolean> {
  const [salt] = stored.split(':');
  if (!salt) return false;
  const candidate = await hashWithSalt(password, salt);
  return candidate === stored;
}

function readLocalUsers(): LocalStoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LocalStoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function readLocalVisits(): VisitRecord[] {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalVisits(visits: VisitRecord[]): void {
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

export function sanitizeAgentSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function localNeedsAdminSetup(): boolean {
  return !readLocalUsers().some((u) => u.role === 'admin');
}

export async function localSetupAdmin(
  username: string,
  password: string,
  name: string
): Promise<{ token: string; user: PanelUserPublic }> {
  const users = readLocalUsers();
  if (users.some((u) => u.role === 'admin')) {
    throw new Error('Administrador Master já configurado.');
  }
  const cleanUser = username.trim().toLowerCase();
  if (cleanUser.length < 3 || !/^[a-z0-9_.-]+$/.test(cleanUser)) {
    throw new Error('Usuário inválido (mínimo 3 caracteres alfanuméricos).');
  }
  if (password.length < 4 || password.length > 128) {
    throw new Error('A senha deve ter entre 4 e 128 caracteres.');
  }
  const admin: LocalStoredUser = {
    id: window.crypto.randomUUID(),
    username: cleanUser,
    name: name.trim() || 'Administrador Master',
    role: 'admin',
    agentCode: sanitizeAgentSlug(cleanUser) || 'master',
    active: true,
    createdAt: new Date().toISOString(),
    passwordHash: await hashWithSalt(password),
  };
  writeLocalUsers([admin, ...users]);
  const { passwordHash: _ignored, ...pub } = admin;
  return { token: `local:${admin.id}`, user: pub };
}

export async function localLogin(
  username: string,
  password: string
): Promise<{ token: string; user: PanelUserPublic }> {
  const users = readLocalUsers();
  const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!found || !(await verifyPasswordLocal(password, found.passwordHash))) {
    throw new Error('Usuário ou senha incorretos.');
  }
  if (!found.active) {
    throw new Error('Este acesso está pausado pelo administrador.');
  }
  const { passwordHash: _ignored, ...pub } = found;
  return { token: `local:${found.id}`, user: pub };
}

export function localGetUserByToken(token: string): PanelUserPublic | null {
  if (!token.startsWith('local:')) return null;
  const id = token.slice(6);
  const found = readLocalUsers().find((u) => u.id === id && u.active);
  if (!found) return null;
  const { passwordHash: _ignored, ...pub } = found;
  return pub;
}

export function localRegisterVisit(
  agentCode: string
): { valid: boolean; agentName?: string; agentCode?: string; agentId?: string } {
  const slug = sanitizeAgentSlug(agentCode);
  const users = readLocalUsers();
  const agent = users.find((u) => u.agentCode === slug && u.active);
  if (!agent) {
    return { valid: false };
  }
  const visits = readLocalVisits();
  visits.push({
    id: window.crypto.randomUUID(),
    agentId: agent.id,
    agentCode: agent.agentCode,
    visitedAt: new Date().toISOString(),
  });
  writeLocalVisits(visits);
  return { valid: true, agentName: agent.name, agentCode: agent.agentCode, agentId: agent.id };
}

export async function localCreateEmployee(
  name: string,
  username: string,
  password: string,
  agentCode: string
): Promise<PanelUserPublic> {
  const users = readLocalUsers();
  const cleanUser = username.trim().toLowerCase();
  const slug = sanitizeAgentSlug(agentCode || cleanUser);

  if (name.trim().length < 3) {
    throw new Error('Informe o nome completo do funcionário.');
  }
  if (cleanUser.length < 3 || !/^[a-z0-9_.-]+$/.test(cleanUser)) {
    throw new Error('Usuário inválido (use letras, números, ponto ou hífen).');
  }
  if (password.length < 4 || password.length > 128) {
    throw new Error('A senha deve ter entre 4 e 128 caracteres.');
  }
  if (slug.length < 2) {
    throw new Error('Código do link inválido.');
  }
  if (users.some((u) => u.username.toLowerCase() === cleanUser)) {
    throw new Error('Já existe um usuário com este login.');
  }
  if (users.some((u) => u.agentCode === slug)) {
    throw new Error('Este código de link já está em uso.');
  }
  const emp: LocalStoredUser = {
    id: window.crypto.randomUUID(),
    username: cleanUser,
    name: name.trim(),
    role: 'employee',
    agentCode: slug,
    active: true,
    createdAt: new Date().toISOString(),
    passwordHash: await hashWithSalt(password),
  };
  users.push(emp);
  writeLocalUsers(users);
  const { passwordHash: _ignored, ...pub } = emp;
  return pub;
}

export function localToggleEmployee(id: string, active: boolean): void {
  const users = readLocalUsers();
  const target = users.find((u) => u.id === id && u.role !== 'admin');
  if (target) {
    target.active = active;
    writeLocalUsers(users);
  }
}

export function localDeleteEmployee(id: string): void {
  const users = readLocalUsers().filter((u) => !(u.id === id && u.role !== 'admin'));
  writeLocalUsers(users);
}

function getBounds(preset: DatePreset, customStart?: string, customEnd?: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
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
      const s = customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0;
      const e = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : endOfToday;
      return { startMs: Number.isFinite(s) ? s : 0, endMs: Number.isFinite(e) ? e : endOfToday };
    }
  }
}

export function localGetDashboard(
  user: PanelUserPublic,
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
  filterAgentId?: string
): DashboardPayload {
  const { startMs, endMs } = getBounds(preset, customStart, customEnd);
  const users = readLocalUsers();
  const visits = readLocalVisits().filter((v) => {
    const t = new Date(v.visitedAt).getTime();
    return t >= startMs && t <= endMs;
  });
  const contracts: SignedLoanContract[] = getStoredLocalContracts().filter((c) => {
    const t = new Date(c.signedAt).getTime();
    return t >= startMs && t <= endMs;
  });

  const targetAgent = user.role === 'admin' ? filterAgentId : user.id;
  const filteredVisits = targetAgent ? visits.filter((v) => v.agentId === targetAgent) : visits;
  const filteredContracts = (
    targetAgent ? contracts.filter((c) => c.agentId === targetAgent) : contracts
  ).sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());

  const visibleUsers = user.role === 'admin' ? users : users.filter((u) => u.id === user.id);
  const employees: DashboardEmployeeStat[] = visibleUsers.map((u) => {
    const { passwordHash: _ignored, ...pub } = u;
    const empVisits = visits.filter((v) => v.agentId === u.id).length;
    const empContracts = contracts.filter((c) => c.agentId === u.id);
    return {
      ...pub,
      visitsCount: empVisits,
      contractsCount: empContracts.length,
      totalVolume: empContracts.reduce((sum, c) => sum + c.loanAmount, 0),
    };
  });

  const totalVisits = filteredVisits.length;
  const totalContracts = filteredContracts.length;
  const totalVolume = filteredContracts.reduce((sum, c) => sum + c.loanAmount, 0);
  const conversionRate = totalVisits > 0 ? Math.round((totalContracts / totalVisits) * 1000) / 10 : 0;

  return {
    user,
    totalVisits,
    totalContracts,
    totalVolume,
    conversionRate,
    employees,
    contracts: filteredContracts,
  };
}
