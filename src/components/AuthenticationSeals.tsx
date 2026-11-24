import React from 'react';
import { Award, CheckCircle2, FileCheck2, Lock, ShieldCheck } from 'lucide-react';
import { COMPANY_INFO } from '../lib/loanTable';

interface AuthenticationSealsProps {
  certificateCode?: string;
  integrityHash?: string;
  signedAt?: string;
  compact?: boolean;
}

export const AuthenticationSeals: React.FC<AuthenticationSealsProps> = ({
  certificateCode = 'ICP-RP-ATIVO',
  integrityHash,
  signedAt,
  compact = false,
}) => {
  const formattedDate = signedAt
    ? new Date(signedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
    : 'Emissão em tempo real';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-zinc-200">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#A51C20] shrink-0" />
          <h3 className="text-sm sm:text-base font-bold text-zinc-900">
            Selos de Autenticação e Certificado Digital
          </h3>
        </div>
        <span className="font-mono-data text-xs text-zinc-500">
          {COMPANY_INFO.name} · CNPJ {COMPANY_INFO.cnpj}
        </span>
      </div>

      <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-4 pt-4`}>
        {/* Seal 1 */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-zinc-200 bg-zinc-50/70">
          <div className="w-10 h-10 rounded-full border-2 border-[#A51C20]/30 bg-red-50 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-[#A51C20]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900">Assinatura Eletrônica</p>
            <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
              Validade jurídica conforme Lei nº 14.063/2020 e MP 2.200-2/2001.
            </p>
          </div>
        </div>

        {/* Seal 2 */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-zinc-200 bg-zinc-50/70">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-700/25 bg-emerald-50 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900">Criptografia SHA-256</p>
            <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
              Documento protegido contra adulteração com hash criptográfico.
            </p>
          </div>
        </div>

        {/* Seal 3 */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-zinc-200 bg-zinc-50/70">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-800/20 bg-zinc-100 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5 text-zinc-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900">Certificado RP Digital</p>
            <p className="font-mono-data text-[11px] text-zinc-700 mt-0.5 truncate">
              {certificateCode}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{formattedDate}</p>
          </div>
        </div>

        {/* Seal 4 */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-zinc-200 bg-zinc-50/70">
          <div className="w-10 h-10 rounded-full border-2 border-blue-800/20 bg-blue-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-blue-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900">Conformidade LGPD</p>
            <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
              Dados pessoais tratados sob sigilo bancário e Lei nº 13.709/2018.
            </p>
          </div>
        </div>
      </div>

      {integrityHash && (
        <div className="mt-4 pt-3 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="text-zinc-500 font-medium">Selo de Integridade (SHA-256):</span>
          <code className="font-mono-data text-[11px] text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded break-all">
            {integrityHash}
          </code>
        </div>
      )}
    </div>
  );
};
