import { createInstance, FhevmInstance } from "@zama-fhe/relayer-sdk/web";
import type { Eip1193Provider }          from "ethers";
import { CHAIN_CONFIGS, type ChainKey } from "./config";

let _instance: FhevmInstance | null = null;
let _currentChain: ChainKey | null  = null;

type Environment = "browser" | "node" | "test";

function detectEnvironment(): Environment {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return "test";
  if (typeof window  !== "undefined") return "browser";
  return "node";
}

/**
 * Returns the singleton FhevmInstance for the given chain.
 * Safe to call multiple times — initializes only once per chain.
 *
 * @param chain    Chain to connect to. Default: "sepolia"
 * @param provider Optional ethers/viem provider (required in browser for wallet ops)
 */
export async function getFhevmInstance(
  chain:     ChainKey = "sepolia",
  provider?: string | Eip1193Provider
): Promise<FhevmInstance> {
  if (_instance && _currentChain === chain) return _instance;

  const config = CHAIN_CONFIGS[chain];
  if (!config) throw new Error(`Unknown chain: ${chain}`);

  const env = detectEnvironment();

  if (env === "test") {
    _instance = await createInstance({
      ...config,
      chainId:        31337,
      gatewayChainId: 31337,
    });
  } else {
    _instance = await createInstance({
      ...config,
      ...(provider ? { network: provider } : {}),
    });
  }

  _currentChain = chain;
  return _instance;
}

/** Reset the singleton. Call this when the user switches network in their wallet. */
export function resetFhevmInstance(): void {
  _instance     = null;
  _currentChain = null;
}
