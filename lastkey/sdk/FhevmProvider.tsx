"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { getFhevmInstance } from "./instance";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/node";
import type { Eip1193Provider } from "ethers";
import type { ChainKey } from "./config";

interface FhevmContextType {
  instance: FhevmInstance | null;
  loading:  boolean;
  error:    string | null;
  ready:    boolean;
}

const FhevmContext = createContext<FhevmContextType>({
  instance: null,
  loading:  true,
  error:    null,
  ready:    false,
});

/**
 * FhevmProvider initializes the Zama Relayer SDK (including WASM loading).
 * Wrap your application with this to ensure FHE operations are available.
 */
export function FhevmProvider({
  children,
  chain = "sepolia",
  provider,
}: {
  children: React.ReactNode;
  chain?:    ChainKey;
  provider?: string | Eip1193Provider;
}) {
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError(null);
        // getFhevmInstance handles singleton logic and WASM initialization
        const inst = await getFhevmInstance(chain, provider);
        setInstance(inst);
      } catch (err: unknown) {
        console.error("FHEVM initialization failed:", err);
        setError(err instanceof Error ? err.message : "FHEVM initialization failed");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [chain, provider]);

  return (
    <FhevmContext.Provider value={{ instance, loading, error, ready: !!instance }}>
      {children}
    </FhevmContext.Provider>
  );
}

/** Hook to access the FhevmInstance and initialization state */
export function useFhevm() {
  return useContext(FhevmContext);
}
