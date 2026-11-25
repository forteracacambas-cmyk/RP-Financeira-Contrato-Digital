import React from 'react';
import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import {
  COMPANY_INFO,
  formatBirthDateDisplay,
  formatCurrency,
} from '../lib/loanTable';
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

function addMonthsToDateStr(baseYmd: string, monthsToAdd: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseYmd);
  if (!m) return 'A definir';
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const date = new Date(year, month + monthsToAdd, day);
  return date.toLocaleDateString('pt-BR');
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

  const invoiceMethod = data.invoiceDeliveryMethod || 'WhatsApp';
  const iofEstimated = Math.round(data.loanAmount * (COMPANY_INFO.iofPercent / 100) * 100) / 100;
  const totalInterest = Math.max(0, Math.round((data.totalPayable - data.loanAmount) * 100) / 100);

  const scheduleRows = [
    { label: '1ª Parcela (Início em 30 dias)', due: addMonthsToDateStr(data.firstDueDate, 0) },
    { label: '2ª Parcela', due: addMonthsToDateStr(data.firstDueDate, 1) },
    { label: '3ª Parcela', due: addMonthsToDateStr(data.firstDueDate, 2) },
    { label: '4ª Parcela', due: addMonthsToDateStr(data.firstDueDate, 3) },
    { label: `${Math.ceil(data.installments / 2)}ª Parcela (Meio do plano)`, due: addMonthsToDateStr(data.firstDueDate, Math.ceil(data.installments / 2) - 1) },
    { label: `${data.installments}ª Parcela (Quitação final)`, due: addMonthsToDateStr(data.firstDueDate, data.installments - 1) },
  ];

  return (
    <article className="print-only-clean space-y-6">
      {/* =================================================================== */}
      {/* PÁGINA 1: QUALIFICAÇÃO, CONDIÇÕES FINANCEIRAS, RECEBIMENTO E CRONOGRAMA */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-zinc-200 bg-zinc-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <BrandLogo size="md" />
            <p className="text-xs font-mono-data text-zinc-600 mt-2">
              {COMPANY_INFO.legalName} · CNPJ: {COMPANY_INFO.cnpj}
            </p>
          </div>
          <div className="md:text-right">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-data font-bold uppercase tracking-wider text-zinc-500">
              <FileText className="w-3.5 h-3.5 text-[#A51C20]" />
              Página 1 de 4 · Instrumento Particular de Crédito Pessoal
            </span>
            <p className="font-mono-data text-sm font-bold text-zinc-900 mt-1">
              {signed ? `Protocolo: ${signed.protocol}` : 'Cédula / Minuta Contratual Digital'}
            </p>
            {signed && (
              <p className="text-xs text-emerald-700 font-semibold mt-1 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Assinado e Autenticado Eletronicamente
              </p>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5 text-xs sm:text-sm font-serif-legal text-zinc-700 leading-relaxed">
            <p className="font-bold text-zinc-900 uppercase tracking-wide text-xs font-sans mb-1.5">
              Preâmbulo Contratual e Identificação das Partes
            </p>
            <p>
              Pelo presente <strong>INSTRUMENTO PARTICULAR DE CONTRATO DE EMPRÉSTIMO PESSOAL COM PACTO ADJETO DE PAGAMENTO PARCELADO</strong>, de um lado{' '}
              <strong>{COMPANY_INFO.legalName}</strong>, pessoa jurídica de direito privado inscrita no CNPJ sob o nº{' '}
              <span className="font-mono-data text-xs">{COMPANY_INFO.cnpj}</span>, doravante denominada simplesmente{' '}
              <strong>CONTRATADA / CREDORA</strong>, e de outro lado o(a) cidadão(ã) devidamente qualificado(a) no Quadro I abaixo, doravante denominado(a) simplesmente{' '}
              <strong>CONTRATANTE / MUTUÁRIO(A)</strong>, têm entre si justo e contratado o presente instrumento jurídico, que se regerá pela legislação civil vigente, pelo Código de Defesa do Consumidor (Lei nº 8.078/1990), pelas resoluções aplicáveis do Conselho Monetário Nacional e do Banco Central do Brasil, e pelas 18 (dezoito) cláusulas e condições gerais integralmente descritas nas páginas seguintes.
            </p>
          </div>

          {/* Quadros I, II e III */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                    {formatBirthDateDisplay(data.birthDate)}
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
                  <dt className="text-zinc-500 text-xs">Endereço Residencial:</dt>
                  <dd className="text-zinc-800 text-xs mt-0.5 leading-relaxed">
                    {fullAddress || '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Quadro II - Condições Financeiras */}
            <div className="rounded-xl border border-zinc-200 p-4 sm:p-5 bg-white">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 pb-2.5 border-b border-zinc-100">
                Quadro II — Condições Financeiras e CET
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
                    {data.installments}x mensais fixas
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Valor da Parcela:</dt>
                  <dd className="font-mono-data font-bold text-[#A51C20] text-right">
                    {formatCurrency(data.installmentValue)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Juros Nominais:</dt>
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
                  <dt className="text-zinc-500">IOF de Referência:</dt>
                  <dd className="font-mono-data text-zinc-800 text-right">
                    {COMPANY_INFO.iofPercent.toFixed(2).replace('.', ',')}% ({formatCurrency(iofEstimated)})
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Encargos do Plano:</dt>
                  <dd className="font-mono-data text-zinc-800 text-right">
                    {formatCurrency(totalInterest)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">1º Vencimento (30d):</dt>
                  <dd className="font-mono-data text-zinc-800 text-right">{formattedDueDate}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Envio das Faturas:</dt>
                  <dd className="font-semibold text-zinc-800 text-right">{invoiceMethod}</dd>
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
                Quadro III — Conta de Crédito
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
                <div className="pt-2 border-t border-zinc-100 text-xs text-zinc-500 leading-relaxed">
                  Liberação exclusiva em conta corrente, poupança ou pagamento de mesma titularidade do CPF informado no Quadro I.
                </div>
              </dl>
            </div>
          </div>

          {/* Quadro IV - Demonstrativo de Cronograma */}
          <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                Quadro IV — Cronograma Demonstrativo de Vencimentos (Tabela Price)
              </h4>
              <span className="font-mono-data text-[11px] text-zinc-500">
                Carência inicial automática de 30 dias após a assinatura
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-white text-zinc-500">
                    <th className="py-2.5 px-4 font-semibold">Parcela</th>
                    <th className="py-2.5 px-4 font-semibold">Vencimento Previsto</th>
                    <th className="py-2.5 px-4 font-semibold">Canal de Fatura</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Valor Fixo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {scheduleRows.map((row) => (
                    <tr key={row.label} className="bg-white">
                      <td className="py-2.5 px-4 font-medium text-zinc-800">{row.label}</td>
                      <td className="py-2.5 px-4 font-mono-data text-zinc-700">{row.due}</td>
                      <td className="py-2.5 px-4 text-zinc-600">{invoiceMethod}</td>
                      <td className="py-2.5 px-4 font-mono-data font-bold text-zinc-900 text-right">
                        {formatCurrency(data.installmentValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* PÁGINA 2: CLÁUSULAS CONTRATUAIS GERAIS (CLÁUSULAS 1ª A 10ª)         */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between gap-4">
          <h3 className="text-sm sm:text-base font-bold text-zinc-900">
            Cláusulas Contratuais Gerais — Das Condições do Crédito (Cláusulas 1ª a 10ª)
          </h3>
          <span className="font-mono-data text-[11px] font-semibold text-zinc-500 shrink-0">
            Página 2 de 4
          </span>
        </div>

        <div className="p-6 sm:p-8 font-serif-legal text-sm text-zinc-700 leading-relaxed space-y-4 columns-1 md:columns-2 md:gap-8">
          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 1ª — DO OBJETO E FINALIDADE DO CONTRATO:</strong> Pelo presente instrumento particular, a{' '}
            <strong>{COMPANY_INFO.legalName}</strong> (CNPJ <span className="font-mono-data text-xs">{COMPANY_INFO.cnpj}</span>), doravante denominada <strong>CONTRATADA</strong>, concede ao <strong>CONTRATANTE</strong> devidamente identificado no Quadro I empréstimo pessoal na modalidade de crédito direto ao consumidor sem vinculação específica de uso, no valor principal líquido de{' '}
            <strong>{formatCurrency(data.loanAmount)}</strong>, sob as condições financeiras irrevogavelmente pactuadas no Quadro II.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 2ª — DA LIBERAÇÃO E DISPONIBILIZAÇÃO DO CRÉDITO:</strong> Após a conferência cadastral, validação documental, verificação de autenticidade do CPF e aposição da assinatura eletrônica manuscrita do CONTRATANTE, a CONTRATADA efetuará a transferência do valor principal contratado por meio de Ordem de Pagamento Instantâneo (PIX) ou Transferência Eletrônica Disponível (TED) exclusivamente para a conta bancária indicada no Quadro III, sendo condição essencial e indispensável que referida conta seja de exclusiva titularidade do CONTRATANTE.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 3ª — DO PARCELAMENTO, CARÊNCIA INICIAL E FORMA DE PAGAMENTO:</strong> Em contrapartida ao crédito concedido, o CONTRATANTE obriga-se a restituir à CONTRATADA o montante total de{' '}
            <strong>{formatCurrency(data.totalPayable)}</strong>, dividido em{' '}
            <strong>{data.installments} ({data.installments}) parcelas mensais, fixas e sucessivas no valor unitário de {formatCurrency(data.installmentValue)}</strong> cada. O vencimento da primeira parcela ocorrerá automaticamente após o prazo de 30 (trinta) dias corridos contados da data da assinatura deste instrumento (previsto para{' '}
            <strong>{formattedDueDate}</strong>), vencendo-se as demais no mesmo dia dos meses subsequentes. Os boletos ou códigos PIX Cobrança serão encaminhados mensalmente pelo canal eleito pelo CONTRATANTE (<strong>{invoiceMethod}</strong>).
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 4ª — DA TAXA DE JUROS E DO CUSTO EFETIVO TOTAL (CET):</strong> Sobre o saldo devedor apurado pelo Sistema Francês de Amortização (Tabela Price) incidem juros remuneratórios prefixados de{' '}
            <strong>{COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% ao mês</strong> (equivalentes a {COMPANY_INFO.annualRatePercent.toFixed(2).replace('.', ',')}% ao ano), acrescidos dos encargos legais aplicáveis (IOF nos termos da legislação tributária federal), resultando no Custo Efetivo Total (CET) informado no Quadro II, em estrita observância às Resoluções do Conselho Monetário Nacional e do Banco Central do Brasil.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 5ª — DA VEDAÇÃO EXPRESSA A DEPÓSITOS PRÉVIOS:</strong> A CONTRATADA declara expressamente que não exige, não autoriza e não solicita qualquer pagamento antecipado, caução, taxa de cadastro, depósito de liberação, seguro prestamista obrigatório prévio ou transferência de terceiros como condição para análise ou liberação do valor contratado, devendo eventuais encargos integrar exclusivamente as parcelas pactuadas neste contrato.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 6ª — DO ATRASO, MORA E INADIMPLEMENTO:</strong> O não pagamento pontual de qualquer parcela até a respectiva data de vencimento constituirá o CONTRATANTE em mora de pleno direito, independentemente de interpelação judicial ou extrajudicial, sujeitando o valor em atraso a: (a) multa moratória irretratável de 2% (dois por cento), conforme art. 52, §1º do Código de Defesa do Consumidor; (b) juros moratórios de 1% (um por cento) ao mês calculados pro rata die; e (c) atualização monetária pelo índice oficial IPCA/IBGE. Persistindo o atraso, a CONTRATADA poderá comunicar os órgãos de proteção ao crédito mediante notificação prévia ao CONTRATANTE.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 7ª — DO VENCIMENTO ANTECIPADO DA DÍVIDA:</strong> Poderá a CONTRATADA considerar antecipadamente vencida a integralidade do saldo devedor, tornando-o imediatamente exigível de uma só vez, nas hipóteses de: (a) comprovação de falsidade, omissão relevante ou adulteração nos documentos e dados declarados no Quadro I; (b) inadimplemento de 02 (duas) ou mais parcelas consecutivas ou alternadas após prévia notificação de regularização; ou (c) instauração de insolvência civil que comprometa substancialmente a capacidade de cumprimento contratual.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 8ª — DA AMORTIZAÇÃO E LIQUIDAÇÃO ANTECIPADA:</strong> Nos estritos termos do art. 52, §2º da Lei nº 8.078/1990 (Código de Defesa do Consumidor) e das normas do Banco Central do Brasil, fica expressamente assegurado ao CONTRATANTE o direito irrenunciável à liquidação antecipada, total ou parcial, do saldo devedor a qualquer tempo, mediante solicitação pelos canais oficiais da CONTRATADA, com redução proporcional obrigatória dos juros remuneratórios futuros.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 9ª — DO DIREITO DE ARREPENDIMENTO (CONTRATAÇÃO DIGITAL):</strong> Tratando-se de contratação celebrada em ambiente eletrônico à distância, assiste ao CONTRATANTE o direito de desistência no prazo legal de 07 (sete) dias corridos a contar da assinatura ou do efetivo recebimento do crédito, nos termos do art. 49 do Código de Defesa do Consumidor, hipótese em que deverá restituir integralmente o valor principal líquido eventualmente já creditado em sua conta, sem cobrança de multa contratual.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 10ª — DA VERACIDADE CADASTRAL E PREVENÇÃO A ILÍCITOS (PLD/FT):</strong> O CONTRATANTE declara, sob as responsabilidades civil e penal previstas nos arts. 299 e 171 do Código Penal Brasileiro, que os dados pessoais, endereço residencial, telefones de contato, e-mail e conta bancária informados são exatos, lícitos e autênticos, comprometendo-se a utilizar os recursos exclusivamente para finalidades lícitas, em conformidade com a Lei nº 9.613/1998 (Prevenção à Lavagem de Dinheiro e ao Financiamento do Terrorismo).
          </p>
        </div>
      </section>

      {/* =================================================================== */}
      {/* PÁGINA 3: TERMOS REGULATÓRIOS, LGPD E DISPOSIÇÕES FINAIS (11ª A 18ª) */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between gap-4">
          <h3 className="text-sm sm:text-base font-bold text-zinc-900">
            Termos Regulatórios, LGPD, Assinatura Digital e Disposições Finais (Cláusulas 11ª a 18ª)
          </h3>
          <span className="font-mono-data text-[11px] font-semibold text-zinc-500 shrink-0">
            Página 3 de 4
          </span>
        </div>

        <div className="p-6 sm:p-8 font-serif-legal text-sm text-zinc-700 leading-relaxed space-y-4 columns-1 md:columns-2 md:gap-8">
          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 11ª — DA PROTEÇÃO DE DADOS PESSOAIS (LGPD):</strong> Os dados pessoais, cadastrais, financeiros e biométricos (assinatura manuscrita digitalizada) coletados neste instrumento são tratados pela CONTRATADA em conformidade integral com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), exclusivamente para fins de análise de risco de crédito, prevenção à fraude, execução contratual, cobrança regular e cumprimento de obrigações legais e regulatórias. É garantido ao CONTRATANTE o direito de acesso, confirmação de tratamento, retificação de dados incorretos e esclarecimento através do canal de atendimento da CONTRATADA.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 12ª — DA AUTORIZAÇÃO DE CONSULTA AO SCR E BIRÔS DE CRÉDITO:</strong> O CONTRATANTE autoriza expressamente a CONTRATADA a consultar informações de suas operações de crédito junto ao Sistema de Informações de Crédito do Banco Central do Brasil (SCR) e aos cadastros de proteção ao crédito e Cadastro Positivo (Lei nº 12.414/2011), bem como a registrar o histórico de adimplemento e pontualidade desta operação conforme regulamentação vigente.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 13ª — DA ASSINATURA ELETRÔNICA E VALIDADE PROBATÓRIA:</strong> As partes reconhecem expressamente a plena validade jurídica, autenticidade, integridade e força probante deste contrato celebrado em formato digital, com assinatura manuscrita capturada em tela, registro inequívoco de data e hora, identificação de dispositivo, código de protocolo exclusivo, código de verificação via QR Code e resumo criptográfico SHA-256, nos termos do art. 10, §2º da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 14ª — DA CESSÃO E TRANSFERÊNCIA DE DIREITOS CREDITÓRIOS:</strong> Fica facultado à CONTRATADA ceder, caucionar ou transferir a terceiros, total ou parcialmente, os direitos creditórios decorrentes deste contrato, nos termos dos arts. 286 a 298 do Código Civil Brasileiro e das normas do Conselho Monetário Nacional, preservando-se integralmente ao CONTRATANTE todas as garantias, taxas de juros, prazos de vencimento e condições originalmente pactuadas.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 15ª — DAS COMUNICAÇÕES E ENTREGA ELETRÔNICA DE FATURAS:</strong> O CONTRATANTE declara estar ciente de que todas as comunicações, avisos de vencimento, extratos demonstrativos e faturas das parcelas mensais serão enviados eletronicamente para o WhatsApp (<strong>{data.phone || 'informado no Quadro I'}</strong>) e/ou e-mail (<strong>{data.email || 'informado no Quadro I'}</strong>), conforme sua opção expressa de recebimento (<strong>{invoiceMethod}</strong>), assumindo o compromisso de manter seus dados de contato devidamente atualizados.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 16ª — DA TOLERÂNCIA E AUTONOMIA DAS DISPOSIÇÕES:</strong> A eventual tolerância ou abstenção por qualquer das partes quanto ao exercício de direito ou faculdade prevista neste instrumento não implicará novação, renúncia ou alteração tácita das obrigações assumidas. Na hipótese de qualquer cláusula ou disposição ser considerada inválida por decisão judicial definitiva, as demais permanecerão em pleno vigor e efeito.
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 17ª — DA IRREVOGABILIDADE E FORÇA EXECUTIVA:</strong> O presente instrumento é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores a qualquer título, constituindo título executivo extrajudicial líquido, certo e exigível na forma do art. 784, inciso III e §4º do Código de Processo Civil (Lei nº 13.105/2015, com redação dada pela Lei nº 14.620/2023).
          </p>

          <p className="break-inside-avoid">
            <strong className="text-zinc-900">CLÁUSULA 18ª — DO FORO DE ELEIÇÃO E SOLUÇÃO DE CONTROVÉRSIAS:</strong> Fica eleito o foro da comarca do domicílio do CONTRATANTE, conforme assegurado pelo Código de Defesa do Consumidor, como competente para dirimir quaisquer controvérsias ou litígios oriundos da interpretação ou execução deste contrato, privilegiando-se sempre a composição prévia e amigável entre as partes.
          </p>
        </div>
      </section>

      {/* =================================================================== */}
      {/* PÁGINA 4: TERMO DE ADESÃO, SELOS DE AUTENTICAÇÃO E ASSINATURAS       */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between gap-4">
          <h3 className="text-sm sm:text-base font-bold text-zinc-900">
            Termo de Ciência Integral, Certificação Digital e Assinaturas das Partes
          </h3>
          <span className="font-mono-data text-[11px] font-semibold text-zinc-500 shrink-0">
            Página 4 de 4
          </span>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 space-y-2.5 text-xs sm:text-sm font-serif-legal text-zinc-700 leading-relaxed">
            <p className="font-sans text-xs font-bold uppercase tracking-wider text-zinc-900">
              Declaração de Ciência e Aceite Integral
            </p>
            <p>
              Ao assinar eletronicamente este instrumento, o(a) CONTRATANTE <strong>{data.fullName || 'acima qualificado(a)'}</strong> declara para todos os fins de direito que:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Recebeu, leu integralmente todas as 4 (quatro) páginas e as 18 (dezoito) cláusulas deste contrato e concordou expressamente com seus termos;
              </li>
              <li>
                Conferiu o valor solicitado de <strong>{formatCurrency(data.loanAmount)}</strong>, o plano de <strong>{data.installments} parcelas fixas de {formatCurrency(data.installmentValue)}</strong>, a taxa de juros de <strong>{COMPANY_INFO.monthlyRatePercent.toFixed(2).replace('.', ',')}% a.m.</strong> e o primeiro vencimento automático em <strong>{formattedDueDate}</strong> (30 dias após a assinatura);
              </li>
              <li>
                Confirmou o envio mensal das faturas via <strong>{invoiceMethod}</strong> e a exatidão da conta bancária e chave PIX informadas no Quadro III;
              </li>
              <li>
                Está ciente de que a {COMPANY_INFO.legalName} não solicita nenhum pagamento ou depósito antecipado para liberação do crédito.
              </li>
            </ul>
          </div>

          {/* Selos Completos de Autenticação */}
          <AuthenticationSeals
            certificateCode={signed?.certificateCode}
            integrityHash={signed?.integrityHash}
            signedAt={signed?.signedAt}
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
                      Sua assinatura manuscrita aparecerá aqui após riscar na tela abaixo
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-200 text-xs">
                <p className="font-bold text-zinc-900">{data.fullName || 'Contratante'}</p>
                <p className="font-mono-data text-zinc-600">CPF: {data.cpf || '000.000.000-00'}</p>
                <p className="text-zinc-500 mt-1">
                  {isSignedRecord && signed ? `Assinado em ${signedTimestamp}` : `Data de emissão: ${signedTimestamp}`}
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
                <p className="text-zinc-500 mt-1">Emissão Eletrônica Verificada · Lei nº 14.063/2020</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
};
