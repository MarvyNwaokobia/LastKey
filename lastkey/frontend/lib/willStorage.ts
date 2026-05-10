export interface BeneficiaryMeta {
  email: string;
  share: number; // 0–100 percent
}

export interface GuardianMeta {
  email: string;
}

export interface WillMeta {
  willAddress: string;
  ownerAddress: string;
  beneficiaries: BeneficiaryMeta[];
  guardians: GuardianMeta[];
  inactivityDays: number;
  createdAt: number;         // unix seconds
  deployedAtBlock?: string;  // stored as string (bigint not JSON-serializable)
}

function key(ownerAddress: string) {
  return `lastkey_will_${ownerAddress.toLowerCase()}`;
}

export function saveWillMeta(data: WillMeta): void {
  try {
    localStorage.setItem(key(data.ownerAddress), JSON.stringify(data));
  } catch {}
}

export function getWillMeta(ownerAddress: string): WillMeta | null {
  try {
    const raw = localStorage.getItem(key(ownerAddress));
    return raw ? (JSON.parse(raw) as WillMeta) : null;
  } catch {
    return null;
  }
}

export function clearWillMeta(ownerAddress: string): void {
  try {
    localStorage.removeItem(key(ownerAddress));
  } catch {}
}

/** Mask an email for display: alice@example.com → a***@e***.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const [domainName, ...tld] = domain.split(".");
  return `${local[0]}***@${domainName[0]}***.${tld.join(".")}`;
}
