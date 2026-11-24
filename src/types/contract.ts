export type AccountType = 'Conta Corrente' | 'Conta Poupança' | 'Conta Pagamento';
export type PixKeyType = 'CPF' | 'Celular' | 'E-mail' | 'Chave Aleatória';
export type UserRole = 'admin' | 'employee';

export interface PanelUserPublic {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agentCode: string;
  active: boolean;
  createdAt: string;
}

export interface VisitRecord {
  id: string;
  agentId: string;
  agentCode: string;
  visitedAt: string;
}

export interface LoanContractInput {
  agentCode?: string;
  loanAmount: number;
  installments: number;
  installmentValue: number;
  monthlyRatePercent: number;
  totalPayable: number;
  firstDueDate: string;

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

export interface DashboardEmployeeStat extends PanelUserPublic {
  visitsCount: number;
  contractsCount: number;
  totalVolume: number;
}

export interface DashboardPayload {
  user: PanelUserPublic;
  totalVisits: number;
  totalContracts: number;
  totalVolume: number;
  conversionRate: number;
  employees: DashboardEmployeeStat[];
  contracts: SignedLoanContract[];
}
