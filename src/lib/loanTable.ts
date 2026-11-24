export const COMPANY_INFO = {
  name: 'RP FINANCEIRA',
  legalName: 'RP FINANCEIRA CRÉDITO PESSOAL LTDA.',
  cnpj: '44.431.431/0001-91',
  monthlyRatePercent: 1.35,
  exactMonthlyRate: 0.01348,
  annualRatePercent: 17.44,
  cetAnnualPercent: 18.92,
  iofPercent: 0.38,
};

export const INSTALLMENT_OPTIONS = [12, 24, 36, 48, 60, 72, 120] as const;
export type InstallmentCount = (typeof INSTALLMENT_OPTIONS)[number];

export interface RateTableRow {
  amount: number;
  label: string;
  installments: Record<InstallmentCount, number>;
}

// Valores oficiais conforme tabela RP FINANCEIRA (CNPJ: 44.431.431/0001-91)
export const OFFICIAL_RATE_TABLE: RateTableRow[] = [
  {
    amount: 5000,
    label: '5 MIL',
    installments: { 12: 454.13, 24: 245.29, 36: 176.28, 48: 142.21, 60: 122.12, 72: 109.01, 120: 84.38 },
  },
  {
    amount: 6000,
    label: '6 MIL',
    installments: { 12: 544.95, 24: 294.35, 36: 211.54, 48: 170.66, 60: 146.55, 72: 130.81, 120: 101.26 },
  },
  {
    amount: 7000,
    label: '7 MIL',
    installments: { 12: 635.78, 24: 343.41, 36: 246.79, 48: 199.10, 60: 170.97, 72: 152.61, 120: 118.13 },
  },
  {
    amount: 8000,
    label: '8 MIL',
    installments: { 12: 726.60, 24: 392.47, 36: 282.05, 48: 227.54, 60: 195.40, 72: 174.42, 120: 135.01 },
  },
  {
    amount: 9000,
    label: '9 MIL',
    installments: { 12: 817.43, 24: 441.53, 36: 317.30, 48: 255.99, 60: 219.82, 72: 196.22, 120: 151.89 },
  },
  {
    amount: 10000,
    label: '10 MIL',
    installments: { 12: 908.26, 24: 490.59, 36: 352.56, 48: 284.43, 60: 244.24, 72: 218.02, 120: 168.76 },
  },
  {
    amount: 15000,
    label: '15 MIL',
    installments: { 12: 1362.38, 24: 735.88, 36: 528.84, 48: 426.64, 60: 366.37, 72: 327.03, 120: 253.14 },
  },
  {
    amount: 20000,
    label: '20 MIL',
    installments: { 12: 1816.51, 24: 981.17, 36: 705.12, 48: 568.86, 60: 488.49, 72: 436.04, 120: 337.52 },
  },
  {
    amount: 25000,
    label: '25 MIL',
    installments: { 12: 2270.64, 24: 1226.47, 36: 881.40, 48: 711.07, 60: 610.61, 72: 545.05, 120: 421.90 },
  },
  {
    amount: 30000,
    label: '30 MIL',
    installments: { 12: 2724.77, 24: 1471.76, 36: 1057.68, 48: 853.28, 60: 732.73, 72: 654.06, 120: 506.28 },
  },
  {
    amount: 35000,
    label: '35 MIL',
    installments: { 12: 3178.89, 24: 1717.06, 36: 1233.95, 48: 995.50, 60: 854.86, 72: 763.07, 120: 590.67 },
  },
  {
    amount: 40000,
    label: '40 MIL',
    installments: { 12: 3633.02, 24: 1962.35, 36: 1410.23, 48: 1137.71, 60: 976.98, 72: 872.08, 120: 675.05 },
  },
  {
    amount: 45000,
    label: '45 MIL',
    installments: { 12: 4087.15, 24: 2207.64, 36: 1586.51, 48: 1279.93, 60: 1099.10, 72: 981.09, 120: 759.43 },
  },
  {
    amount: 50000,
    label: '50 MIL',
    installments: { 12: 4541.28, 24: 2452.94, 36: 1762.79, 48: 1422.14, 60: 1221.22, 72: 1090.11, 120: 843.81 },
  },
];

export function calculateInstallmentValue(amount: number, installments: number): number {
  const exactRow = OFFICIAL_RATE_TABLE.find((row) => row.amount === amount);
  if (exactRow && (installments as InstallmentCount) in exactRow.installments) {
    return exactRow.installments[installments as InstallmentCount];
  }
  const i = COMPANY_INFO.exactMonthlyRate;
  const pmt = (amount * i) / (1 - Math.pow(1 + i, -installments));
  return Math.round(pmt * 100) / 100;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function onlyDigits(str: string): string {
  return str.replace(/\D/g, '');
}

export function formatCPF(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function isValidCPF(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits.charAt(10), 10);
}

export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatCEP(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
}

export const BRAZILIAN_BANKS = [
  '001 - Banco do Brasil',
  '033 - Banco Santander',
  '104 - Caixa Econômica Federal',
  '237 - Banco Bradesco',
  '341 - Itaú Unibanco',
  '260 - Nu Pagamentos (Nubank)',
  '077 - Banco Inter',
  '336 - Banco C6',
  '290 - PagSeguro (PagBank)',
  '380 - PicPay Bank',
  '323 - Mercado Pago',
  '748 - Sicredi',
  '756 - Sicoob',
  '422 - Banco Safra',
  '655 - Banco Votorantim (BV)',
  'Outro Banco / Instituição',
];

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];
