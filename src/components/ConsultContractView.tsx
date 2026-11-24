import React, { useState } from 'react';
import { Search, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { formatCPF, isValidCPF } from '../lib/loanTable';
import type { ContractVerificationAudit, SignedLoanContract } from '../types/contract';
import { SignedReceiptView } from './SignedReceiptView';

interface ConsultContractViewProps {
  onStartNewContract: () => void;
}

export const ConsultContractView: React.FC<ConsultContractViewProps> = ({
  onStartNewContract,
}) => {
  const [protocol, setProtocol] = useState('');
  const [cpf, setCpf] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    contract: SignedLoanContract;
    audit: ContractVerificationAudit;
  } | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let params: URLSearchParams;
    if (linkInput.trim()) {
      try {
        const url = new URL(linkInput.trim(), window.location.origin);
        const protocol = url.searchParams.get('contrato');
        const token = url.searchParams.get('chave');
        if (!protocol || !token) throw new Error('Link inválido');
        params = new URLSearchParams({ protocol, token });
      } catch {
        setError('Cole um link de verificação emitido pelo servidor.');
        return;
      }
    } else {
      const cleanProtocol = protocol.trim().toUpperCase();
      if (!cleanProtocol || !isValidCPF(cpf)) {
        setError('Informe o número do protocolo e um CPF válido.');
        return;
      }
      params = new URLSearchParams({ protocol: cleanProtocol, cpf });
    }

    setLoading(true);
    try {
      const res = await fetch('/api/contracts/lookup?' + params.toString());
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Servidor indisponível. Tente novamente.');
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Contrato não encontrado.');
      setResult({ contract: json.contract, audit: json.audit });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Não foi possível consultar o contrato.');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between">
          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 underline underline-offset-4"
          >
            Fazer outra consulta
          </button>
        </div>
        <SignedReceiptView
          contract={result.contract}
          audit={result.audit}
          onStartNewContract={onStartNewContract}
        />
      </div>
    );
  }

  return (
    <section className="max-w-2xl mx-auto rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-3 pb-5 border-b border-zinc-200">
        <ShieldCheck className="w-6 h-6 text-[#A51C20] shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
            Consultar e Conferir Contrato Assinado
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Verifique se o contrato de empréstimo foi preenchido corretamente e assinado digitalmente usando o número de protocolo e o CPF do cliente.
          </p>
        </div>
      </div>

      <form onSubmit={handleLookup} className="mt-6 space-y-5">
        <div>
          <label htmlFor="consult-protocol" className="block text-sm font-semibold text-zinc-800 mb-1.5">
            Número do Protocolo
          </label>
          <input
            id="consult-protocol"
            type="text"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value.toUpperCase())}
            placeholder="Ex.: RP-2026-482910"
            className="w-full h-12 px-4 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
          />
        </div>

        <div>
          <label htmlFor="consult-cpf" className="block text-sm font-semibold text-zinc-800 mb-1.5">
            CPF do Contratante
          </label>
          <input
            id="consult-cpf"
            type="text"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full h-12 px-4 rounded-xl border border-zinc-300 bg-white font-mono-data text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
          />
        </div>

        <div className="pt-2 border-t border-zinc-200">
          <label htmlFor="consult-link" className="block text-sm font-semibold text-zinc-800 mb-1.5">
            Ou cole o link recebido pelo WhatsApp (opcional)
          </label>
          <input
            id="consult-link"
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://.../?contrato=RP-..."
            className="w-full h-12 px-4 rounded-xl border border-zinc-300 bg-white font-mono-data text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#A51C20]/25 focus:border-[#A51C20]"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-[#A51C20] hover:bg-[#8B1519] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Consultando contrato...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Verificar Contrato
            </>
          )}
        </button>
      </form>
    </section>
  );
};
