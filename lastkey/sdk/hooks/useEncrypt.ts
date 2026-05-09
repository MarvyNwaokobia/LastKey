import { useState, useCallback }               from "react";
import { encryptValue, type EncryptedInput }   from "../encrypt";
import type { ChainKey }                       from "../config";

export function useEncrypt(contractAddress: string, userAddress: string, chain?: ChainKey) {
  const [encrypting, setEncrypting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const encrypt = useCallback(async (
    type:  "uint64" | "uint128" | "bool" | "address",
    value: bigint | boolean | string
  ): Promise<EncryptedInput | null> => {
    setEncrypting(true);
    setError(null);
    try {
      return await encryptValue(type, value, contractAddress, userAddress, chain);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Encryption failed");
      return null;
    } finally {
      setEncrypting(false);
    }
  }, [contractAddress, userAddress, chain]);

  return { encrypt, encrypting, error };
}
