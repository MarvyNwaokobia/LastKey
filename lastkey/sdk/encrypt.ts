import { getFhevmInstance } from "./instance";
import { wrap }             from "./errors";
import type { ChainKey }    from "./config";

export interface EncryptedInput {
  handles:    Uint8Array[];
  inputProof: Uint8Array;
}

type EncryptType =
  | "bool" | "uint8" | "uint16" | "uint32"
  | "uint64" | "uint128" | "uint256" | "address";

/**
 * Encrypt a single value for submission to an FHEVM contract.
 *
 * The inputProof is bound to one specific contractAddress + userAddress.
 * Never reuse a proof across different contracts.
 */
export async function encryptValue(
  type:            EncryptType,
  value:           bigint | boolean | string,
  contractAddress: string,
  userAddress:     string,
  chain:           ChainKey = "sepolia"
): Promise<EncryptedInput> {
  return wrap("encrypt", async () => {
    const fhe   = await getFhevmInstance(chain);
    const input = fhe.createEncryptedInput(contractAddress, userAddress);

    switch (type) {
      case "bool":    input.addBool(value as boolean);   break;
      case "uint8":   input.add8(value as bigint);       break;
      case "uint16":  input.add16(value as bigint);      break;
      case "uint32":  input.add32(value as bigint);      break;
      case "uint64":  input.add64(value as bigint);      break;
      case "uint128": input.add128(value as bigint);     break;
      case "uint256": input.add256(value as bigint);     break;
      case "address": input.addAddress(value as string); break;
      default:        throw new Error(`Unknown encrypted type: ${type}`);
    }

    return input.encrypt();
  });
}

export const encryptBool    = (v: boolean, c: string, u: string, chain?: ChainKey) =>
  encryptValue("bool",    v, c, u, chain);
export const encryptUint8   = (v: bigint,  c: string, u: string, chain?: ChainKey) =>
  encryptValue("uint8",   v, c, u, chain);
export const encryptUint32  = (v: bigint,  c: string, u: string, chain?: ChainKey) =>
  encryptValue("uint32",  v, c, u, chain);
export const encryptUint64  = (v: bigint,  c: string, u: string, chain?: ChainKey) =>
  encryptValue("uint64",  v, c, u, chain);
export const encryptUint128 = (v: bigint,  c: string, u: string, chain?: ChainKey) =>
  encryptValue("uint128", v, c, u, chain);
export const encryptAddress = (v: string,  c: string, u: string, chain?: ChainKey) =>
  encryptValue("address", v, c, u, chain);

/**
 * Encrypt multiple values in one SDK call.
 * A single inputProof covers all values in the batch.
 */
export async function encryptBatch(
  inputs:          Array<{ type: EncryptType; value: bigint | boolean | string }>,
  contractAddress: string,
  userAddress:     string,
  chain:           ChainKey = "sepolia"
): Promise<EncryptedInput> {
  return wrap("encryptBatch", async () => {
    const fhe   = await getFhevmInstance(chain);
    const input = fhe.createEncryptedInput(contractAddress, userAddress);

    for (const { type, value } of inputs) {
      switch (type) {
        case "bool":    input.addBool(value as boolean);   break;
        case "uint64":  input.add64(value as bigint);      break;
        case "uint128": input.add128(value as bigint);     break;
        case "uint256": input.add256(value as bigint);     break;
        case "address": input.addAddress(value as string); break;
        default: throw new Error(`Unsupported type in batch: ${type}`);
      }
    }

    return input.encrypt();
  });
}
