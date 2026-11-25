import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Copy,
  Check,
  Printer,
  Share2,
  ShieldCheck,
  FilePlus2,
  AlertCircle,
} from 'lucide-react';
import { COMPANY_INFO } from '../lib/loanTable';
import type { ContractVerificationAudit, SignedLoanContract } from '../types/contract';
import { ContractDocument } from './ContractDocument';

interface SignedReceiptViewProps {
  contract: SignedLoanContract;
  audit: ContractVerificationAudit;
  onStartNewContract: () => void;
  closeLabel?: string;
}

export const SignedReceiptView: React.FC<SignedReceiptViewProps> = ({
  contract,
  audit,
  onStartNewContract,
  closeLabel = 'Novo Contrato',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const params = new URLSearchParams({ contrato: contract.protocol, chave: contract.accessToken });
  const verificationUrl = window.location.origin + '/?' + params.toString();

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(verificationUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#18181B',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Erro ao gerar QR Code:', err);
      });
    return () => {
      active = false;
    };
  }, [verificationUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback selection handled if clipboard blocked
    }
  };

  const formattedDueDate = contract.firstDueDate
    ? new Date(`${contract.firstDueDate}T12:00:00`).toLocaleDateString('pt-BR')
    : '30 dias após assinatura';

  const whatsappMessage = [
    `*CONTRATO ASSINADO — ${COMPANY_INFO.name}*`,
    `CNPJ: ${COMPANY_INFO.cnpj}`,
    ``,
    `*Protocolo:* ${contract.protocol}`,
    `*Cliente:* ${contract.fullName}`,
    `*CPF:* ${contract.cpf}`,
    `*1º Vencimento:* ${formattedDueDate}`,
    `*Faturas:* ${contract.invoiceDeliveryMethod || 'WhatsApp'}`,
    `*Status:* Assinado Digitalmente e Autenticado`,
    ``,
    `Acesse o link abaixo para consultar o contrato completo, dados e assinatura:`,
    verificationUrl,
  ].join('\n');

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  const allChecksPassed =
    audit.personalDataComplete &&
    audit.cpfValid &&
    audit.bankDataComplete &&
    audit.loanTermsValid &&
    audit.clausesAccepted &&
    audit.signaturePresent &&
    audit.hashVerified;

  const auditItems = [
    { label: 'Dados pessoais preenchidos', ok: audit.personalDataComplete },
    { label: 'CPF validado matematicamente', ok: audit.cpfValid },
    { label: 'Conta bancária e PIX informados', ok: audit.bankDataComplete },
    { label: 'Registro contratual e vencimento validados', ok: audit.loanTermsValid },
    { label: 'Termos e cláusulas aceitos', ok: audit.clausesAccepted },
    { label: 'Assinatura digital manuscrita capturada', ok: audit.signaturePresent },
    { label: 'Integridade SHA-256 conferida', ok: audit.hashVerified },
  ];

  return (
    <div className="space-y-6">
      {/* Banner de Confirmação e QR Code */}
      <div className="no-print rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div
          className={`px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            allChecksPassed
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-amber-50/70 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {allChecksPassed ? (
              <ShieldCheck className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900">
                {allChecksPassed
                  ? 'Contrato Assinado e Autenticado com Sucesso'
                  : 'Contrato Registrado — Atenção na Conferência'}
              </h2>
              <p className="text-sm text-zinc-700 mt-0.5">
                Protocolo <span className="font-mono-data font-bold">{contract.protocol}</span> · Assinado em{' '}
                {new Date(contract.signedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar PDF
            </button>
            <button
              type="button"
              onClick={onStartNewContract}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              {closeLabel}
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Coluna Esquerda: QR Code + Link + WhatsApp */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-5 rounded-xl border border-zinc-200 bg-zinc-50/70">
              <div className="w-44 h-44 rounded-xl border border-zinc-200 bg-white p-2.5 flex items-center justify-center shrink-0">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code de consulta do contrato ${contract.protocol}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-zinc-400">Gerando QR Code...</span>
                )}
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h3 className="text-base font-bold text-zinc-900">
                  QR Code e Link de Consulta Direta
                </h3>
                <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
                  Encaminhe este link ou QR Code pelo WhatsApp para comprovar que o contrato foi preenchido corretamente e assinado digitalmente.
                </p>

                <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Share2 className="w-4 h-4" />
                    Enviar no WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    {copied ? (
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
                </div>
              </div>
            </div>

            {/* URL Completa para cópia manual */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                Link Direto de Verificação (Consulta Autenticada)
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5">
                <input
                  type="text"
                  readOnly
                  value={verificationUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent font-mono-data text-xs text-zinc-700 focus:outline-none"
                  aria-label="Link direto de verificação do contrato"
                />
              </div>
            </div>
          </div>

          {/* Coluna Direita: Checklist de Conferência Automática */}
          <div className="lg:col-span-5 rounded-xl border border-zinc-200 p-5 bg-white">
            <h3 className="text-sm font-bold text-zinc-900 pb-3 border-b border-zinc-200">
              Auditoria de Preenchimento e Assinatura
            </h3>
            <ul className="mt-3 space-y-2.5">
              {auditItems.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span className={item.ok ? 'text-zinc-800' : 'text-red-700 font-medium'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-zinc-200 text-xs text-zinc-500 space-y-1">
              <p>
                Certificado: <span className="font-mono-data text-zinc-800">{contract.certificateCode}</span>
              </p>
              <p>
                Para consulta manual sem link, informe o protocolo{' '}
                <span className="font-mono-data font-semibold text-zinc-800">{contract.protocol}</span> e o CPF do contratante.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Documento Completo com Assinatura e Selos */}
      <ContractDocument data={contract} isSignedRecord />
    </div>
  );
};
