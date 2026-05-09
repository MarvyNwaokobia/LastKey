import { useState, useCallback } from "react";
import { reencryptBatch }        from "../decrypt";
import type { ChainKey }         from "../config";

export function useReencrypt(
  contractAddress: string,
  userAddress:     string,
  signer:          unknown,
  chain?:          ChainKey
) {
  const [values,  setValues]  = useState<bigint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const reveal = useCallback(async (handles: bigint[]) => {
    setLoading(true);
    setError(null);
    try {
      const decrypted = await reencryptBatch(
        handles, contractAddress, userAddress, signer as any, chain
      );
      setValues(decrypted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Decryption failed");
    } finally {
      setLoading(false);
    }
  }, [contractAddress, userAddress, signer, chain]);

  return { values, reveal, loading, error };
}
