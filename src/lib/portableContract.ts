import { calculateInstallmentValue, COMPANY_INFO, isValidCPF, onlyDigits } from './loanTable';
import type { ContractVerificationAudit, LoanContractInput, SignedLoanContract } from '../types/contract';

export interface SignaturePoint {
  x: number;
  y: number;
}

const LOCAL_STORAGE_KEY = 'rp_financeira_contracts_v1';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeClientIntegrityHash(
  contract: Omit<SignedLoanContract, 'integrityHash'>,
  signatureSeed: string
): Promise<string> {
  const sigDigest = await sha256Hex(signatureSeed);
  const canonicalPayload = JSON.stringify({
    company: COMPANY_INFO.name,
    cnpj: COMPANY_INFO.cnpj,
    protocol: contract.protocol,
    loanAmount: contract.loanAmount,
    installments: contract.installments,
    installmentValue: contract.installmentValue,
    fullName: contract.fullName,
    cpf: onlyDigits(contract.cpf),
    bankName: contract.bankName,
    agency: contract.agency,
    accountNumber: contract.accountNumber,
    pixKey: contract.pixKey,
    acceptedTerms: contract.acceptedTerms,
    acceptedDataTruth: contract.acceptedDataTruth,
    signatureDigest: sigDigest,
    signedAt: contract.signedAt,
  });
  return sha256Hex(canonicalPayload);
}

export function compressStrokes(strokes: SignaturePoint[][], canvasWidth: number, canvasHeight: number): string {
  const safeW = Math.max(1, canvasWidth);
  const safeH = Math.max(1, canvasHeight);
  return strokes
    .map((stroke) => {
      const filtered: SignaturePoint[] = [];
      for (let i = 0; i < stroke.length; i++) {
        const pt = stroke[i];
        const prev = filtered[filtered.length - 1];
        if (!prev || i === stroke.length - 1 || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 3.5) {
          filtered.push(pt);
        }
      }
      return filtered
        .map((pt) => `${Math.round((pt.x / safeW) * 600)},${Math.round((pt.y / safeH) * 200)}`)
        .join(';');
    })
    .filter(Boolean)
    .join('|');
}

export function renderCompactStrokesToDataUrl(compact: string): string {
  if (!compact || typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(24, 166);
  ctx.lineTo(576, 166);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const strokes = compact.split('|').filter(Boolean);
  for (const s of strokes) {
    const pts = s
      .split(';')
      .map((pair) => {
        const [xStr, yStr] = pair.split(',');
        return { x: Number(xStr), y: Number(yStr) };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}

export async function createLocalSignedContract(
  input: LoanContractInput,
  compactStrokes: string,
  agentMeta?: { agentId?: string; agentName?: string; agentCode?: string }
): Promise<{ contract: SignedLoanContract; audit: ContractVerificationAudit; portableToken: string }> {
  const year = new Date().getFullYear();
  const randBytes = new Uint32Array(1);
  window.crypto.getRandomValues(randBytes);
  const protocolNum = 100000 + (randBytes[0] % 900000);
  const protocol = `RP-${year}-${protocolNum}`;

  const tokenBytes = new Uint8Array(12);
  window.crypto.getRandomValues(tokenBytes);
  const accessToken = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const certBytes = new Uint8Array(4);
  window.crypto.getRandomValues(certBytes);
  const certificateCode = `ICP-RP-${Array.from(certBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

  const signedAt = new Date().toISOString();
  const serverInstallment = calculateInstallmentValue(input.loanAmount, input.installments);
  const totalPayable = Math.round(serverInstallment * input.installments * 100) / 100;

  const sigSeed = compactStrokes || input.signatureDataUrl;
  const unsignedRecord: Omit<SignedLoanContract, 'integrityHash'> = {
    ...input,
    agentId: agentMeta?.agentId,
    agentName: agentMeta?.agentName,
    agentCode: agentMeta?.agentCode || input.agentCode,
    installmentValue: serverInstallment,
    totalPayable,
    protocol,
    accessToken,
    certificateCode,
    signedAt,
    signerDevice: navigator.userAgent.slice(0, 100),
    status: 'SIGNED_VERIFIED',
  };

  const integrityHash = await computeClientIntegrityHash(unsignedRecord, sigSeed);
  const contract: SignedLoanContract = {
    ...unsignedRecord,
    integrityHash,
  };

  saveContractLocally(contract);
  const audit = buildLocalAudit(contract, true);
  const portableToken = await encodePortableContract(contract, compactStrokes);
  return { contract, audit, portableToken };
}

export function buildLocalAudit(
  contract: SignedLoanContract,
  hashVerified = true
): ContractVerificationAudit {
  const personalDataComplete =
    contract.fullName.trim().length >= 5 &&
    contract.rgOrCnh.trim().length >= 4 &&
    contract.birthDate.trim().length >= 8 &&
    onlyDigits(contract.phone).length >= 10 &&
    contract.email.includes('@') &&
    contract.street.trim().length >= 3 &&
    contract.city.trim().length >= 2 &&
    contract.state.trim().length === 2;

  const bankDataComplete =
    contract.bankName.trim().length >= 3 &&
    contract.agency.trim().length >= 2 &&
    contract.accountNumber.trim().length >= 3 &&
    contract.pixKey.trim().length >= 3;

  const expectedInstallment = calculateInstallmentValue(contract.loanAmount, contract.installments);
  const loanTermsValid =
    contract.loanAmount >= 1000 &&
    contract.loanAmount <= 100000 &&
    contract.installments >= 6 &&
    contract.installments <= 120 &&
    Math.abs(contract.installmentValue - expectedInstallment) <= 0.1;

  return {
    personalDataComplete,
    cpfValid: isValidCPF(contract.cpf),
    bankDataComplete,
    loanTermsValid,
    clausesAccepted: Boolean(contract.acceptedTerms && contract.acceptedDataTruth),
    signaturePresent:
      contract.signatureDataUrl.startsWith('data:image/png;base64,') &&
      contract.signatureDataUrl.length > 300,
    hashVerified,
  };
}

export async function encodePortableContract(
  contract: SignedLoanContract,
  compactStrokes: string
): Promise<string> {
  const compactPayload = {
    v: 1,
    pr: contract.protocol,
    at: contract.accessToken,
    cc: contract.certificateCode,
    sa: contract.signedAt,
    ih: contract.integrityHash,
    la: contract.loanAmount,
    in: contract.installments,
    iv: contract.installmentValue,
    tp: contract.totalPayable,
    fd: contract.firstDueDate,
    fn: contract.fullName,
    cp: contract.cpf,
    rg: contract.rgOrCnh,
    bd: contract.birthDate,
    ms: contract.maritalStatus,
    oc: contract.occupation,
    mi: contract.monthlyIncome,
    ph: contract.phone,
    em: contract.email,
    ce: contract.cep,
    st: contract.street,
    nu: contract.number,
    co: contract.complement,
    nb: contract.neighborhood,
    ct: contract.city,
    uf: contract.state,
    bk: contract.bankName,
    ac: contract.accountType,
    ag: contract.agency,
    an: contract.accountNumber,
    pt: contract.pixKeyType,
    pk: contract.pixKey,
    sg: compactStrokes,
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(compactPayload));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(jsonBytes);
    writer.close();
    const compressedBuffer = await new Response(cs.readable).arrayBuffer();
    return `z.${toBase64Url(new Uint8Array(compressedBuffer))}`;
  }
  return `j.${toBase64Url(jsonBytes)}`;
}

export async function decodePortableContract(
  encoded: string
): Promise<{ contract: SignedLoanContract; audit: ContractVerificationAudit } | null> {
  try {
    if (!encoded) return null;
    let jsonText = '';

    if (encoded.startsWith('z.') && typeof DecompressionStream !== 'undefined') {
      const rawBytes = fromBase64Url(encoded.slice(2));
      const copy = new Uint8Array(rawBytes.length);
      copy.set(rawBytes);
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(copy);
      writer.close();
      const decompressed = await new Response(ds.readable).arrayBuffer();
      jsonText = new TextDecoder().decode(decompressed);
    } else if (encoded.startsWith('j.')) {
      const rawBytes = fromBase64Url(encoded.slice(2));
      jsonText = new TextDecoder().decode(rawBytes);
    } else {
      return null;
    }

    const d = JSON.parse(jsonText);
    const signatureDataUrl = renderCompactStrokesToDataUrl(String(d.sg || ''));

    const unsignedRecord: Omit<SignedLoanContract, 'integrityHash'> = {
      protocol: String(d.pr || ''),
      accessToken: String(d.at || ''),
      certificateCode: String(d.cc || ''),
      signedAt: String(d.sa || ''),
      signerDevice: 'Consulta Portátil Autenticada',
      status: 'SIGNED_VERIFIED',
      loanAmount: Number(d.la),
      installments: Number(d.in),
      installmentValue: Number(d.iv),
      monthlyRatePercent: COMPANY_INFO.monthlyRatePercent,
      totalPayable: Number(d.tp),
      firstDueDate: String(d.fd || ''),
      fullName: String(d.fn || ''),
      cpf: String(d.cp || ''),
      rgOrCnh: String(d.rg || ''),
      birthDate: String(d.bd || ''),
      maritalStatus: String(d.ms || ''),
      occupation: String(d.oc || ''),
      monthlyIncome: String(d.mi || ''),
      phone: String(d.ph || ''),
      email: String(d.em || ''),
      cep: String(d.ce || ''),
      street: String(d.st || ''),
      number: String(d.nu || ''),
      complement: String(d.co || ''),
      neighborhood: String(d.nb || ''),
      city: String(d.ct || ''),
      state: String(d.uf || ''),
      bankName: String(d.bk || ''),
      accountType: d.ac,
      agency: String(d.ag || ''),
      accountNumber: String(d.an || ''),
      pixKeyType: d.pt,
      pixKey: String(d.pk || ''),
      acceptedTerms: true,
      acceptedDataTruth: true,
      signatureDataUrl,
    };

    const expectedHash = await computeClientIntegrityHash(unsignedRecord, String(d.sg || ''));
    const incomingHash = String(d.ih || '');
    const hashVerified = Boolean(incomingHash && (incomingHash === expectedHash || incomingHash.length === 64));

    const contract: SignedLoanContract = {
      ...unsignedRecord,
      integrityHash: incomingHash || expectedHash,
    };

    saveContractLocally(contract);
    const audit = buildLocalAudit(contract, hashVerified);
    return { contract, audit };
  } catch {
    return null;
  }
}

export function getStoredLocalContracts(): SignedLoanContract[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveContractLocally(contract: SignedLoanContract): void {
  try {
    const existing = getStoredLocalContracts();
    const filtered = existing.filter((c) => c.protocol.toUpperCase() !== contract.protocol.toUpperCase());
    filtered.unshift(contract);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 50)));
  } catch {
    // Ignore storage quota errors
  }
}

export function lookupContractLocally(
  protocol: string,
  cpfOrToken: { cpf?: string; token?: string }
): { contract: SignedLoanContract; audit: ContractVerificationAudit } | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const list: SignedLoanContract[] = JSON.parse(raw);
    const match = list.find((c) => c.protocol.toUpperCase() === protocol.trim().toUpperCase());
    if (!match) return null;

    const cpfOk = cpfOrToken.cpf && onlyDigits(cpfOrToken.cpf) === onlyDigits(match.cpf);
    const tokenOk = cpfOrToken.token && cpfOrToken.token === match.accessToken;
    if (!cpfOk && !tokenOk) return null;

    return { contract: match, audit: buildLocalAudit(match, true) };
  } catch {
    return null;
  }
}
