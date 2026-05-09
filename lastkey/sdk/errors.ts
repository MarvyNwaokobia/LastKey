export class FhevmError extends Error {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly cause?: unknown
  ) {
    super(`[FHEVM${operation ? `:${operation}` : ""}] ${message}`);
    this.name = "FhevmError";
  }
}

const ERROR_MAP: Array<[string, string]> = [
  [
    "getRelayer is not a function",
    "Called fhe.getRelayer() — this method does not exist. " +
    "Use fhe.publicDecrypt() directly on the FhevmInstance.",
  ],
  [
    "invalid handle",
    "Encrypted handle is 0 or uninitialized. " +
    "Check that FHE.allowThis() was called after assigning the euint value.",
  ],
  [
    "ACL not authorized",
    "Address does not have FHE.allow() permission for this handle. " +
    "Call FHE.allow(handle, address) in the contract before reading.",
  ],
  [
    "input proof",
    "inputProof is invalid or expired. Re-encrypt the value — " +
    "proofs are single-use and bound to one contract + user address pair.",
  ],
  [
    "execution reverted",
    "Contract reverted. Common FHEVM causes: " +
    "(1) missing FHE.allowThis(), " +
    "(2) wrong arg count on resolver, " +
    "(3) missing onlyGateway modifier on callback.",
  ],
  [
    "network changed",
    "Wallet network changed. Call resetFhevmInstance() then getFhevmInstance() again.",
  ],
];

export async function wrap<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const raw   = err instanceof Error ? err.message : String(err);
    const known = ERROR_MAP.find(([pattern]) => raw.includes(pattern));
    throw new FhevmError(known ? known[1] : raw, operation, err);
  }
}
