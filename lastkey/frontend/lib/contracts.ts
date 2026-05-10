// ─── Contract addresses (populated from .env.local after deployment) ──────────
export const WILL_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_WILL_FACTORY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const WILL_EXECUTOR_ADDRESS =
  (process.env.NEXT_PUBLIC_WILL_EXECUTOR_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

// ─── WillFactory ABI ──────────────────────────────────────────────────────────
export const WILL_FACTORY_ABI = [
  {
    name: "createWill",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "executorAddress", type: "address" }],
    outputs: [{ name: "willAddress", type: "address" }],
  },
  {
    name: "getWill",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "hasWill",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isValidWill",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "willContract", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "predictWillAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "WillCreated",
    type: "event",
    inputs: [
      { name: "owner",       type: "address", indexed: true },
      { name: "willAddress", type: "address", indexed: true },
    ],
  },
] as const;

// ─── FHEWill ABI ──────────────────────────────────────────────────────────────
export const FHE_WILL_ABI = [
  // State readers
  { name: "owner",               type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "state",               type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8"  }] },
  { name: "beneficiaryCount",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8"  }] },
  { name: "guardianCount",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8"  }] },
  { name: "guardianConfirmCount",type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8"  }] },
  { name: "lastActivityTimestamp",type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "lastHeartbeatTimestamp",type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "inactivityWindow",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "heartbeatInterval",   type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "isLivenessExpired",   type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool"   }] },
  { name: "isInactive",          type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool"   }] },
  // Write functions
  {
    name: "addBeneficiary",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "encryptedEmailHash", type: "bytes32" },
      { name: "encryptedShare",     type: "bytes32" },
      { name: "encryptedFallback",  type: "bytes32" },
      { name: "inputProof",         type: "bytes"   },
    ],
    outputs: [],
  },
  {
    name: "addGuardian",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "encryptedGuardianHash", type: "bytes32" },
      { name: "inputProof",            type: "bytes"   },
    ],
    outputs: [],
  },
  {
    name: "submitHeartbeat",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "passkeyAttestation", type: "bytes" }],
    outputs: [],
  },
  {
    name: "setInactivityWindow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newWindow", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancelExecution",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "confirmDeceased",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "guardianSigHash", type: "bytes32" }],
    outputs: [],
  },
  // Events
  { name: "WillActivated",   type: "event", inputs: [{ name: "owner", type: "address", indexed: true }] },
  { name: "HeartbeatSubmitted", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { name: "ExecutionTriggered", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }] },
  { name: "WillExecuted",    type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "beneficiaryCount", type: "uint8", indexed: false }] },
] as const;

// ─── Minimal ERC-721 ABI (setApprovalForAll) ─────────────────────────────────
export const ERC721_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool"    },
    ],
    outputs: [],
  },
] as const;

// ─── Minimal ERC-20 ABI (approve + metadata reads) ───────────────────────────
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// ─── Will state enum ──────────────────────────────────────────────────────────
export const WillState = { ACTIVE: 0, CONFIRMING: 1, EXECUTED: 2 } as const;

export function formatWillState(state: number): { label: string; color: "success" | "warning" | "muted" } {
  switch (state) {
    case WillState.ACTIVE:     return { label: "ACTIVE",     color: "success" };
    case WillState.CONFIRMING: return { label: "CONFIRMING", color: "warning" };
    case WillState.EXECUTED:   return { label: "EXECUTED",   color: "muted"   };
    default:                   return { label: "UNKNOWN",    color: "muted"   };
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────
export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatTimestamp(ts: bigint | undefined): string {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function secondsToDays(sec: bigint | undefined): number {
  if (!sec) return 0;
  return Math.floor(Number(sec) / 86400);
}
