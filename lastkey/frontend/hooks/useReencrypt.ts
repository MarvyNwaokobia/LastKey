"use client";
import { useState, useCallback }  from "react";
import { useSignTypedData }        from "wagmi";
import { useFhevm }                from "@fhevm/sdk";
import { reencryptBatch }          from "@fhevm/sdk";

export function useReencrypt(
  contractAddress: string,
  userAddress:     string
) {
  const [values,  setValues]  = useState<bigint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const { ready }             = useFhevm();

  const { signTypedDataAsync } = useSignTypedData();

  const reveal = useCallback(async (handles: bigint[]) => {
    if (!userAddress) { setError("Wallet not connected"); return; }
    if (!ready)       { setError("FHEVM not initialized"); return; }

    setLoading(true);
    setError(null);

    try {
      const decrypted = await reencryptBatch(
        handles,
        contractAddress,
        userAddress,
        {
          signTypedData: async (domain: any, types: any, message: any) => {
            return signTypedDataAsync({
              domain,
              types,
              primaryType: Object.keys(types)[0],
              message,
            });
          },
        }
      );

      setValues(decrypted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Decryption failed");
    } finally {
      setLoading(false);
    }
  }, [contractAddress, userAddress, ready, signTypedDataAsync]);

  return { values, reveal, loading, error };
}
