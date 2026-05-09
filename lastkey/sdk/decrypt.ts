import { getFhevmInstance } from "./instance";
import { wrap }             from "./errors";
import type { ChainKey }    from "./config";

export interface PublicDecryptResult {
  results:     Record<string, bigint | boolean | string>;
  clearValues: bigint[];
}

function toHexHandle(h: bigint): string {
  return "0x" + h.toString(16).padStart(64, "0");
}

function extractBigint(
  results: Record<string, bigint | boolean | string>,
  key:     string
): bigint {
  const v = results[key] ?? results[key.toLowerCase()] ?? results[key.toUpperCase()];
  if (typeof v === "bigint")  return v;
  if (typeof v === "boolean") return v ? 1n : 0n;
  return BigInt(String(v));
}

/**
 * Request public decryption of one or more encrypted handles via the Relayer SDK.
 */
export async function publicDecrypt(
  handles: bigint[],
  chain:   ChainKey = "sepolia"
): Promise<PublicDecryptResult> {
  return wrap("publicDecrypt", async () => {
    const fhe        = await getFhevmInstance(chain);
    const hexHandles = handles.map(toHexHandle);
    const results    = await fhe.publicDecrypt(hexHandles);
    const clearValues = hexHandles.map(h => extractBigint(results, h));
    return { results, clearValues };
  });
}

/**
 * Reencrypt a single handle so the owning wallet can read it.
 */
export async function reencrypt(
  handle:          bigint,
  contractAddress: string,
  userAddress:     string,
  signer:          { signTypedData: (d: unknown, t: unknown, v: unknown) => Promise<string> },
  chain:           ChainKey = "sepolia"
): Promise<bigint> {
  const values = await reencryptBatch([handle], contractAddress, userAddress, signer, chain);
  return values[0];
}

/**
 * Reencrypt multiple handles in one wallet signature round-trip.
 * Requires an EIP-712 wallet signature to prove ownership.
 */
export async function reencryptBatch(
  handles:         bigint[],
  contractAddress: string,
  userAddress:     string,
  signer:          { signTypedData: (d: unknown, t: unknown, v: unknown) => Promise<string> },
  chain:           ChainKey = "sepolia"
): Promise<bigint[]> {
  return wrap("reencryptBatch", async () => {
    const fhe = await getFhevmInstance(chain);
    const { publicKey, privateKey } = fhe.generateKeypair();

    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays   = 1;

    const eip712    = fhe.createEIP712(publicKey, [contractAddress], startTimestamp, durationDays);
    const signature = await signer.signTypedData(eip712.domain, eip712.types, eip712.message);

    const handlePairs = handles.map(h => ({
      handle:          toHexHandle(h),
      contractAddress,
    }));

    const results = await fhe.userDecrypt(
      handlePairs,
      privateKey,
      publicKey,
      signature,
      [contractAddress],
      userAddress,
      startTimestamp,
      durationDays
    );

    return handles.map(h => extractBigint(results, toHexHandle(h)));
  });
}
