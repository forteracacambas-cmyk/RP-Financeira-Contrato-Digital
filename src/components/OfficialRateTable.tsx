import React, { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import {
  COMPANY_INFO,
  formatCurrency,
  INSTALLMENT_OPTIONS,
  OFFICIAL_RATE_TABLE,
  type InstallmentCount,
} from '../lib/loanTable';
import { BrandLogo } from './BrandLogo';

interface OfficialRateTableProps {
  selectedAmount: number;
  selectedInstallments: number;
  onSelectPlan: (amount: number, installments: InstallmentCount) => void;
}

export const OfficialRateTable: React.FC<OfficialRateTableProps> = ({
  selectedAmount,
  selectedInstallments,
  onSelectPlan,
}) => {
  const [showOriginalFlyer, setShowOriginalFlyer] = useState(false);

  return (
    <section id="tabela" className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <BrandLogo size="sm" />
            <span className="text-xs font-mono-data text-zinc-500">
              CNPJ: {COMPANY_INFO.cnpj}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mt-2 tracking-tight">
            Tabela Oficial de Parcelas — Crédito Pessoal
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Taxa de juros fixa de {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês. Clique em qualquer valor abaixo para preencher seu contrato automaticamente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowOriginalFlyer((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0"
        >
          <ImageIcon className="w-4 h-4 text-[#A51C20]" />
          {showOriginalFlyer ? 'Ocultar Tabela Original' : 'Ver Imagem da Tabela Oficial'}
        </button>
      </div>

      {showOriginalFlyer && (
        <div className="p-4 sm:p-6 bg-zinc-50 border-b border-zinc-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-700">
              Tabela Oficial de Referência — {COMPANY_INFO.name}
            </span>
            <button
              type="button"
              onClick={() => setShowOriginalFlyer(false)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
              aria-label="Fechar imagem"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <img
            src="/assets/aistudio/WhatsApp_Image_2026-11-24_at_3.47.00_PM_edbeff56.jpeg"
            alt="Tabela oficial de parcelas RP Financeira CNPJ 44.431.431/0001-91"
            referrerPolicy="no-referrer"
            className="w-full max-w-4xl mx-auto rounded-lg border border-zinc-200"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead>
            <tr className="bg-[#A51C20] text-white">
              <th className="py-3.5 px-4 text-xs font-bold tracking-wider uppercase sticky left-0 bg-[#8F1519] z-10">
                Valor
              </th>
              {INSTALLMENT_OPTIONS.map((count) => (
                <th
                  key={count}
                  className="py-3.5 px-3 text-xs font-bold tracking-wider uppercase text-center font-mono-data"
                >
                  {count}X
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {OFFICIAL_RATE_TABLE.map((row) => {
              const isRowSelected = row.amount === selectedAmount;
              return (
                <tr
                  key={row.amount}
                  className={isRowSelected ? 'bg-red-50/40' : 'hover:bg-zinc-50 transition-colors'}
                >
                  <td className="py-2.5 px-4 text-sm font-bold text-white bg-zinc-900 sticky left-0 z-10 font-mono-data whitespace-nowrap">
                    {row.label}
                  </td>
                  {INSTALLMENT_OPTIONS.map((count) => {
                    const cellValue = row.installments[count];
                    const isCellSelected =
                      selectedAmount === row.amount && selectedInstallments === count;
                    return (
                      <td key={count} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => onSelectPlan(row.amount, count)}
                          className={`w-full py-2 px-2 rounded-md text-xs sm:text-sm font-mono-data transition-all cursor-pointer ${
                            isCellSelected
                              ? 'bg-[#A51C20] text-white font-bold shadow-sm'
                              : 'text-zinc-800 hover:bg-red-50 hover:text-[#A51C20] font-medium'
                          }`}
                        >
                          {formatCurrency(cellValue)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
