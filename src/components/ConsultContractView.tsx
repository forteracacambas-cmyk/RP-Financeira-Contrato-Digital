import React, { useState } from 'react';
import { Search, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { formatCPF, isValidCPF } from '../lib/loanTable';
import type { ContractVerificationAudit, SignedLoanContract } from '../types/contract';
import { decodePortableContract, lookupContractLocally } from '../lib/portableContract';
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
    portableToken?: string;
  } | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // If user pasted a direct verification link
    if (linkInput.trim()) {
      try {
        const parsedUrl = new URL(linkInput.trim(), window.location.origin);
        const pParam = parsedUrl.searchParams.get('p');
        const protoParam = parsedUrl.searchParams.get('contrato');
        const keyParam = parsedUrl.searchParams.get('chave');

        if (pParam) {
          const decoded = await decodePortableContract(pParam);
          if (decoded) {
            setResult({ ...decoded, portableToken: pParam });
            return;
          }
        }
        if (protoParam && keyParam) {
          setLoading(true);
          try {
            const res = await fetch(
              `/api/contracts/lookup?protocol=${encodeURIComponent(protoParam)}&token=${encodeURIComponent(keyParam)}`
            );
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
              const json = await res.json();
              setResult({ contract: json.contract, audit: json.audit });
              return;
            }
          } catch {
            // Fall through to local lookup
          } finally {
            setLoading(false);
          }
          const localMatch = lookupContractLocally(protoParam, { token: keyParam });
          if (localMatch) {
            setResult(localMatch);
            return;
          }
        }
        setError('Link de verificação inválido ou contrato não encontrado.');
        return;
      } catch {
        setError('Formato de link inválido. Cole o link completo recebido pelo WhatsApp.');
        return;
      }
    }

    const cleanProtocol = protocol.trim().toUpperCase();
    if (!cleanProtocol) {
      setError('Informe o número do protocolo do contrato (ex.: RP-2026-123456).');
      return;
    }
    if (!isValidCPF(cpf)) {
      setError('Informe um CPF válido para conferir a titularidade do contrato.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        protocol: cleanProtocol,
        cpf,
      });
      const res = await fetch(`/api/contracts/lookup?${params.toString()}`);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (res.ok) {
          setResult({ contract: json.contract, audit: json.audit });
          return;
        }
        if (res.status === 403 || res.status === 400) {
          setError(json.error || 'Dados não conferem com o contrato.');
          setResult(null);
          return;
        }
      }

      // Static hosting fallback (Cloudflare Pages)
      const localFound = lookupContractLocally(cleanProtocol, { cpf });
      if (localFound) {
        setResult(localFound);
      } else {
        setError('Contrato não encontrado neste dispositivo. Para consultar contratos assinados em outro aparelho na hospedagem estática, utilize o link completo ou QR Code enviado pelo WhatsApp.');
        setResult(null);
      }
    } catch {
      const localFound = lookupContractLocally(cleanProtocol, { cpf });
      if (localFound) {
        setResult(localFound);
      } else {
        setError('Não foi possível localizar este contrato. Verifique o protocolo e CPF ou use o link do WhatsApp.');
      }
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
          portableToken={result.portableToken}
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
