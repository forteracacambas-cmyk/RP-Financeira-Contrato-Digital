import React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { COMPANY_INFO, formatCurrency } from '../lib/loanTable';
import type { LoanContractInput, SignedLoanContract } from '../types/contract';
import { BrandLogo } from './BrandLogo';
import { AuthenticationSeals } from './AuthenticationSeals';

interface ContractDocumentProps {
  data: LoanContractInput | SignedLoanContract;
  isSignedRecord?: boolean;
}

function isSignedContract(
  data: LoanContractInput | SignedLoanContract
): data is SignedLoanContract {
  return 'protocol' in data && Boolean(data.protocol);
}

export const ContractDocument: React.FC<ContractDocumentProps> = ({
  data,
  isSignedRecord = false,
}) => {
  const signed = isSignedContract(data) ? data : null;
  const formattedDueDate = data.firstDueDate
    ? new Date(`${data.firstDueDate}T12:00:00`).toLocaleDateString('pt-BR')
    : 'A definir';

  const signedTimestamp = signed
    ? new Date(signed.signedAt).toLocaleString('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'medium',
      })
    : new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' });

  const fullAddress = [
    data.street && `${data.street}, nº ${data.number || 'S/N'}`,
    data.complement,
    data.neighborhood,
    data.city && data.state ? `${data.city}/${data.state}` : '',
    data.cep ? `CEP ${data.cep}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <article className="print-only-clean rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      {/* Contract Header */}
      <div className="p-6 sm:p-8 border-b border-zinc-200 bg-zinc-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <BrandLogo size="md" />
          <p className="text-xs font-mono-data text-zinc-600 mt-2">
            {COMPANY_INFO.legalName} · CNPJ: {COMPANY_INFO.cnpj}
          </p>
        </div>
        <div className="md:text-right">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Instrumento Particular de Crédito Pessoal
          </p>
          <p className="font-mono-data text-sm font-bold text-zinc-900 mt-1">
            {signed ? `Protocolo: ${signed.protocol}` : 'Minuta Contratual Digital'}
          </p>
          {signed && (
            <p className="text-xs text-emerald-700 font-semibold mt-1 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Assinado e Autenticado Eletronicamente
            </p>
          )}
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* Quadro Resumo */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quadro I - Contratante */}
          <div className="rounded-xl border border-zinc-200 p-4 sm:p-5 bg-white">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 pb-2.5 border-b border-zinc-100">
              Quadro I — Dados do Contratante
            </h4>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Nome:</dt>
                <dd className="font-semibold text-zinc-900 text-right">{data.fullName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">CPF:</dt>
                <dd className="font-mono-data font-semibold text-zinc-900 text-right">
                  {data.cpf || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">RG / CNH:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">{data.rgOrCnh || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Nascimento:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">
                  {data.birthDate ? new Date(`${data.birthDate}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Telefone:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">{data.phone || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">E-mail:</dt>
                <dd className="text-zinc-800 text-right break-all">{data.email || '—'}</dd>
              </div>
              <div className="pt-2 border-t border-zinc-100">
                <dt className="text-zinc-500 text-xs">Endereço:</dt>
                <dd className="text-zinc-800 text-xs mt-0.5 leading-relaxed">
                  {fullAddress || '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Quadro II - Condições Financeiras */}
          <div className="rounded-xl border border-zinc-200 p-4 sm:p-5 bg-white">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 pb-2.5 border-b border-zinc-100">
              Quadro II — Condições do Empréstimo
            </h4>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Valor Principal:</dt>
                <dd className="font-mono-data font-bold text-zinc-900 text-right">
                  {formatCurrency(data.loanAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Parcelamento:</dt>
                <dd className="font-mono-data font-semibold text-zinc-900 text-right">
                  {data.installments}x mensais
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Valor da Parcela:</dt>
                <dd className="font-mono-data font-bold text-[#A51C20] text-right">
                  {formatCurrency(data.installmentValue)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Taxa de Juros:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">
                  {COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m. ({COMPANY_INFO.annualRatePercent.toFixed(2).replace('.', ',')}% a.a.)
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">CET Estimado:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">
                  {COMPANY_INFO.cetAnnualPercent.toFixed(2).replace('.', ',')}% a.a.
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">1º Vencimento:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">{formattedDueDate}</dd>
              </div>
              <div className="pt-2 border-t border-zinc-100 flex justify-between gap-3">
                <dt className="text-zinc-600 font-semibold">Total Contratado:</dt>
                <dd className="font-mono-data font-bold text-zinc-900 text-right">
                  {formatCurrency(data.totalPayable)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Quadro III - Conta de Recebimento */}
          <div className="rounded-xl border border-zinc-200 p-4 sm:p-5 bg-white">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 pb-2.5 border-b border-zinc-100">
              Quadro III — Dados para Recebimento
            </h4>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Instituição:</dt>
                <dd className="font-semibold text-zinc-900 text-right">{data.bankName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Tipo de Conta:</dt>
                <dd className="text-zinc-800 text-right">{data.accountType || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Agência:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">{data.agency || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Conta:</dt>
                <dd className="font-mono-data text-zinc-800 text-right">
                  {data.accountNumber || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Tipo Chave PIX:</dt>
                <dd className="text-zinc-800 text-right">{data.pixKeyType || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Chave PIX:</dt>
                <dd className="font-mono-data font-semibold text-zinc-900 text-right break-all">
                  {data.pixKey || '—'}
                </dd>
              </div>
              <div className="pt-2 border-t border-zinc-100 text-xs text-zinc-500">
                Liberação exclusiva para conta de mesma titularidade do CPF contratante.
              </div>
            </dl>
          </div>
        </div>

        {/* Cláusulas Contratuais */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-5 sm:p-7">
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-4">
            Cláusulas e Condições Gerais do Empréstimo Pessoal
          </h3>
          <div className="font-serif-legal text-sm text-zinc-700 leading-relaxed space-y-4 columns-1 md:columns-2 md:gap-8">
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 1ª — DO OBJETO:</strong> Pelo presente instrumento particular, a{' '}
              <strong>{COMPANY_INFO.legalName}</strong>, inscrita no CNPJ sob o nº{' '}
              <span className="font-mono-data text-xs">{COMPANY_INFO.cnpj}</span>, doravante denominada{' '}
              <strong>CONTRATADA</strong>, concede ao <strong>CONTRATANTE</strong> acima qualificado crédito pessoal no valor principal líquido de{' '}
              <strong>{formatCurrency(data.loanAmount)}</strong>, sob as condições previstas no Quadro II.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 2ª — DA LIBERAÇÃO DO CRÉDITO:</strong> Após validação cadastral, conferência documental e assinatura eletrônica deste instrumento, o valor contratado será creditado via transferência bancária (TED) ou PIX diretamente na conta indicada no Quadro III, obrigatoriamente de titularidade do CONTRATANTE.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 3ª — DO PARCELAMENTO E PAGAMENTO:</strong> O CONTRATANTE obriga-se a restituir o montante total de{' '}
              <strong>{formatCurrency(data.totalPayable)}</strong> em{' '}
              <strong>{data.installments} parcelas mensais e sucessivas de {formatCurrency(data.installmentValue)}</strong>, com primeiro vencimento previsto para{' '}
              <strong>{formattedDueDate}</strong>, apuradas pela Tabela Price conforme tabela vigente da RP FINANCEIRA.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 4ª — DOS JUROS E ENCARGOS:</strong> Incidem sobre o saldo devedor juros remuneratórios prefixados de{' '}
              <strong>{COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês</strong> ({COMPANY_INFO.annualRatePercent.toFixed(2).replace('.', ',')}% ao ano), além do Custo Efetivo Total (CET) informado no Quadro II, sem cobrança de tarifas ocultas ou depósitos prévios não previstos em lei.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 5ª — DO ATRASO E INADIMPLEMENTO:</strong> O não pagamento de qualquer parcela na data de vencimento sujeitará o CONTRATANTE à multa moratória de 2% (dois por cento) sobre o valor da parcela em atraso, juros de mora de 1% (um por cento) ao mês pro rata die e correção monetária pelo IPCA, podendo implicar comunicação aos órgãos de proteção ao crédito após prévia notificação.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 6ª — DA LIQUIDAÇÃO ANTECIPADA:</strong> Nos termos do art. 52, §2º do Código de Defesa do Consumidor e das normas do Banco Central do Brasil, é assegurado ao CONTRATANTE o direito à quitação antecipada parcial ou total do débito, com redução proporcional dos juros futuros.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 7ª — DA VERACIDADE CADASTRAL:</strong> O CONTRATANTE declara, sob as penas da lei civil e penal, que todos os dados pessoais, de endereço, renda e conta bancária fornecidos neste instrumento são exatos, completos e verdadeiros.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 8ª — DA PROTEÇÃO DE DADOS (LGPD):</strong> Os dados pessoais coletados destinam-se exclusivamente à análise de crédito, formalização contratual, prevenção à fraude e cumprimento de obrigações regulatórias, em estrita observância à Lei nº 13.709/2018 (LGPD).
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 9ª — DA ASSINATURA ELETRÔNICA:</strong> As partes reconhecem expressamente a autenticidade, integridade e plena eficácia jurídica deste contrato celebrado em meio eletrônico com assinatura manuscrita digitalizada, registro de data/hora, hash criptográfico SHA-256 e código de verificação por QR Code, nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.
            </p>
            <p className="break-inside-avoid">
              <strong className="text-zinc-900">CLÁUSULA 10ª — DO FORO:</strong> Fica eleito o foro do domicílio do CONTRATANTE, conforme previsto no Código de Defesa do Consumidor, para dirimir quaisquer dúvidas oriundas do presente instrumento.
            </p>
          </div>
        </div>

        {/* Selos de Autenticação */}
        <AuthenticationSeals
          certificateCode={signed?.certificateCode}
          integrityHash={signed?.integrityHash}
          signedAt={signed?.signedAt}
          compact
        />

        {/* Área das Assinaturas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-200">
          {/* Assinatura do Contratante */}
          <div className="rounded-xl border border-zinc-200 p-5 bg-white flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Assinatura Digital do Contratante
              </p>
              <div className="mt-3 h-32 rounded-lg border border-zinc-200 bg-zinc-50/50 flex items-center justify-center p-3">
                {data.signatureDataUrl ? (
                  <img
                    src={data.signatureDataUrl}
                    alt={`Assinatura digital de ${data.fullName || 'Contratante'}`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-zinc-400">
                    Assinatura manuscrita aparecerá aqui após riscar na tela
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-200 text-xs">
              <p className="font-bold text-zinc-900">{data.fullName || 'Contratante'}</p>
              <p className="font-mono-data text-zinc-600">CPF: {data.cpf || '000.000.000-00'}</p>
              <p className="text-zinc-500 mt-1">
                {isSignedRecord && signed ? `Assinado em ${signedTimestamp}` : `Data: ${signedTimestamp}`}
              </p>
            </div>
          </div>

          {/* Assinatura Institucional Contratada */}
          <div className="rounded-xl border border-zinc-200 p-5 bg-white flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Chancela Eletrônica da Contratada
              </p>
              <div className="mt-3 h-32 rounded-lg border border-zinc-200 bg-zinc-50/50 flex flex-col items-center justify-center p-4 text-center">
                <div className="inline-flex items-center gap-2 text-[#A51C20] font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>CHANCELA DIGITAL AUTENTICADA</span>
                </div>
                <p className="font-serif-legal italic text-lg text-zinc-800 mt-1">
                  RP Financeira Crédito Pessoal
                </p>
                <p className="font-mono-data text-[11px] text-zinc-500 mt-1">
                  {signed ? signed.certificateCode : 'Validação Automática no Ato da Assinatura'}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-200 text-xs">
              <p className="font-bold text-zinc-900">{COMPANY_INFO.legalName}</p>
              <p className="font-mono-data text-zinc-600">CNPJ: {COMPANY_INFO.cnpj}</p>
              <p className="text-zinc-500 mt-1">Emissão Eletrônica Verificada</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
