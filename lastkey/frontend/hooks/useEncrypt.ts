"use client";
import { useState, useCallback }               from "react";
import { useAccount }                          from "wagmi";
import { useFhevm }                            from "@fhevm/sdk";
import { encryptValue, type EncryptedInput }   from "@fhevm/sdk";

export function useEncrypt(contractAddress: string) {
  const { address: userAddress }    = useAccount();
  const [encrypting, setEncrypting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const { ready }                   = useFhevm();

  const encrypt = useCallback(async (
    type:  "uint64" | "uint128" | "bool" | "address",
    value: bigint | boolean | string
  ): Promise<EncryptedInput | null> => {
    if (!userAddress) { setError("Wallet not connected"); return null; }
    if (!ready)       { setError("FHEVM not initialized"); return null; }

    setEncrypting(true);
    setError(null);
    try {
      return await encryptValue(type, value, contractAddress, userAddress);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Encryption failed");
      return null;
    } finally {
      setEncrypting(false);
    }
  }, [contractAddress, userAddress, ready]);

  return { encrypt, encrypting, error };
}
