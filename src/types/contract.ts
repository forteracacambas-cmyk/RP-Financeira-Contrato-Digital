export type AccountType = 'Conta Corrente' | 'Conta Poupança' | 'Conta Pagamento';
export type PixKeyType = 'CPF' | 'Celular' | 'E-mail' | 'Chave Aleatória';
export type InvoiceDeliveryMethod = 'WhatsApp' | 'E-mail' | 'WhatsApp e E-mail';
export type UserRole = 'admin' | 'employee';

export interface PanelUserPublic {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agentCode: string;
  active: boolean;
  createdAt: string;
  queueOrder?: number;
}

export interface VisitRecord {
  id: string;
  agentId: string;
  agentCode: string;
  visitedAt: string;
  ipHash?: string;
  viaFirm?: boolean;
  firmIpHash?: string;
}

export interface LoanContractInput {
  agentCode?: string;
  viaFirm?: boolean;
  loanAmount: number;
  installments: number;
  installmentValue: number;
  monthlyRatePercent: number;
  totalPayable: number;
  firstDueDate: string;
  invoiceDeliveryMethod?: InvoiceDeliveryMethod;

  fullName: string;
  cpf: string;
  rgOrCnh: string;
  birthDate: string;
  maritalStatus: string;
  occupation: string;
  monthlyIncome: string;
  phone: string;
  email: string;

  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;

  bankName: string;
  accountType: AccountType;
  agency: string;
  accountNumber: string;
  pixKeyType: PixKeyType;
  pixKey: string;

  acceptedTerms: boolean;
  acceptedDataTruth: boolean;
  signatureDataUrl: string;
}

export interface SignedLoanContract extends LoanContractInput {
  protocol: string;
  accessToken: string;
  integrityHash: string;
  certificateCode: string;
  signedAt: string;
  signerDevice: string;
  status: 'SIGNED_VERIFIED';
  agentId?: string;
  agentName?: string;
  agentCode?: string;
  viaFirm?: boolean;
}

export interface ContractVerificationAudit {
  personalDataComplete: boolean;
  cpfValid: boolean;
  bankDataComplete: boolean;
  loanTermsValid: boolean;
  clausesAccepted: boolean;
  signaturePresent: boolean;
  hashVerified: boolean;
}

export type DatePreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';

export interface FirmQueueSummary {
  mode: 'cycle' | 'today';
  sinceIso: string;
  direction: 'down' | 'up';
  nextEmployeeId: string | null;
  nextEmployeeName: string | null;
  nextEmployeeCode: string | null;
  minFichas: number;
  activeCount: number;
}

export interface DashboardEmployeeStat extends PanelUserPublic {
  visitsCount: number;
  contractsCount: number;
  totalVolume: number;
  queueFichasCount?: number;
  queuePendingCount?: number;
  isNextInQueue?: boolean;
}

export interface DashboardPayload {
  user: PanelUserPublic;
  totalVisits: number;
  totalContracts: number;
  totalVolume: number;
  conversionRate: number;
  employees: DashboardEmployeeStat[];
  contracts: SignedLoanContract[];
  firmQueue?: FirmQueueSummary;
}
