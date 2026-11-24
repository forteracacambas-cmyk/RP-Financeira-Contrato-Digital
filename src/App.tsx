import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Menu,
  X,
} from 'lucide-react';
import {
  calculateInstallmentValue,
  COMPANY_INFO,
  formatCurrency,
  INSTALLMENT_OPTIONS,
  isValidCPF,
  OFFICIAL_RATE_TABLE,
  onlyDigits,
} from './lib/loanTable';
import type {
  ContractVerificationAudit,
  LoanContractInput,
  SignedLoanContract,
} from './types/contract';
import { BrandLogo } from './components/BrandLogo';
import { SignedReceiptView } from './components/SignedReceiptView';
import { ConsultContractView } from './components/ConsultContractView';
import { ContractWizard } from './components/ContractWizard';
import { PanelView } from './components/PanelView';

type AppView = 'home' | 'consult' | 'receipt' | 'panel';

function getDefaultDueDate(): string {
  const d = new Date(Date.now() + 30 * 86400000);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM: LoanContractInput = {
  agentCode: '',
  loanAmount: 10000,
  installments: 24,
  installmentValue: calculateInstallmentValue(10000, 24),
  monthlyRatePercent: COMPANY_INFO.monthlyRatePercent,
  totalPayable: Math.round(calculateInstallmentValue(10000, 24) * 24 * 100) / 100,
  firstDueDate: getDefaultDueDate(),

  fullName: '',
  cpf: '',
  rgOrCnh: '',
  birthDate: '',
  maritalStatus: 'Não informado',
  occupation: '',
  monthlyIncome: '',
  phone: '',
  email: '',

  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',

  bankName: '001 - Banco do Brasil',
  accountType: 'Conta Corrente',
  agency: '',
  accountNumber: '',
  pixKeyType: 'CPF',
  pixKey: '',

  acceptedTerms: false,
  acceptedDataTruth: false,
  signatureDataUrl: '',
};

export default function App() {
  const [view, setView] = useState<AppView>(() =>
    window.location.pathname.replace(/\/+$/, '') === '/painel' ? 'panel' : 'home'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [form, setForm] = useState<LoanContractInput>(INITIAL_FORM);
  const [customAmountMode, setCustomAmountMode] = useState(false);

  // Authorized link state (?ref=...)
  const [agentState, setAgentState] = useState<{
    status: 'none' | 'loading' | 'valid' | 'invalid';
    agentCode?: string;
    error?: string;
  }>({ status: 'none' });

  // Animated splash before entering the 4-step contract
  const [showOpeningSplash, setShowOpeningSplash] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [signedResult, setSignedResult] = useState<{
    contract: SignedLoanContract;
    audit: ContractVerificationAudit;
  } | null>(null);

  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState('');

  const simulatorSectionRef = useRef<HTMLElement | null>(null);
  const institutionalSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname.replace(/\/+$/, '') === '/painel') {
        setView('panel');
      } else {
        setView('home');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Auto-advance animated opening splash after 2.2s
  useEffect(() => {
    if (!showOpeningSplash) return;
    const timer = window.setTimeout(() => {
      setShowOpeningSplash(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [showOpeningSplash]);

  const computedInstallment = useMemo(
    () => calculateInstallmentValue(form.loanAmount, form.installments),
    [form.loanAmount, form.installments]
  );

  const computedTotal = useMemo(
    () => Math.round(computedInstallment * form.installments * 100) / 100,
    [computedInstallment, form.installments]
  );

  const currentFormWithCalculations: LoanContractInput = useMemo(
    () => ({
      ...form,
      agentCode: agentState.agentCode || form.agentCode,
      installmentValue: computedInstallment,
      totalPayable: computedTotal,
    }),
    [form, agentState.agentCode, computedInstallment, computedTotal]
  );

  // Handle URL parameters on mount: ?contrato=... or ?ref=...
  useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, '') === '/painel') {
      setView('panel');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const protocolParam = params.get('contrato');
    const tokenParam = params.get('chave');
    const refParam = params.get('ref');

    if (protocolParam && tokenParam) {
      setDeepLinkLoading(true);
      setDeepLinkError('');
      const qs = new URLSearchParams({
        protocol: protocolParam,
        token: tokenParam,
      });
      fetch(`/api/contracts/lookup?${qs.toString()}`)
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(json.error || 'Link de contrato inválido ou expirado.');
            }
            setSignedResult({ contract: json.contract, audit: json.audit });
            setView('receipt');
            return;
          }
          throw new Error('API_UNAVAILABLE');
        })
        .catch((err: Error) => {
          setDeepLinkError(
            err.message === 'API_UNAVAILABLE' ? 'Servidor indisponível. Tente novamente.' : err.message
          );
          setView('consult');
        })
        .finally(() => {
          setDeepLinkLoading(false);
        });
      return;
    }

    if (refParam) {
      setAgentState({ status: 'loading' });
      fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentCode: refParam }),
      })
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (!res.ok || !json.valid) {
              setAgentState({
                status: 'invalid',
                error: json.error || 'Link inválido ou desativado.',
              });
              return;
            }
            setAgentState({
              status: 'valid',
              agentCode: json.agentCode,
            });
            setShowOpeningSplash(true);
            setForm((prev) => ({ ...prev, agentCode: json.agentCode }));
            return;
          }
          throw new Error('STATIC_HOST');
        })
        .catch(() => {
          setAgentState({
            status: 'invalid',
            error: 'Não foi possível validar o link. Recarregue a página e tente novamente.',
          });
        });
    }
  }, []);

  const navigateToSite = () => {
    window.history.pushState({}, '', '/');
    setView('home');
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateField = <K extends keyof LoanContractInput>(
    key: K,
    value: LoanContractInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const scrollToSection = (section: 'simulator' | 'institutional') => {
    if (view === 'panel') {
      window.history.pushState({}, '', '/');
    }
    setView('home');
    setMobileNavOpen(false);
    setTimeout(() => {
      if (section === 'simulator') {
        simulatorSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        institutionalSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 60);
  };

  const handleStartNewContract = () => {
    const keepRef =
      agentState.status === 'valid' && agentState.agentCode
        ? `?ref=${encodeURIComponent(agentState.agentCode)}`
        : '';
    window.history.replaceState({}, '', `/${keepRef}`);
    setSignedResult(null);
    setDeepLinkError('');
    setSubmitError('');
    setForm({
      ...INITIAL_FORM,
      agentCode: agentState.agentCode || '',
      firstDueDate: getDefaultDueDate(),
    });
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cpfDigits = onlyDigits(form.cpf);
  const cpfIsValid = cpfDigits.length === 11 && isValidCPF(form.cpf);

  const validateBeforeSubmit = (): string | null => {
    if (agentState.status !== 'valid' || !agentState.agentCode) {
      return 'Link inválido ou expirado. Solicite um novo link para contratar.';
    }
    if (form.loanAmount < 1000 || form.loanAmount > 100000) {
      return 'O valor do empréstimo deve estar entre R$ 1.000,00 e R$ 100.000,00.';
    }
    if (form.fullName.trim().length < 5) {
      return 'Informe seu nome completo conforme documento oficial.';
    }
    if (!cpfIsValid) {
      return 'CPF inválido. Apenas CPFs válidos são aceitos.';
    }
    if (form.rgOrCnh.trim().length < 4) {
      return 'Informe o número do seu RG ou CNH.';
    }
    if (!form.birthDate) {
      return 'Informe sua data de nascimento.';
    }
    if (onlyDigits(form.phone).length < 10) {
      return 'Informe um celular / WhatsApp com DDD.';
    }
    if (!form.email.includes('@') || !form.email.includes('.')) {
      return 'Informe um endereço de e-mail válido.';
    }
    if (
      onlyDigits(form.cep).length !== 8 ||
      !form.street.trim() ||
      !form.number.trim() ||
      !form.city.trim()
    ) {
      return 'Preencha um CEP válido e o endereço completo (rua, número e cidade).';
    }
    if (!form.bankName || !form.agency.trim() || !form.accountNumber.trim() || !form.pixKey.trim()) {
      return 'Preencha todos os dados bancários e a chave PIX para recebimento.';
    }
    if (!form.acceptedTerms || !form.acceptedDataTruth) {
      return 'Você precisa aceitar os termos e a confirmação de dados.';
    }
    if (!form.signatureDataUrl) {
      return 'Faça sua assinatura na tela antes de finalizar.';
    }
    return null;
  };

  const handleSubmitContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFormWithCalculations),
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Servidor indisponível. Tente novamente.');
      }
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Não foi possível registrar o contrato.');
      }
      const contract = json.contract as SignedLoanContract;
      const audit = json.audit as ContractVerificationAudit;
      const params = new URLSearchParams({
        contrato: contract.protocol,
        chave: contract.accessToken,
      });
      window.history.replaceState({}, '', '/?' + params.toString());
      setSignedResult({ contract, audit });
      setView('receipt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Falha ao registrar o contrato. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Dedicated /painel route
  if (view === 'panel') {
    return <PanelView onBackToSite={navigateToSite} />;
  }

  const hasValidAgentLink = agentState.status === 'valid';

  // Animated Splash Screen before entering the 4-step contract
  if (hasValidAgentLink && showOpeningSplash && view === 'home') {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full rounded-2xl border border-zinc-200 bg-white p-8 sm:p-10 text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-3"
          >
            <BrandLogo size="lg" />
            <span className="font-mono-data text-xs text-zinc-500">
              CNPJ {COMPANY_INFO.cnpj}
            </span>
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 tracking-tight leading-snug">
              Você está iniciando seu Contrato de Empréstimo Pessoal
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Preencha em 4 passos simples: escolha o valor, informe seus dados, conta para recebimento e assine na tela.
            </p>
          </div>

          {/* Animated Progress Bar */}
          <div className="space-y-2">
            <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 2.0, ease: 'easeInOut' }}
                className="h-full bg-[#A51C20] rounded-full"
              />
            </div>
            <p className="text-xs font-medium text-zinc-500">
              Preparando contrato digital...
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowOpeningSplash(false)}
            className="w-full h-11 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            Começar agora
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F8] text-zinc-900">
      {/* Top Navigation Bar */}
      <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => scrollToSection('simulator')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A51C20] rounded-lg cursor-pointer"
          >
            <BrandLogo size="md" />
          </button>

          {!hasValidAgentLink && view === 'home' ? (
            <>
              <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
                <button
                  type="button"
                  onClick={() => scrollToSection('simulator')}
                  className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Simulador
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('institutional')}
                  className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Crédito Pessoal
                </button>
              </nav>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => scrollToSection('simulator')}
                  className="hidden sm:inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#A51C20] hover:bg-[#8B1519] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Simular Parcelas
                </button>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((o) => !o)}
                  className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                  aria-label="Abrir menu de navegação"
                >
                  {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </>
          ) : (
            <span className="font-mono-data text-xs text-zinc-500">
              CNPJ {COMPANY_INFO.cnpj}
            </span>
          )}
        </div>

        {!hasValidAgentLink && view === 'home' && mobileNavOpen && (
          <div className="md:hidden border-t border-zinc-200 bg-white px-4 py-3 space-y-1">
            <button
              type="button"
              onClick={() => scrollToSection('simulator')}
              className="w-full text-left px-3 py-3 text-sm font-medium text-zinc-800 rounded-lg hover:bg-zinc-50"
            >
              Simulador
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('institutional')}
              className="w-full text-left px-3 py-3 text-sm font-medium text-zinc-800 rounded-lg hover:bg-zinc-50"
            >
              Crédito Pessoal
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {deepLinkLoading || agentState.status === 'loading' ? (
          <div className="max-w-lg mx-auto rounded-2xl border border-zinc-200 bg-white p-12 text-center">
            <Loader2 className="w-8 h-8 text-[#A51C20] animate-spin mx-auto" />
            <p className="text-base font-semibold text-zinc-900 mt-4">
              {deepLinkLoading ? 'Carregando contrato...' : 'Preparando atendimento...'}
            </p>
          </div>
        ) : view === 'receipt' && signedResult ? (
          <SignedReceiptView
            contract={signedResult.contract}
            audit={signedResult.audit}
            onStartNewContract={handleStartNewContract}
          />
        ) : view === 'consult' ? (
          <div className="space-y-6">
            {deepLinkError && (
              <div className="max-w-2xl mx-auto flex items-start gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Não foi possível abrir o link direto</p>
                  <p className="mt-0.5">{deepLinkError}</p>
                </div>
              </div>
            )}
            <ConsultContractView onStartNewContract={handleStartNewContract} />
          </div>
        ) : hasValidAgentLink ? (
          /* Fluxo super simples do contrato em 4 etapas (quando acessado via ?ref=) */
          <AnimatePresence mode="wait">
            <motion.section
              key="wizard-active"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              id="contrato"
            >
              <ContractWizard
                form={form}
                computedInstallment={computedInstallment}
                computedTotal={computedTotal}
                customAmountMode={customAmountMode}
                setCustomAmountMode={setCustomAmountMode}
                updateField={updateField}
                onSubmit={handleSubmitContract}
                submitting={submitting}
                submitError={submitError}
                setSubmitError={setSubmitError}
              />
            </motion.section>
          </AnimatePresence>
        ) : (
          /* Site Principal Institucional: apenas mostrando que faz empréstimo pessoal + simulador */
          <>
            {agentState.status === 'invalid' && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3 text-sm text-red-900">
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Link inválido ou desativado</p>
                  <p className="mt-0.5">{agentState.error}</p>
                </div>
              </div>
            )}

            {/* Hero + Simulador */}
            <section
              ref={simulatorSectionRef}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
            >
              <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-zinc-500">
                    {COMPANY_INFO.name}
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span className="font-mono-data">CNPJ {COMPANY_INFO.cnpj}</span>
                  </p>

                  <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-zinc-900 leading-[1.12]">
                    Empréstimo pessoal com parcelas fixas e taxa de 1,35% ao mês
                  </h1>

                  <p className="mt-4 text-base text-zinc-600 leading-relaxed max-w-2xl">
                    A {COMPANY_INFO.name} oferece crédito pessoal transparente com valores de R$ 5 mil a R$ 50 mil e parcelamento flexível de 12x a 120x. Simule ao lado suas condições.
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="font-mono-data text-xl font-bold text-[#A51C20]">
                      {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m.
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Taxa fixa mensal
                    </p>
                  </div>
                  <div>
                    <p className="font-mono-data text-xl font-bold text-zinc-900">
                      12x a 120x
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Planos de R$ 5 mil a R$ 50 mil
                    </p>
                  </div>
                  <div>
                    <p className="font-mono-data text-xl font-bold text-zinc-900">
                      Sem Taxa Prévia
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Sem depósito antecipado
                    </p>
                  </div>
                </div>
              </div>

              {/* Simulador de Parcelas */}
              <div className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-zinc-900 text-white p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-4 border-b border-zinc-800">
                    <h2 className="text-lg font-bold tracking-tight">
                      Simulador de Empréstimo
                    </h2>
                    <span className="font-mono-data text-xs text-zinc-400">
                      1,35% a.m.
                    </span>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-semibold text-zinc-300">
                        Valor Desejado
                      </label>
                      <button
                        type="button"
                        onClick={() => setCustomAmountMode((v) => !v)}
                        className="text-xs font-medium text-red-300 hover:text-red-200 underline underline-offset-4 cursor-pointer"
                      >
                        {customAmountMode ? 'Escolher valores prontos' : 'Digitar outro valor'}
                      </button>
                    </div>

                    {customAmountMode ? (
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono-data text-sm text-zinc-400">
                          R$
                        </span>
                        <input
                          type="number"
                          min={1000}
                          max={100000}
                          step={500}
                          value={form.loanAmount}
                          onChange={(e) => {
                            const val = Math.max(
                              1000,
                              Math.min(100000, Number(e.target.value) || 1000)
                            );
                            updateField('loanAmount', val);
                          }}
                          className="w-full h-12 pl-10 pr-4 rounded-xl bg-zinc-800 border border-zinc-700 font-mono-data text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#A51C20]"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 gap-1.5">
                        {OFFICIAL_RATE_TABLE.map((row) => {
                          const active = form.loanAmount === row.amount;
                          return (
                            <button
                              key={row.amount}
                              type="button"
                              onClick={() => updateField('loanAmount', row.amount)}
                              className={`py-2 px-1.5 min-h-[40px] rounded-lg text-xs font-mono-data font-semibold transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#A51C20] text-white'
                                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              {row.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <label className="block text-xs font-semibold text-zinc-300 mb-2">
                      Quantidade de Parcelas
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 gap-1.5">
                      {INSTALLMENT_OPTIONS.map((count) => {
                        const active = form.installments === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            onClick={() => updateField('installments', count)}
                            className={`py-2 px-2 min-h-[40px] rounded-lg text-xs font-mono-data font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'bg-white text-zinc-900'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {count}X
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-zinc-800 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-400">Parcela Mensal Fixa</p>
                      <p className="font-mono-data text-3xl font-extrabold text-white mt-0.5">
                        {formatCurrency(computedInstallment)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">Plano</p>
                      <p className="font-mono-data text-sm font-semibold text-zinc-200 mt-0.5">
                        {form.installments}x de {formatCurrency(computedInstallment)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Valor solicitado: {formatCurrency(form.loanAmount)}</span>
                    <span>Total: {formatCurrency(computedTotal)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Seção Institucional sobre Empréstimo Pessoal */}
            <section
              ref={institutionalSectionRef}
              className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 space-y-6 scroll-mt-24"
            >
              <div className="border-b border-zinc-200 pb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                  Crédito Pessoal — {COMPANY_INFO.name}
                </h2>
                <p className="text-sm text-zinc-600 mt-1">
                  Soluções em empréstimo pessoal com parcelas fixas e transparência do início ao fim.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2">
                  <p className="font-mono-data text-xs font-bold text-[#A51C20]">01. Valores Flexíveis</p>
                  <h3 className="text-base font-bold text-zinc-900">De R$ 5 Mil a R$ 50 Mil</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Linhas de empréstimo pessoal estruturadas para organizar finanças, quitar dívidas ou investir em projetos pessoais.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2">
                  <p className="font-mono-data text-xs font-bold text-[#A51C20]">02. Parcelas Fixas</p>
                  <h3 className="text-base font-bold text-zinc-900">Prazos de 12x até 120x</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Taxa fixa de {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês, garantindo previsibilidade em todo o parcelamento.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2">
                  <p className="font-mono-data text-xs font-bold text-[#A51C20]">03. Segurança e Sigilo</p>
                  <h3 className="text-base font-bold text-zinc-900">Atendimento Transparente</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    A {COMPANY_INFO.name} (CNPJ {COMPANY_INFO.cnpj}) protege seus dados conforme a LGPD e não exige depósitos antecipados.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="no-print border-t border-zinc-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            <p className="font-semibold text-zinc-800">
              {COMPANY_INFO.legalName} · CNPJ {COMPANY_INFO.cnpj}
            </p>
            <p className="mt-1">
              Crédito pessoal com transparência e proteção de dados conforme a LGPD (Lei nº 13.709/2018).
            </p>
          </div>
          {!hasValidAgentLink && view === 'home' && (
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => scrollToSection('simulator')}
                className="hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Simulador
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('institutional')}
                className="hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Crédito Pessoal
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
