import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  BRAZILIAN_BANKS,
  BRAZILIAN_STATES,
  COMPANY_INFO,
  formatCEP,
  formatCPF,
  formatCurrency,
  formatPhone,
  INSTALLMENT_OPTIONS,
  isValidCPF,
  OFFICIAL_RATE_TABLE,
  onlyDigits,
} from '../lib/loanTable';
import type { AccountType, LoanContractInput, PixKeyType } from '../types/contract';
import { SignatureCanvas } from './SignatureCanvas';
import { ContractDocument } from './ContractDocument';
import { AuthenticationSeals } from './AuthenticationSeals';

interface ContractWizardProps {
  form: LoanContractInput;
  computedInstallment: number;
  computedTotal: number;
  customAmountMode: boolean;
  setCustomAmountMode: React.Dispatch<React.SetStateAction<boolean>>;
  updateField: <K extends keyof LoanContractInput>(key: K, value: LoanContractInput[K]) => void;
  onStrokesChange: (compact: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  submitError: string;
  setSubmitError: (msg: string) => void;
  agentName?: string;
}

const STEPS = [
  { id: 1, title: 'Valor e Parcelas', shortTitle: 'Valor', icon: Banknote },
  { id: 2, title: 'Dados Pessoais', shortTitle: 'Dados', icon: UserCheck },
  { id: 3, title: 'Conta e PIX', shortTitle: 'Banco', icon: Building2 },
  { id: 4, title: 'Termos e Assinatura', shortTitle: 'Assinar', icon: FileText },
] as const;

export const ContractWizard: React.FC<ContractWizardProps> = ({
  form,
  computedInstallment,
  computedTotal,
  customAmountMode,
  setCustomAmountMode,
  updateField,
  onStrokesChange,
  onSubmit,
  submitting,
  submitError,
  setSubmitError,
  agentName,
}) => {
  const [step, setStep] = useState<number>(1);
  const [stepError, setStepError] = useState<string>('');
  const [showFullDraft, setShowFullDraft] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFeedback, setCepFeedback] = useState('');
  const wizardTopRef = useRef<HTMLDivElement | null>(null);

  const cpfDigits = onlyDigits(form.cpf);
  const cpfIsValid = cpfDigits.length === 11 && isValidCPF(form.cpf);
  const cepDigits = onlyDigits(form.cep);

  const lookupCep = async (rawCep: string) => {
    const clean = onlyDigits(rawCep);
    if (clean.length !== 8) return;
    setCepLoading(true);
    setCepFeedback('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) throw new Error('Falha ao consultar CEP');
      const data = await res.json();
      if (data.erro) {
        setCepFeedback('CEP não encontrado — confira os números ou preencha manualmente.');
        return;
      }
      if (data.logradouro) updateField('street', data.logradouro);
      if (data.bairro) updateField('neighborhood', data.bairro);
      if (data.localidade) updateField('city', data.localidade);
      if (data.uf && BRAZILIAN_STATES.includes(data.uf)) updateField('state', data.uf);
      setCepFeedback('Endereço preenchido automaticamente.');
    } catch {
      setCepFeedback('Não foi possível consultar o CEP automaticamente. Preencha os campos abaixo.');
    } finally {
      setCepLoading(false);
    }
  };

  const isStepComplete = (stepNum: number): boolean => {
    if (stepNum === 1) {
      return form.loanAmount >= 1000 && form.loanAmount <= 100000 && form.installments >= 6;
    }
    if (stepNum === 2) {
      return (
        form.fullName.trim().length >= 5 &&
        cpfIsValid &&
        form.rgOrCnh.trim().length >= 4 &&
        Boolean(form.birthDate) &&
        onlyDigits(form.phone).length >= 10 &&
        form.email.includes('@') &&
        form.email.includes('.') &&
        cepDigits.length === 8 &&
        Boolean(form.street.trim() && form.number.trim() && form.city.trim())
      );
    }
    if (stepNum === 3) {
      return Boolean(
        form.bankName &&
          form.agency.trim().length >= 2 &&
          form.accountNumber.trim().length >= 3 &&
          form.pixKey.trim().length >= 3
      );
    }
    return Boolean(form.acceptedTerms && form.acceptedDataTruth && form.signatureDataUrl);
  };

  const validateStep = (stepNum: number): string | null => {
    if (stepNum === 1) {
      if (form.loanAmount < 1000 || form.loanAmount > 100000) {
        return 'O valor do empréstimo deve estar entre R$ 1.000,00 e R$ 100.000,00.';
      }
      if (!form.firstDueDate) {
        return 'Selecione a data prevista para o 1º vencimento.';
      }
      return null;
    }
    if (stepNum === 2) {
      if (form.fullName.trim().length < 5) {
        return 'Informe seu nome completo conforme documento oficial.';
      }
      if (!cpfIsValid) {
        return 'CPF inválido. Apenas CPFs válidos são aceitos para contratação.';
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
      if (cepDigits.length !== 8) {
        return 'Informe um CEP válido com 8 dígitos para buscar o endereço.';
      }
      if (!form.street.trim() || !form.number.trim() || !form.city.trim()) {
        return 'Preencha o endereço completo (rua, número e cidade).';
      }
      return null;
    }
    if (stepNum === 3) {
      if (!form.bankName || !form.agency.trim() || !form.accountNumber.trim() || !form.pixKey.trim()) {
        return 'Preencha o banco, agência, número da conta e a chave PIX para recebimento.';
      }
      return null;
    }
    return null;
  };

  const scrollWizardTop = () => {
    setTimeout(() => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const handleNext = () => {
    setStepError('');
    setSubmitError('');
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
    scrollWizardTop();
  };

  const handleBack = () => {
    setStepError('');
    setSubmitError('');
    setStep((s) => Math.max(1, s - 1));
    scrollWizardTop();
  };

  const handleJumpToStep = (target: number) => {
    setStepError('');
    setSubmitError('');
    if (target <= step) {
      setStep(target);
      scrollWizardTop();
      return;
    }
    // Validate sequential steps up to target - 1
    for (let s = 1; s < target; s++) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        setStepError(err);
        scrollWizardTop();
        return;
      }
    }
    setStep(target);
    scrollWizardTop();
  };

  const currentFormWithCalculations: LoanContractInput = {
    ...form,
    installmentValue: computedInstallment,
    totalPayable: computedTotal,
  };

  const progressPercent = (step / STEPS.length) * 100;

  return (
    <div ref={wizardTopRef} className="scroll-mt-24 space-y-6">
      {/* Cabeçalho e Barra de Etapas */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500">
              Etapa {step} de {STEPS.length} · Contratação Digital {COMPANY_INFO.name}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight mt-1">
              {STEPS[step - 1].title}
            </h2>
          </div>
          <p className="text-xs font-mono-data text-zinc-500">
            CNPJ {COMPANY_INFO.cnpj}
          </p>
        </div>

        {/* Barra de progresso contínua */}
        <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#A51C20] transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Navegação entre etapas */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {STEPS.map((item) => {
            const Icon = item.icon;
            const isActive = step === item.id;
            const completed = item.id < step && isStepComplete(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleJumpToStep(item.id)}
                className={`group flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 p-2.5 sm:px-3.5 sm:py-3 rounded-xl border text-left transition-all cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'border-[#A51C20] bg-red-50/50 text-zinc-900'
                    : completed
                    ? 'border-emerald-200 bg-emerald-50/40 text-zinc-800 hover:bg-emerald-50/70'
                    : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono-data font-bold shrink-0 ${
                    isActive
                      ? 'bg-[#A51C20] text-white'
                      : completed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {completed ? <Check className="w-3.5 h-3.5" /> : `0${item.id}`}
                </span>
                <span className="hidden sm:inline text-xs font-semibold truncate">
                  {item.title}
                </span>
                <span className="sm:hidden text-[11px] font-semibold truncate flex items-center gap-1">
                  <Icon className="w-3 h-3 hidden" />
                  {item.shortTitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Área da Etapa Atual */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-8 space-y-6"
            >
              {/* ETAPA 1: VALOR E PARCELAS */}
              {step === 1 && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-200">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">
                        Escolha o valor e a quantidade de parcelas
                      </h3>
                      <p className="text-sm text-zinc-600 mt-0.5">
                        Valores calculados automaticamente pela tabela oficial de {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomAmountMode((v) => !v)}
                      className="text-xs font-semibold text-[#A51C20] hover:text-[#8B1519] underline underline-offset-4 self-start sm:self-center cursor-pointer"
                    >
                      {customAmountMode ? 'Selecionar da tabela' : 'Informar outro valor'}
                    </button>
                  </div>

                  {customAmountMode ? (
                    <div className="space-y-2">
                      <label htmlFor="wizard-custom-amount" className="block text-sm font-semibold text-zinc-800">
                        Digite o valor desejado (R$ 1.000,00 a R$ 100.000,00)
                      </label>
                      <div className="relative max-w-xs">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono-data text-sm text-zinc-500">
                          R$
                        </span>
                        <input
                          id="wizard-custom-amount"
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
                          className="w-full h-12 pl-10 pr-4 rounded-xl border border-zinc-300 bg-white font-mono-data text-base font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-zinc-600 mb-2.5">
                        Valores disponíveis na tabela oficial:
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                        {OFFICIAL_RATE_TABLE.map((row) => {
                          const active = form.loanAmount === row.amount;
                          return (
                            <button
                              key={row.amount}
                              type="button"
                              onClick={() => updateField('loanAmount', row.amount)}
                              className={`h-12 px-2 rounded-xl border font-mono-data text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                                active
                                  ? 'border-[#A51C20] bg-[#A51C20] text-white shadow-sm'
                                  : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-zinc-100'
                              }`}
                            >
                              {row.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-zinc-600 mb-2.5">
                      Quantidade de parcelas mensais:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                      {INSTALLMENT_OPTIONS.map((count) => {
                        const active = form.installments === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            onClick={() => updateField('installments', count)}
                            className={`py-2.5 px-2 min-h-[52px] rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                              active
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50'
                            }`}
                          >
                            <span className="font-mono-data text-sm font-bold">{count}x</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-200">
                    <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                      <p className="text-xs text-zinc-500">Valor Solicitado</p>
                      <p className="font-mono-data text-xl font-extrabold text-zinc-900 mt-1">
                        {formatCurrency(form.loanAmount)}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-red-50/50 border border-red-200">
                      <p className="text-xs text-zinc-600">Parcela Mensal ({form.installments}x)</p>
                      <p className="font-mono-data text-xl font-extrabold text-[#A51C20] mt-1">
                        {formatCurrency(computedInstallment)}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="wizard-due-date" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        1º Vencimento Previsto
                      </label>
                      <input
                        id="wizard-due-date"
                        type="date"
                        value={form.firstDueDate}
                        onChange={(e) => updateField('firstDueDate', e.target.value)}
                        className="w-full h-12 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ETAPA 2: DADOS PESSOAIS */}
              {step === 2 && (
                <>
                  <div className="pb-4 border-b border-zinc-200">
                    <h3 className="text-lg font-bold text-zinc-900">
                      Dados Pessoais e Endereço do Contratante
                    </h3>
                    <p className="text-sm text-zinc-600 mt-0.5">
                      Preencha exatamente como consta em seu documento oficial de identificação.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label htmlFor="full-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Nome Completo *
                      </label>
                      <input
                        id="full-name"
                        type="text"
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
                        value={form.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="nome@exemplo.com"
                        className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                      />
                    </div>
                  </div>

                  <div className="pt-5 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-6 gap-4">
                    <div className="sm:col-span-2">
                      <label htmlFor="cep" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        CEP (preenche automático) *
                      </label>
                      <div className="relative">
                        <input
                          id="cep"
                          type="text"
                          inputMode="numeric"
                          value={form.cep}
                          onChange={(e) => {
                            const formatted = formatCEP(e.target.value);
                            updateField('cep', formatted);
                            setCepFeedback('');
                            if (onlyDigits(formatted).length === 8) {
                              void lookupCep(formatted);
                            }
                          }}
                          placeholder="00000-000"
                          className="w-full h-11 pl-3.5 pr-9 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                        />
                        {cepLoading && (
                          <Loader2 className="w-4 h-4 text-[#A51C20] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                        )}
                      </div>
                      {cepFeedback && (
                        <p
                          className={`text-[11px] mt-1 font-medium ${
                            cepFeedback.includes('automaticamente') ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {cepFeedback}
                        </p>
                      )}
                    </div>

                    <div className="sm:col-span-4">
                      <label htmlFor="street" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Rua / Avenida *
                      </label>
                      <input
                        id="street"
                        type="text"
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
                </>
              )}

              {/* ETAPA 3: DADOS BANCÁRIOS E PIX */}
              {step === 3 && (
                <>
                  <div className="pb-4 border-b border-zinc-200">
                    <h3 className="text-lg font-bold text-zinc-900">
                      Dados Bancários e Chave PIX para Recebimento
                    </h3>
                    <p className="text-sm text-zinc-600 mt-0.5">
                      Informe a conta de sua titularidade onde o valor de{' '}
                      <strong className="font-mono-data text-zinc-900">{formatCurrency(form.loanAmount)}</strong> será depositado.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="bank-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Banco / Instituição *
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
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="pix-key" className="block text-xs font-semibold text-zinc-700">
                          Chave PIX *
                        </label>
                        {form.pixKeyType === 'CPF' && form.cpf && (
                          <button
                            type="button"
                            onClick={() => updateField('pixKey', form.cpf)}
                            className="text-[11px] font-semibold text-[#A51C20] hover:underline cursor-pointer"
                          >
                            Usar meu CPF
                          </button>
                        )}
                        {form.pixKeyType === 'Celular' && form.phone && (
                          <button
                            type="button"
                            onClick={() => updateField('pixKey', form.phone)}
                            className="text-[11px] font-semibold text-[#A51C20] hover:underline cursor-pointer"
                          >
                            Usar meu celular
                          </button>
                        )}
                        {form.pixKeyType === 'E-mail' && form.email && (
                          <button
                            type="button"
                            onClick={() => updateField('pixKey', form.email)}
                            className="text-[11px] font-semibold text-[#A51C20] hover:underline cursor-pointer"
                          >
                            Usar meu e-mail
                          </button>
                        )}
                      </div>
                      <input
                        id="pix-key"
                        type="text"
                        value={form.pixKey}
                        onChange={(e) => updateField('pixKey', e.target.value)}
                        placeholder="Informe sua chave PIX para depósito"
                        className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs sm:text-sm text-zinc-600">
                    Por segurança antifraude, a liberação do crédito é realizada exclusivamente para conta bancária vinculada ao CPF <strong className="font-mono-data text-zinc-900">{form.cpf || 'informado'}</strong>.
                  </div>
                </>
              )}

              {/* ETAPA 4: TERMOS, SELOS E ASSINATURA NA TELA */}
              {step === 4 && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-200">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">
                        Revisão Final, Cláusulas e Assinatura Online
                      </h3>
                      <p className="text-sm text-zinc-600 mt-0.5">
                        Confira seus dados, leia os termos e assine diretamente na tela para gerar seu QR Code.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFullDraft((v) => !v)}
                      className="text-xs font-semibold text-[#A51C20] hover:text-[#8B1519] underline underline-offset-4 self-start sm:self-center cursor-pointer"
                    >
                      {showFullDraft ? 'Recolher minuta completa' : 'Ver minuta completa do contrato'}
                    </button>
                  </div>

                  {/* Revisão rápida dos dados preenchidos */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 text-xs">
                    <div>
                      <p className="text-zinc-500 font-medium">Crédito Selecionado</p>
                      <p className="font-mono-data font-bold text-zinc-900 text-sm mt-0.5">
                        {formatCurrency(form.loanAmount)}
                      </p>
                      <p className="font-mono-data text-zinc-600">
                        {form.installments}x de {formatCurrency(computedInstallment)}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500 font-medium">Contratante</p>
                      <p className="font-bold text-zinc-900 text-sm mt-0.5 truncate">{form.fullName}</p>
                      <p className="font-mono-data text-zinc-600">CPF {form.cpf}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 font-medium">Recebimento</p>
                      <p className="font-bold text-zinc-900 text-sm mt-0.5 truncate">{form.bankName}</p>
                      <p className="font-mono-data text-zinc-600 truncate">PIX: {form.pixKey}</p>
                    </div>
                  </div>

                  {/* Termos e Cláusulas */}
                  {showFullDraft ? (
                    <ContractDocument data={currentFormWithCalculations} />
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 space-y-3 text-xs sm:text-sm text-zinc-700 font-serif-legal max-h-60 overflow-y-auto">
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

                  {/* Selos de Autenticação compactos */}
                  <AuthenticationSeals compact />

                  {/* Checkboxes de Aceite */}
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

                  {/* Assinatura Digital Manuscrita */}
                  <SignatureCanvas
                    value={form.signatureDataUrl}
                    onChange={(dataUrl) => updateField('signatureDataUrl', dataUrl)}
                    onStrokesChange={onStrokesChange}
                    signerName={form.fullName}
                  />
                </>
              )}

              {/* Alertas de Erro */}
              {(stepError || submitError) && (
                <div className="flex items-start gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{stepError || submitError}</span>
                </div>
              )}

              {/* Rodapé de Navegação das Etapas */}
              <div className="pt-4 border-t border-zinc-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="h-12 px-5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar Etapa
                  </button>
                ) : (
                  <div />
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="h-12 px-6 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    Continuar para Etapa 0{step + 1}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-13 px-7 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
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
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Coluna Lateral Fixa no Desktop: Resumo Ao Vivo */}
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
              {agentName && (
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Consultor:</dt>
                  <dd className="font-semibold text-zinc-900 text-right">{agentName}</dd>
                </div>
              )}
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

            <div className="pt-4 border-t border-zinc-200 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Progresso do Preenchimento
              </p>
              <ul className="space-y-2 text-xs">
                {STEPS.map((s) => {
                  const done = isStepComplete(s.id);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleJumpToStep(s.id)}
                        className="flex items-center gap-2 text-left hover:text-zinc-900 cursor-pointer"
                      >
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            done ? 'text-emerald-600' : step === s.id ? 'text-[#A51C20]' : 'text-zinc-300'
                          }`}
                        />
                        <span className={step === s.id ? 'font-bold text-zinc-900' : 'text-zinc-700'}>
                          0{s.id}. {s.title}
                        </span>
                      </button>
                      <span className="text-[11px] font-medium text-zinc-400">
                        {done ? 'Pronto' : step === s.id ? 'Atual' : 'Pendente'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
};
