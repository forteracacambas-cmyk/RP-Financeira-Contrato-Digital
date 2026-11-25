import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Share2,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { COMPANY_INFO } from '../lib/loanTable';
import { sanitizeAgentSlug } from '../lib/panelFallback';
import { buildLocalAudit } from '../lib/portableContract';
import type {
  DashboardPayload,
  DatePreset,
  PanelUserPublic,
  SignedLoanContract,
} from '../types/contract';
import { BrandLogo } from './BrandLogo';
import { SignedReceiptView } from './SignedReceiptView';

interface PanelViewProps {
  onBackToSite: () => void;
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '15d', label: '15 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'custom', label: 'Personalizado' },
];

const PANEL_SESSION_STORAGE_KEY = 'rp_panel_session_token';

export const PanelView: React.FC<PanelViewProps> = ({ onBackToSite }) => {
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<PanelUserPublic | null>(null);
  const [authMode, setAuthMode] = useState<'loading' | 'login' | 'authenticated'>('loading');

  // Login / Setup inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Dashboard filters & data
  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Employee creation form (Admin Master)
  const [empName, setEmpName] = useState('');
  const [empUsername, setEmpUsername] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [empCodeManual, setEmpCodeManual] = useState(false);
  const [empError, setEmpError] = useState('');
  const [empSuccess, setEmpSuccess] = useState('');
  const [empSubmitting, setEmpSubmitting] = useState(false);

  // Copy & QR states
  const [copiedCode, setCopiedCode] = useState('');
  const [showMyQr, setShowMyQr] = useState(false);
  const [myQrUrl, setMyQrUrl] = useState('');
  const [selectedContract, setSelectedContract] = useState<SignedLoanContract | null>(null);

  // Check backend status and auto-restore saved session on mount
  useEffect(() => {
    let active = true;
    const savedToken = (() => {
      try {
        return window.localStorage.getItem(PANEL_SESSION_STORAGE_KEY) || '';
      } catch {
        return '';
      }
    })();

    const restoreOrCheckStatus = async () => {
      try {
        if (savedToken) {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (meRes.ok && meRes.headers.get('content-type')?.includes('application/json')) {
            const meJson = await meRes.json();
            if (!active) return;
            setToken(savedToken);
            setUser(meJson.user);
            setAuthMode('authenticated');
            return;
          }
          if (meRes.status === 401 || meRes.status === 403) {
            try {
              window.localStorage.removeItem(PANEL_SESSION_STORAGE_KEY);
            } catch {
              // Ignore storage error
            }
          }
        }

        const statusRes = await fetch('/api/auth/status');
        const contentType = statusRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('STATIC_HOST');
        }
        if (!statusRes.ok) throw new Error('Servidor indisponível.');
        if (!active) return;
        setAuthMode('login');
      } catch {
        if (!active) return;
        setAuthMode('login');
        setAuthError('Servidor indisponível. Aguarde e tente entrar novamente.');
      }
    };

    void restoreOrCheckStatus();
    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(
    async (
      activeToken: string,
      currentPreset: DatePreset,
      start: string,
      end: string,
      agentFilter: string
    ) => {
      setDashLoading(true);
      try {
        const qs = new URLSearchParams({
          preset: currentPreset,
          tzOffset: String(new Date().getTimezoneOffset()),
          ...(currentPreset === 'custom' ? { start, end } : {}),
          ...(agentFilter ? { agentId: agentFilter } : {}),
        });
        const res = await fetch(`/api/panel/dashboard?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (res.status === 401 || res.status === 403) {
          try {
            window.localStorage.removeItem(PANEL_SESSION_STORAGE_KEY);
          } catch {
            // Ignore storage error
          }
          setToken('');
          setUser(null);
          setDashboard(null);
          setSelectedAgentId('');
          setSelectedContract(null);
          setAuthMode('login');
          setAuthError('Sua sessão expirou ou o acesso foi desativado. Entre novamente.');
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as DashboardPayload;
          setDashboard(json);
        }
      } finally {
        setDashLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (authMode === 'authenticated' && token && user) {
      void loadDashboard(token, preset, customStart, customEnd, selectedAgentId);
    }
  }, [authMode, token, user, preset, customStart, customEnd, selectedAgentId, loadDashboard]);

  // Generate QR code for current user's unique link
  const myAgentLink = user ? `${window.location.origin}/?ref=${encodeURIComponent(user.agentCode)}` : '';
  useEffect(() => {
    if (!showMyQr || !myAgentLink) return;
    QRCode.toDataURL(myAgentLink, { width: 220, margin: 2 })
      .then(setMyQrUrl)
      .catch(() => setMyQrUrl(''));
  }, [showMyQr, myAgentLink]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Servidor indisponível. Tente novamente.');
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Usuário ou senha incorretos.');
      try {
        window.localStorage.setItem(PANEL_SESSION_STORAGE_KEY, json.token);
      } catch {
        // Ignore storage quota errors
      }
      setSelectedAgentId('');
      setDashboard(null);
      setSelectedContract(null);
      setShowMyQr(false);
      setMyQrUrl('');
      setEmpError('');
      setEmpSuccess('');
      setToken(json.token);
      setUser(json.user);
      setAuthMode('authenticated');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erro ao entrar no painel.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(PANEL_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    setToken('');
    setUser(null);
    setDashboard(null);
    setSelectedContract(null);
    setSelectedAgentId('');
    setShowMyQr(false);
    setMyQrUrl('');
    setCopiedCode('');
    setEmpError('');
    setEmpSuccess('');
    setAuthError('');
    setUsername('');
    setPassword('');
    setAuthMode('login');
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError('');
    setEmpSuccess('');
    setEmpSubmitting(true);
    try {
      const slug = sanitizeAgentSlug(empCode || empUsername || empName);
      const res = await fetch('/api/panel/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: empName,
          username: empUsername,
          password: empPassword,
          agentCode: slug,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmpError(json.error || 'Não foi possível criar funcionário.');
        return;
      }

      setEmpSuccess(`Funcionário ${empName} criado com link único ?ref=${slug}`);
      setEmpName('');
      setEmpUsername('');
      setEmpPassword('');
      setEmpCode('');
      setEmpCodeManual(false);
      if (user) {
        void loadDashboard(token, preset, customStart, customEnd, selectedAgentId);
      }
    } catch (err) {
      setEmpError(err instanceof Error ? err.message : 'Erro ao criar funcionário.');
    } finally {
      setEmpSubmitting(false);
    }
  };

  const handleToggleEmployee = async (empId: string, nextActive: boolean) => {
    const res = await fetch(`/api/panel/employees/${encodeURIComponent(empId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ active: nextActive }),
    });
    if (!res.ok) {
      setEmpError('Não foi possível alterar o funcionário. Tente novamente.');
      return;
    }
    if (user) {
      void loadDashboard(token, preset, customStart, customEnd, selectedAgentId);
    }
  };

  const handleDeleteEmployee = async (empId: string) => {
    const res = await fetch(`/api/panel/employees/${encodeURIComponent(empId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setEmpError('Não foi possível alterar o funcionário. Tente novamente.');
      return;
    }
    if (selectedAgentId === empId) setSelectedAgentId('');
    if (user) {
      void loadDashboard(token, preset, customStart, customEnd, selectedAgentId);
    }
  };

  const handleCopyAgentLink = async (agentCode: string) => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(agentCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(agentCode);
      setTimeout(() => setCopiedCode(''), 2200);
    } catch {
      // Clipboard fallback ignored
    }
  };

  // Loading auth check
  if (authMode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8] p-6">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#A51C20] animate-spin mx-auto" />
          <p className="text-sm text-zinc-600 mt-3">Carregando painel...</p>
        </div>
      </div>
    );
  }

  // First-run Setup or Login screen
  if (authMode === 'login') {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex flex-col justify-center px-4 py-10">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="text-center">
            <div className="inline-flex justify-center">
              <BrandLogo size="lg" />
            </div>
            <p className="font-mono-data text-xs text-zinc-500 mt-2">
              CNPJ {COMPANY_INFO.cnpj}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-3 pb-4 border-b border-zinc-200">
              <KeyRound className="w-5 h-5 text-[#A51C20] shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-zinc-900">
                  Acesso ao Painel
                </h1>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {'Entre com seu usuário e senha de Administrador Master ou Consultor autorizado.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">

              <div>
                <label htmlFor="login-user" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Usuário
                </label>
                <input
                  id="login-user"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite seu usuário"
                  className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                />
              </div>

              <div>
                <label htmlFor="login-pass" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Senha
                </label>
                <input
                  id="login-pass"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                />
              </div>

              {authError && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full h-12 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {authSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Entrar no Painel'
                )}
              </button>
            </form>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao site institucional
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Contract inspection modal/view inside panel
  if (selectedContract) {
    return (
      <div className="min-h-screen bg-[#F7F7F8]">
        <header className="no-print sticky top-0 z-40 bg-white border-b border-zinc-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setSelectedContract(null)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800 hover:text-[#A51C20] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para o Painel
            </button>
            <span className="font-mono-data text-xs text-zinc-500">
              Protocolo {selectedContract.protocol}
            </span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <SignedReceiptView
            contract={selectedContract}
            audit={buildLocalAudit(selectedContract, true)}
            onStartNewContract={() => setSelectedContract(null)}
            closeLabel="Voltar para o Painel"
          />
        </main>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const myWhatsappInvite = `Olá! Segue o link exclusivo da ${COMPANY_INFO.name} para você simular, preencher seus dados e assinar seu contrato de empréstimo pessoal online:\n\n${myAgentLink}`;

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-zinc-900">
      {/* Top Bar do Painel */}
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button type="button" onClick={onBackToSite} className="cursor-pointer">
              <BrandLogo size="sm" />
            </button>
            <span className="hidden sm:inline text-xs text-zinc-500 truncate">
              {isAdmin ? `Painel Admin Master · ${user?.name}` : `Meu Painel Individual · ${user?.name}`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                user &&
                loadDashboard(token, preset, customStart, customEnd, selectedAgentId)
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dashLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Meu Link Único de Atendimento */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                <Link2 className="w-4 h-4 text-[#A51C20]" />
                <span>Seu Link Único para Enviar aos Clientes</span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600">
                Todo cliente que acessar e assinar por este link ficará registrado no seu painel com contagem de acessos e dados completos.
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 max-w-2xl">
                <code className="font-mono-data text-xs text-zinc-800 truncate flex-1">
                  {myAgentLink}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => user && handleCopyAgentLink(user.agentCode)}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 cursor-pointer"
              >
                {copiedCode === user?.agentCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    Link Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar Link
                  </>
                )}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(myWhatsappInvite)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold"
              >
                <Share2 className="w-4 h-4" />
                Enviar no WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setShowMyQr((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                {showMyQr ? 'Ocultar QR' : 'QR Code'}
              </button>
            </div>
          </div>

          {showMyQr && myQrUrl && (
            <div className="mt-5 pt-5 border-t border-zinc-200 flex items-center gap-4">
              <img
                src={myQrUrl}
                alt="QR Code do link exclusivo"
                className="w-32 h-32 rounded-xl border border-zinc-200 p-1.5 bg-white"
              />
              <div className="text-xs text-zinc-600 space-y-1">
                <p className="font-bold text-zinc-900">QR Code de Atendimento — {user?.name}</p>
                <p>O cliente pode apontar a câmera do celular para abrir o contrato vinculado ao seu usuário.</p>
              </div>
            </div>
          )}
        </section>

        {/* Filtros de Data e Consultor */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <Calendar className="w-4 h-4 text-[#A51C20]" />
              <span>Filtrar por Período</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-100">
              {DATE_PRESETS.map((item) => {
                const active = preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id)}
                    className={`px-3 py-2 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {preset === 'custom' && (
              <>
                <div>
                  <label htmlFor="filter-start" className="block text-xs font-semibold text-zinc-600 mb-1">
                    Data Inicial
                  </label>
                  <input
                    id="filter-start"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-zinc-300 font-mono-data text-xs text-zinc-900"
                  />
                </div>
                <div>
                  <label htmlFor="filter-end" className="block text-xs font-semibold text-zinc-600 mb-1">
                    Data Final
                  </label>
                  <input
                    id="filter-end"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-zinc-300 font-mono-data text-xs text-zinc-900"
                  />
                </div>
              </>
            )}

            {isAdmin && dashboard && (
              <div className="min-w-[220px]">
                <label htmlFor="filter-agent" className="block text-xs font-semibold text-zinc-600 mb-1">
                  Filtrar por Funcionário
                </label>
                <select
                  id="filter-agent"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-900"
                >
                  <option value="">Todos os funcionários</option>
                  {dashboard.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (@{emp.username})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* KPIs do Período */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-semibold text-zinc-500">
              {isAdmin ? 'Acessos no Link' : 'Meus Acessos'}
            </p>
            <p className="font-mono-data text-2xl sm:text-3xl font-extrabold text-zinc-900 mt-1">
              {dashboard?.totalVisits ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-semibold text-zinc-500">
              {isAdmin ? 'Contratos Assinados' : 'Meus Contratos'}
            </p>
            <p className="font-mono-data text-2xl sm:text-3xl font-extrabold text-[#A51C20] mt-1">
              {dashboard?.totalContracts ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-semibold text-zinc-500">Taxa de Conversão</p>
            <p className="font-mono-data text-2xl sm:text-3xl font-extrabold text-zinc-900 mt-1">
              {dashboard?.conversionRate ?? 0}%
            </p>
          </div>
        </section>

        {/* Gestão de Funcionários — Exclusivo Admin Master */}
        {isAdmin && (
          <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-zinc-200 flex items-center gap-2.5">
              <Users className="w-5 h-5 text-[#A51C20]" />
              <div>
                <h2 className="text-lg font-bold text-zinc-900">
                  Gerenciar Funcionários e Links Individuais
                </h2>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Crie usuários e senhas para cada funcionário. Cada um receberá um link exclusivo para enviar aos clientes.
                </p>
              </div>
            </div>

            {/* Form Novo Funcionário */}
            <form onSubmit={handleCreateEmployee} className="p-5 sm:p-6 bg-zinc-50/70 border-b border-zinc-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label htmlFor="emp-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Nome do Funcionário *
                  </label>
                  <input
                    id="emp-name"
                    type="text"
                    required
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="Ex.: Carlos Silva"
                    className="w-full h-11 px-3 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label htmlFor="emp-user" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Usuário de Login *
                  </label>
                  <input
                    id="emp-user"
                    type="text"
                    required
                    value={empUsername}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/\s+/g, '');
                      setEmpUsername(val);
                      if (!empCodeManual) setEmpCode(sanitizeAgentSlug(val));
                    }}
                    placeholder="carlos.silva"
                    className="w-full h-11 px-3 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label htmlFor="emp-pass" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Senha *
                  </label>
                  <input
                    id="emp-pass"
                    type="text"
                    required
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    placeholder="Mín. 4 caracteres"
                    className="w-full h-11 px-3 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label htmlFor="emp-slug" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Código do Link (?ref=) *
                  </label>
                  <input
                    id="emp-slug"
                    type="text"
                    required
                    value={empCode}
                    onChange={(e) => {
                      setEmpCodeManual(true);
                      setEmpCode(sanitizeAgentSlug(e.target.value));
                    }}
                    placeholder="carlos-silva"
                    className="w-full h-11 px-3 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={empSubmitting}
                  className="h-11 px-4 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  Adicionar Funcionário
                </button>
              </div>

              {empError && (
                <p className="text-xs text-red-700 font-medium">{empError}</p>
              )}
              {empSuccess && (
                <p className="text-xs text-emerald-700 font-medium">{empSuccess}</p>
              )}
            </form>

            {/* Tabela de Funcionários */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-bold text-zinc-500 bg-white">
                    <th className="py-3.5 px-5">Funcionário</th>
                    <th className="py-3.5 px-4">Link Único</th>
                    <th className="py-3.5 px-4 text-right">Acessos</th>
                    <th className="py-3.5 px-4 text-right">Contratos</th>
                    <th className="py-3.5 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {(dashboard?.employees || []).map((emp) => (
                    <tr key={emp.id} className="hover:bg-zinc-50">
                      <td className="py-3.5 px-5">
                        <p className="font-bold text-zinc-900">{emp.name}</p>
                        <p className="font-mono-data text-xs text-zinc-500">
                          @{emp.username} · {emp.role === 'admin' ? 'Admin Master' : emp.active ? 'Ativo' : 'Pausado'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <code className="font-mono-data text-xs text-zinc-700 bg-zinc-100 px-2 py-1 rounded">
                            /?ref={emp.agentCode}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyAgentLink(emp.agentCode)}
                            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                            title="Copiar link do funcionário"
                          >
                            {copiedCode === emp.agentCode ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={`/?ref=${encodeURIComponent(emp.agentCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700"
                            title="Abrir link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-data font-semibold text-zinc-900">
                        {emp.visitsCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-data font-bold text-[#A51C20]">
                        {emp.contractsCount}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedAgentId((prev) => (prev === emp.id ? '' : emp.id))}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                              selectedAgentId === emp.id
                                ? 'border-[#A51C20] bg-red-50 text-[#A51C20]'
                                : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {selectedAgentId === emp.id ? 'Mostrando' : 'Ver clientes'}
                          </button>
                          {emp.role !== 'admin' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleEmployee(emp.id, !emp.active)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 cursor-pointer"
                              >
                                {emp.active ? (
                                  <>
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                                    Pausar
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    Ativar
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployee(emp.id)}
                                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-red-50 text-red-600 cursor-pointer"
                                title="Excluir funcionário"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Contratos Preenchidos e Assinados */}
        <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[#A51C20]" />
              <div>
                <h2 className="text-lg font-bold text-zinc-900">
                  {isAdmin ? 'Contratos Preenchidos e Assinados' : 'Meus Clientes e Contratos'}
                </h2>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {isAdmin
                    ? 'Clientes que preencheram e assinaram no período selecionado.'
                    : 'Somente os clientes atendidos pelo seu link único — seus dados não são misturados com os de outros funcionários.'}
                </p>
              </div>
            </div>
            <span className="font-mono-data text-xs font-semibold text-zinc-600">
              {dashboard?.contracts.length ?? 0} registro(s)
            </span>
          </div>

          {!dashboard || dashboard.contracts.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              Nenhum contrato assinado neste período ainda. Envie seu link único aos clientes para começar a receber contratos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-bold text-zinc-500 bg-zinc-50/70">
                    <th className="py-3.5 px-5">Protocolo / Data</th>
                    <th className="py-3.5 px-4">Cliente e CPF</th>
                    <th className="py-3.5 px-4">Faturas / Vencimento</th>
                    <th className="py-3.5 px-4">Recebimento (Banco / PIX)</th>
                    {isAdmin && <th className="py-3.5 px-4">Funcionário</th>}
                    <th className="py-3.5 px-5 text-right">Conferência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {dashboard.contracts.map((c) => (
                    <tr key={c.protocol} className="hover:bg-zinc-50">
                      <td className="py-3.5 px-5">
                        <p className="font-mono-data font-bold text-zinc-900">{c.protocol}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(c.signedAt).toLocaleString('pt-BR')}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-zinc-900">{c.fullName}</p>
                        <p className="font-mono-data text-xs text-zinc-600">
                          CPF {c.cpf} · {c.phone}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {c.city}/{c.state} · CEP {c.cep}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <p className="font-semibold text-zinc-900">
                          Faturas: {c.invoiceDeliveryMethod || 'WhatsApp'}
                        </p>
                        <p className="font-mono-data text-zinc-600 mt-0.5">
                          1º Venc.:{' '}
                          {c.firstDueDate
                            ? new Date(`${c.firstDueDate}T12:00:00`).toLocaleDateString('pt-BR')
                            : '30 dias'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <p className="font-semibold text-zinc-800">{c.bankName}</p>
                        <p className="font-mono-data text-zinc-600">
                          Ag {c.agency} · Cc {c.accountNumber}
                        </p>
                        <p className="font-mono-data text-zinc-700">
                          PIX ({c.pixKeyType}): {c.pixKey}
                        </p>
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-4 text-xs">
                          <p className="font-semibold text-zinc-900">{c.agentName || 'Direto'}</p>
                          <p className="font-mono-data text-zinc-500">
                            {c.agentCode ? `?ref=${c.agentCode}` : '—'}
                          </p>
                        </td>
                      )}
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex flex-col items-end gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Assinado
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedContract(c)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver Contrato
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
