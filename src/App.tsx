import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Menu,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  BRAZILIAN_BANKS,
  BRAZILIAN_STATES,
  calculateInstallmentValue,
  COMPANY_INFO,
  formatCEP,
  formatCPF,
  formatCurrency,
  formatPhone,
  INSTALLMENT_OPTIONS,
  isValidCPF,
  OFFICIAL_RATE_TABLE,
  onlyDigits,
  type InstallmentCount,
} from './lib/loanTable';
import type {
  AccountType,
  ContractVerificationAudit,
  LoanContractInput,
  PixKeyType,
  SignedLoanContract,
} from './types/contract';
import { BrandLogo } from './components/BrandLogo';
import { OfficialRateTable } from './components/OfficialRateTable';
import { AuthenticationSeals } from './components/AuthenticationSeals';
import { SignatureCanvas } from './components/SignatureCanvas';
import { ContractDocument } from './components/ContractDocument';
import { SignedReceiptView } from './components/SignedReceiptView';
import { ConsultContractView } from './components/ConsultContractView';

type AppView = 'home' | 'consult' | 'receipt';

function getDefaultDueDate(): string {
  const d = new Date(Date.now() + 30 * 86400000);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM: LoanContractInput = {
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
  maritalStatus: 'Solteiro(a)',
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

  bankName: BRAZILIAN_BANKS[0],
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
  const [view, setView] = useState<AppView>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [form, setForm] = useState<LoanContractInput>(INITIAL_FORM);
  const [customAmountMode, setCustomAmountMode] = useState(false);
  const [showFullDraft, setShowFullDraft] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [signedResult, setSignedResult] = useState<{
    contract: SignedLoanContract;
    audit: ContractVerificationAudit;
  } | null>(null);

  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState('');

  const contractFormRef = useRef<HTMLElement | null>(null);
  const tableSectionRef = useRef<HTMLDivElement | null>(null);
  const simulatorSectionRef = useRef<HTMLElement | null>(null);

  // Sync calculated installment whenever loanAmount or installments changes
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
      installmentValue: computedInstallment,
      totalPayable: computedTotal,
    }),
    [form, computedInstallment, computedTotal]
  );

  // Deep-link verification loader (?contrato=RP-...&chave=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const protocolParam = params.get('contrato');
    const tokenParam = params.get('chave');

    if (protocolParam && tokenParam) {
      setDeepLinkLoading(true);
      setDeepLinkError('');
      const qs = new URLSearchParams({
        protocol: protocolParam,
        token: tokenParam,
      });
      fetch(`/api/contracts/lookup?${qs.toString()}`)
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || 'Link de contrato inválido ou expirado.');
          }
          setSignedResult({ contract: json.contract, audit: json.audit });
          setView('receipt');
        })
        .catch((err: Error) => {
          setDeepLinkError(err.message);
          setView('consult');
        })
        .finally(() => {
          setDeepLinkLoading(false);
        });
    }
  }, []);

  const updateField = <K extends keyof LoanContractInput>(
    key: K,
    value: LoanContractInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectTablePlan = (amount: number, installments: InstallmentCount) => {
    setCustomAmountMode(false);
    setForm((prev) => ({
      ...prev,
      loanAmount: amount,
      installments,
    }));
    contractFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToSection = (section: 'simulator' | 'table' | 'contract') => {
    setView('home');
    setMobileNavOpen(false);
    setTimeout(() => {
      if (section === 'simulator') {
        simulatorSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else if (section === 'table') {
        tableSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        contractFormRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 60);
  };

  const handleStartNewContract = () => {
    window.history.replaceState({}, '', window.location.pathname);
    setSignedResult(null);
    setDeepLinkError('');
    setSubmitError('');
    setForm({
      ...INITIAL_FORM,
      firstDueDate: getDefaultDueDate(),
    });
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cpfDigits = onlyDigits(form.cpf);
  const cpfIsValid = cpfDigits.length === 11 && isValidCPF(form.cpf);

  const validateBeforeSubmit = (): string | null => {
    if (form.loanAmount < 1000 || form.loanAmount > 100000) {
      return 'O valor do empréstimo deve estar entre R$ 1.000,00 e R$ 100.000,00.';
    }
    if (form.fullName.trim().length < 5) {
      return 'Informe seu nome completo conforme documento oficial.';
    }
    if (!cpfIsValid) {
      return 'Informe um CPF válido.';
    }
    if (form.rgOrCnh.trim().length < 4) {
      return 'Informe o número do seu RG ou CNH.';
    }
    if (!form.birthDate) {
      return 'Informe sua data de nascimento.';
    }
    if (onlyDigits(form.phone).length < 10) {
      return 'Informe um número de telefone / WhatsApp com DDD.';
    }
    if (!form.email.includes('@') || !form.email.includes('.')) {
      return 'Informe um endereço de e-mail válido.';
    }
    if (!form.street.trim() || !form.number.trim() || !form.city.trim()) {
      return 'Preencha o endereço completo (rua, número e cidade).';
    }
    if (!form.bankName || !form.agency.trim() || !form.accountNumber.trim() || !form.pixKey.trim()) {
      return 'Preencha todos os dados bancários e a chave PIX para recebimento.';
    }
    if (!form.acceptedTerms || !form.acceptedDataTruth) {
      return 'Você precisa ler e aceitar as cláusulas contratuais e a declaração de veracidade.';
    }
    if (!form.signatureDataUrl) {
      return 'Faça sua assinatura manuscrita no campo de assinatura antes de finalizar.';
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
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || 'Não foi possível registrar o contrato.');
        return;
      }

      const created = json.contract as SignedLoanContract;
      const audit = json.audit as ContractVerificationAudit;

      const nextUrl = `${window.location.pathname}?contrato=${encodeURIComponent(
        created.protocol
      )}&chave=${encodeURIComponent(created.accessToken)}`;
      window.history.replaceState({}, '', nextUrl);

      setSignedResult({ contract: created, audit });
      setView('receipt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Falha de conexão ao enviar contrato. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F8] text-zinc-900">
      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark only */}
          <button
            type="button"
            onClick={() => scrollToSection('simulator')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A51C20] rounded-lg"
          >
            <BrandLogo size="md" />
          </button>

          {/* Zone 2: 4 Single-line Nav Links */}
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
              onClick={() => scrollToSection('table')}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tabela Oficial
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contract')}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Fazer Contrato
            </button>
            <button
              type="button"
              onClick={() => {
                setView('consult');
                setMobileNavOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'consult' ? 'text-[#A51C20] font-semibold' : ''
              }`}
            >
              Consultar
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA + mobile toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollToSection('contract')}
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#A51C20] hover:bg-[#8B1519] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Assinar Agora
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
        </div>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
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
              onClick={() => scrollToSection('table')}
              className="w-full text-left px-3 py-3 text-sm font-medium text-zinc-800 rounded-lg hover:bg-zinc-50"
            >
              Tabela Oficial
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contract')}
              className="w-full text-left px-3 py-3 text-sm font-medium text-zinc-800 rounded-lg hover:bg-zinc-50"
            >
              Fazer Contrato
            </button>
            <button
              type="button"
              onClick={() => {
                setView('consult');
                setMobileNavOpen(false);
              }}
              className="w-full text-left px-3 py-3 text-sm font-medium text-zinc-800 rounded-lg hover:bg-zinc-50"
            >
              Consultar Contrato
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {deepLinkLoading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
            <Loader2 className="w-8 h-8 text-[#A51C20] animate-spin mx-auto" />
            <p className="text-base font-semibold text-zinc-900 mt-4">
              Validando autenticidade do contrato...
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Conferindo assinatura digital, dados cadastrais e selo SHA-256.
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
        ) : (
          <>
            {/* Hero & Simulador Rápido */}
            <section
              ref={simulatorSectionRef}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
            >
              {/* Hero Copy */}
              <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-zinc-500">
                    {COMPANY_INFO.name}
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span className="font-mono-data">CNPJ {COMPANY_INFO.cnpj}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>Contratação Digital</span>
                  </p>

                  <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-zinc-900 leading-[1.12]">
                    Contrato digital de empréstimo pessoal com assinatura na tela e validação por QR Code
                  </h1>

                  <p className="mt-4 text-base text-zinc-600 leading-relaxed max-w-2xl">
                    Escolha o valor e as parcelas pela tabela oficial da RP Financeira, preencha seus dados pessoais e conta para recebimento, assine diretamente na tela do celular ou computador e gere seu link de consulta para enviar no WhatsApp.
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="font-mono-data text-xl font-bold text-[#A51C20]">
                      {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m.
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Taxa fixa conforme tabela oficial
                    </p>
                  </div>
                  <div>
                    <p className="font-mono-data text-xl font-bold text-zinc-900">
                      12x a 120x
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Planos flexíveis de R$ 5 mil a R$ 50 mil
                    </p>
                  </div>
                  <div>
                    <p className="font-mono-data text-xl font-bold text-zinc-900">
                      SHA-256
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Certificado digital e QR Code imediato
                    </p>
                  </div>
                </div>
              </div>

              {/* Simulador Interativo */}
              <div className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-zinc-900 text-white p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-4 border-b border-zinc-800">
                    <h2 className="text-lg font-bold tracking-tight">
                      Simulador de Parcelas
                    </h2>
                    <span className="font-mono-data text-xs text-zinc-400">
                      Tabela RP
                    </span>
                  </div>

                  {/* Valor do Empréstimo */}
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
                        {customAmountMode ? 'Usar valores da tabela' : 'Digitar outro valor'}
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
                            const val = Math.max(1000, Math.min(100000, Number(e.target.value) || 1000));
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

                  {/* Quantidade de Parcelas */}
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

                {/* Resultado do Simulador */}
                <div className="mt-6 pt-5 border-t border-zinc-800 space-y-4">
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

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={() => scrollToSection('contract')}
                      className="flex-1 h-12 px-5 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      Preencher e Assinar
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('consult')}
                      className="h-12 px-4 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      Consultar
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Tabela Oficial Interativa */}
            <div ref={tableSectionRef}>
              <OfficialRateTable
                selectedAmount={form.loanAmount}
                selectedInstallments={form.installments}
                onSelectPlan={handleSelectTablePlan}
              />
            </div>

            {/* Selos de Autenticação Institucionais */}
            <AuthenticationSeals />

            {/* Formulário Completo de Contratação & Assinatura Digital */}
            <section ref={contractFormRef} id="contrato" className="scroll-mt-20">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
                  Formalização do Contrato de Empréstimo Pessoal
                </h2>
                <p className="text-sm sm:text-base text-zinc-600 mt-1">
                  Preencha seus dados corretamente abaixo. Ao final, leia os termos, assine na tela e gere seu QR Code para compartilhar no WhatsApp.
                </p>
              </div>

              <form onSubmit={handleSubmitContract} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Coluna Principal do Formulário */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Bloco 01: Resumo Financeiro Editável */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 space-y-5">
                    <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-200">
                      <Banknote className="w-5 h-5 text-[#A51C20]" />
                      <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                        01. Condições do Empréstimo Selecionado
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="loan-amount" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Valor do Empréstimo (R$)
                        </label>
                        <select
                          id="loan-amount"
                          value={
                            OFFICIAL_RATE_TABLE.some((r) => r.amount === form.loanAmount)
                              ? String(form.loanAmount)
                              : 'custom'
                          }
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              setCustomAmountMode(true);
                            } else {
                              setCustomAmountMode(false);
                              updateField('loanAmount', Number(e.target.value));
                            }
                          }}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          {OFFICIAL_RATE_TABLE.map((row) => (
                            <option key={row.amount} value={row.amount}>
                              {formatCurrency(row.amount)} ({row.label})
                            </option>
                          ))}
                          <option value="custom">Outro valor ({formatCurrency(form.loanAmount)})</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="loan-installments" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Parcelamento
                        </label>
                        <select
                          id="loan-installments"
                          value={form.installments}
                          onChange={(e) => updateField('installments', Number(e.target.value))}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          {INSTALLMENT_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                              {count}x mensais
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="first-due-date" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          1º Vencimento Previsto
                        </label>
                        <input
                          id="first-due-date"
                          type="date"
                          value={form.firstDueDate}
                          onChange={(e) => updateField('firstDueDate', e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>
                    </div>

                    {customAmountMode && (
                      <div>
                        <label htmlFor="custom-amount-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Digite o valor desejado (entre R$ 1.000,00 e R$ 100.000,00)
                        </label>
                        <input
                          id="custom-amount-input"
                          type="number"
                          min={1000}
                          max={100000}
                          step={100}
                          value={form.loanAmount}
                          onChange={(e) =>
                            updateField(
                              'loanAmount',
                              Math.max(1000, Math.min(100000, Number(e.target.value) || 1000))
                            )
                          }
                          className="w-full sm:w-64 h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Bloco 02: Dados Pessoais do Contratante */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 space-y-5">
                    <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-200">
                      <UserCheck className="w-5 h-5 text-[#A51C20]" />
                      <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                        02. Dados Pessoais e Endereço do Contratante
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label htmlFor="full-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Nome Completo *
                        </label>
                        <input
                          id="full-name"
                          type="text"
                          required
                          value={form.fullName}
                          onChange={(e) => updateField('fullName', e.target.value)}
                          placeholder="Ex.: Maria Aparecida da Silva"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="cpf" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          CPF *
                        </label>
                        <input
                          id="cpf"
                          type="text"
                          inputMode="numeric"
                          required
                          value={form.cpf}
                          onChange={(e) => updateField('cpf', formatCPF(e.target.value))}
                          placeholder="000.000.000-00"
                          className={`w-full h-11 px-3.5 rounded-xl border bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                            cpfDigits.length === 11 && !cpfIsValid
                              ? 'border-red-400 focus:ring-red-200'
                              : 'border-zinc-300 focus:ring-[#A51C20]/25 focus:border-[#A51C20]'
                          }`}
                        />
                        {cpfDigits.length === 11 && (
                          <p className={`text-[11px] mt-1 font-medium ${cpfIsValid ? 'text-emerald-700' : 'text-red-600'}`}>
                            {cpfIsValid ? 'CPF válido' : 'CPF inválido — confira os números'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="rg-cnh" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          RG ou CNH *
                        </label>
                        <input
                          id="rg-cnh"
                          type="text"
                          required
                          value={form.rgOrCnh}
                          onChange={(e) => updateField('rgOrCnh', e.target.value)}
                          placeholder="Número do documento"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="birth-date" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Data de Nascimento *
                        </label>
                        <input
                          id="birth-date"
                          type="date"
                          required
                          value={form.birthDate}
                          onChange={(e) => updateField('birthDate', e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="marital-status" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Estado Civil
                        </label>
                        <select
                          id="marital-status"
                          value={form.maritalStatus}
                          onChange={(e) => updateField('maritalStatus', e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          <option value="Solteiro(a)">Solteiro(a)</option>
                          <option value="Casado(a)">Casado(a)</option>
                          <option value="União Estável">União Estável</option>
                          <option value="Divorciado(a)">Divorciado(a)</option>
                          <option value="Viúvo(a)">Viúvo(a)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="occupation" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Profissão / Ocupação
                        </label>
                        <input
                          id="occupation"
                          type="text"
                          value={form.occupation}
                          onChange={(e) => updateField('occupation', e.target.value)}
                          placeholder="Ex.: Autônomo, Aposentado, CLT"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="monthly-income" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Renda Mensal Aproximada
                        </label>
                        <input
                          id="monthly-income"
                          type="text"
                          value={form.monthlyIncome}
                          onChange={(e) => updateField('monthlyIncome', e.target.value)}
                          placeholder="Ex.: R$ 3.500,00"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="phone" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Celular / WhatsApp *
                        </label>
                        <input
                          id="phone"
                          type="tel"
                          required
                          value={form.phone}
                          onChange={(e) => updateField('phone', formatPhone(e.target.value))}
                          placeholder="(11) 99999-9999"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          E-mail *
                        </label>
                        <input
                          id="email"
                          type="email"
                          required
                          value={form.email}
                          onChange={(e) => updateField('email', e.target.value)}
                          placeholder="nome@exemplo.com"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-6 gap-4">
                      <div className="sm:col-span-2">
                        <label htmlFor="cep" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          CEP
                        </label>
                        <input
                          id="cep"
                          type="text"
                          inputMode="numeric"
                          value={form.cep}
                          onChange={(e) => updateField('cep', formatCEP(e.target.value))}
                          placeholder="00000-000"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label htmlFor="street" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Rua / Avenida *
                        </label>
                        <input
                          id="street"
                          type="text"
                          required
                          value={form.street}
                          onChange={(e) => updateField('street', e.target.value)}
                          placeholder="Nome da rua ou avenida"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <label htmlFor="number" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Nº *
                        </label>
                        <input
                          id="number"
                          type="text"
                          required
                          value={form.number}
                          onChange={(e) => updateField('number', e.target.value)}
                          placeholder="123"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="complement" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Complemento
                        </label>
                        <input
                          id="complement"
                          type="text"
                          value={form.complement}
                          onChange={(e) => updateField('complement', e.target.value)}
                          placeholder="Apto, Casa, Bloco"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label htmlFor="neighborhood" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Bairro
                        </label>
                        <input
                          id="neighborhood"
                          type="text"
                          value={form.neighborhood}
                          onChange={(e) => updateField('neighborhood', e.target.value)}
                          placeholder="Bairro"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label htmlFor="city" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Cidade *
                        </label>
                        <input
                          id="city"
                          type="text"
                          required
                          value={form.city}
                          onChange={(e) => updateField('city', e.target.value)}
                          placeholder="Cidade"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="state" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          UF *
                        </label>
                        <select
                          id="state"
                          value={form.state}
                          onChange={(e) => updateField('state', e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          {BRAZILIAN_STATES.map((uf) => (
                            <option key={uf} value={uf}>
                              {uf}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Bloco 03: Dados Bancários / PIX para Recebimento */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 space-y-5">
                    <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-200">
                      <Building2 className="w-5 h-5 text-[#A51C20]" />
                      <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                        03. Dados Bancários e Chave PIX para Recebimento
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="bank-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Banco *
                        </label>
                        <select
                          id="bank-name"
                          value={form.bankName}
                          onChange={(e) => updateField('bankName', e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          {BRAZILIAN_BANKS.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="account-type" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Tipo de Conta *
                        </label>
                        <select
                          id="account-type"
                          value={form.accountType}
                          onChange={(e) => updateField('accountType', e.target.value as AccountType)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          <option value="Conta Corrente">Conta Corrente</option>
                          <option value="Conta Poupança">Conta Poupança</option>
                          <option value="Conta Pagamento">Conta Pagamento</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="agency" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Agência *
                        </label>
                        <input
                          id="agency"
                          type="text"
                          required
                          value={form.agency}
                          onChange={(e) => updateField('agency', e.target.value)}
                          placeholder="Ex.: 0001"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="account-number" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Número da Conta (com dígito) *
                        </label>
                        <input
                          id="account-number"
                          type="text"
                          required
                          value={form.accountNumber}
                          onChange={(e) => updateField('accountNumber', e.target.value)}
                          placeholder="Ex.: 123456-7"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>

                      <div>
                        <label htmlFor="pix-type" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Tipo de Chave PIX *
                        </label>
                        <select
                          id="pix-type"
                          value={form.pixKeyType}
                          onChange={(e) => updateField('pixKeyType', e.target.value as PixKeyType)}
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        >
                          <option value="CPF">CPF</option>
                          <option value="Celular">Celular</option>
                          <option value="E-mail">E-mail</option>
                          <option value="Chave Aleatória">Chave Aleatória</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="pix-key" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Chave PIX *
                        </label>
                        <input
                          id="pix-key"
                          type="text"
                          required
                          value={form.pixKey}
                          onChange={(e) => updateField('pixKey', e.target.value)}
                          placeholder="Informe sua chave PIX para depósito"
                          className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco 04: Cláusulas, Aceite e Assinatura na Tela */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-[#A51C20]" />
                        <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                          04. Termos Contratuais e Assinatura Digital
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFullDraft((v) => !v)}
                        className="text-xs font-semibold text-[#A51C20] hover:text-[#8B1519] underline underline-offset-4 text-left sm:text-right cursor-pointer"
                      >
                        {showFullDraft ? 'Recolher minuta completa' : 'Ver minuta completa com cláusulas'}
                      </button>
                    </div>

                    {/* Resumo das Cláusulas */}
                    {showFullDraft ? (
                      <ContractDocument data={currentFormWithCalculations} />
                    ) : (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 space-y-3 text-xs sm:text-sm text-zinc-700 font-serif-legal max-h-64 overflow-y-auto">
                        <p>
                          <strong>CLÁUSULA 1ª — DO OBJETO:</strong> A {COMPANY_INFO.legalName} (CNPJ {COMPANY_INFO.cnpj}) concede ao contratante empréstimo pessoal no valor de{' '}
                          <strong>{formatCurrency(form.loanAmount)}</strong>, a ser pago em{' '}
                          <strong>{form.installments} parcelas mensais de {formatCurrency(computedInstallment)}</strong>.
                        </p>
                        <p>
                          <strong>CLÁUSULA 2ª — LIBERAÇÃO:</strong> Crédito via TED ou PIX exclusivamente em conta bancária de mesma titularidade do CPF informado após conferência cadastral e assinatura digital.
                        </p>
                        <p>
                          <strong>CLÁUSULA 3ª — JUROS E CET:</strong> Taxa remuneratória prefixada de {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês ({COMPANY_INFO.annualRatePercent.toFixed(2).replace('.', ',')}% ao ano), sem tarifas ocultas ou depósitos antecipados.
                        </p>
                        <p>
                          <strong>CLÁUSULA 4ª — QUITAÇÃO ANTECIPADA:</strong> Garantido o abatimento proporcional de juros em caso de liquidação antecipada, conforme art. 52, §2º do Código de Defesa do Consumidor.
                        </p>
                        <p>
                          <strong>CLÁUSULA 5ª — ASSINATURA ELETRÔNICA E LGPD:</strong> Assinatura digital válida nos termos da Lei nº 14.063/2020 e MP 2.200-2/2001, com registro de integridade SHA-256 e tratamento de dados conforme Lei nº 13.709/2018 (LGPD).
                        </p>
                      </div>
                    )}

                    {/* Checkboxes obrigatórios */}
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={form.acceptedTerms}
                          onChange={(e) => updateField('acceptedTerms', e.target.checked)}
                          className="mt-0.5 w-5 h-5 rounded border-zinc-300 text-[#A51C20] focus:ring-[#A51C20] shrink-0"
                        />
                        <span className="text-sm text-zinc-800 leading-snug">
                          Li e concordo integralmente com todas as cláusulas, taxas ({COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m.) e termos do Contrato de Empréstimo Pessoal da {COMPANY_INFO.name} (CNPJ {COMPANY_INFO.cnpj}).
                        </span>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={form.acceptedDataTruth}
                          onChange={(e) => updateField('acceptedDataTruth', e.target.checked)}
                          className="mt-0.5 w-5 h-5 rounded border-zinc-300 text-[#A51C20] focus:ring-[#A51C20] shrink-0"
                        />
                        <span className="text-sm text-zinc-800 leading-snug">
                          Declaro que os dados pessoais, endereço e conta bancária/PIX informados são verdadeiros e de minha titularidade, autorizando sua autenticação eletrônica.
                        </span>
                      </label>
                    </div>

                    {/* Canvas de Assinatura Manuscrita */}
                    <SignatureCanvas
                      value={form.signatureDataUrl}
                      onChange={(dataUrl) => updateField('signatureDataUrl', dataUrl)}
                      signerName={form.fullName}
                    />

                    {submitError && (
                      <div className="flex items-start gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-14 px-6 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white font-bold text-base inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Gerando Contrato e QR Code...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          Finalizar, Assinar e Gerar QR Code
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Coluna Lateral Fixa no Desktop: Resumo Ao Vivo do Contrato */}
                <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5">
                    <div className="pb-4 border-b border-zinc-200">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Resumo do Contrato
                      </p>
                      <p className="font-mono-data text-2xl font-extrabold text-zinc-900 mt-1">
                        {formatCurrency(form.loanAmount)}
                      </p>
                      <p className="text-sm text-zinc-600 mt-0.5">
                        em <strong className="text-zinc-900">{form.installments}x</strong> de{' '}
                        <strong className="font-mono-data text-[#A51C20]">
                          {formatCurrency(computedInstallment)}
                        </strong>
                      </p>
                    </div>

                    <dl className="space-y-2.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Empresa:</dt>
                        <dd className="font-semibold text-zinc-900 text-right">{COMPANY_INFO.name}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">CNPJ:</dt>
                        <dd className="font-mono-data text-zinc-800 text-right">{COMPANY_INFO.cnpj}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Taxa de Juros:</dt>
                        <dd className="font-mono-data text-zinc-800 text-right">
                          {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m.
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Total a Pagar:</dt>
                        <dd className="font-mono-data font-bold text-zinc-900 text-right">
                          {formatCurrency(computedTotal)}
                        </dd>
                      </div>
                    </dl>

                    <div className="pt-4 border-t border-zinc-200 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Conferência de Preenchimento
                      </p>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              form.fullName.trim().length >= 5 && cpfIsValid
                                ? 'text-emerald-600'
                                : 'text-zinc-300'
                            }`}
                          />
                          <span className="text-zinc-700">Nome e CPF validado</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              form.agency.trim() && form.accountNumber.trim() && form.pixKey.trim()
                                ? 'text-emerald-600'
                                : 'text-zinc-300'
                            }`}
                          />
                          <span className="text-zinc-700">Dados bancários e PIX</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              form.acceptedTerms && form.acceptedDataTruth
                                ? 'text-emerald-600'
                                : 'text-zinc-300'
                            }`}
                          />
                          <span className="text-zinc-700">Cláusulas e termos aceitos</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              form.signatureDataUrl ? 'text-emerald-600' : 'text-zinc-300'
                            }`}
                          />
                          <span className="text-zinc-700">Assinatura digital desenhada</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </aside>
              </form>
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
              Contratação eletrônica protegida conforme Lei nº 14.063/2020 e LGPD (Lei nº 13.709/2018).
            </p>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => scrollToSection('table')}
              className="hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Tabela de Taxas
            </button>
            <button
              type="button"
              onClick={() => {
                setView('consult');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Consultar Contrato
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
