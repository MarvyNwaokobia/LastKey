"use client";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

export interface TokenAsset {
  kind:       "erc20";
  address:    `0x${string}`;
  symbol:     string;
  name:       string;
  balance:    string;   // human-readable
  rawBalance: bigint;
  decimals:   number;
  logo?:      string;
}

export interface NFTAsset {
  kind:            "nft";
  contractAddress: `0x${string}`;
  tokenId:         string;
  name:            string;
  collection:      string;
  imageUrl?:       string;
}

export type WalletAsset = TokenAsset | NFTAsset;

// Derive Alchemy base URL from the configured RPC
function alchemyBase(rpcUrl: string): string | null {
  // e.g. https://eth-sepolia.g.alchemy.com/v2/API_KEY
  const m = rpcUrl.match(/^(https:\/\/[^/]+\/v2\/[^/?]+)/);
  return m ? m[1] : null;
}

function alchemyNftBase(rpcUrl: string): string | null {
  const m = rpcUrl.match(/\/v2\/([^/?]+)/);
  if (!m) return null;
  const key = m[1];
  // keep the subdomain (eth-mainnet, eth-sepolia, etc.)
  const sub = rpcUrl.match(/\/\/(eth-[^.]+)\./)?.[1] ?? "eth-sepolia";
  return `https://${sub}.g.alchemy.com/nft/v3/${key}`;
}

export function useWalletAssets() {
  const { address } = useAccount();
  const [tokens,  setTokens]  = useState<TokenAsset[]>([]);
  const [nfts,    setNfts]    = useState<NFTAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "";
    const base    = alchemyBase(rpcUrl);
    const nftBase = alchemyNftBase(rpcUrl);

    async function fetchAll() {
      setLoading(true);
      setError(null);

      try {
        // ── ERC-20 token balances ────────────────────────────────────────────
        if (base) {
          const balRes = await fetch(base, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              jsonrpc: "2.0", id: 1,
              method:  "alchemy_getTokenBalances",
              params:  [address, "erc20"],
            }),
          });
          const balData = await balRes.json();
          const allBals: Array<{ contractAddress: string; tokenBalance: string }> =
            balData.result?.tokenBalances ?? [];

          const nonZero = allBals.filter(
            (b) => b.tokenBalance !== "0x" + "0".repeat(64)
          ).slice(0, 25);

          const resolved: TokenAsset[] = [];
          await Promise.allSettled(
            nonZero.map(async (b) => {
              const metaRes = await fetch(base, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                  jsonrpc: "2.0", id: 1,
                  method:  "alchemy_getTokenMetadata",
                  params:  [b.contractAddress],
                }),
              });
              const metaData = await metaRes.json();
              const meta = metaData.result;
              if (!meta?.decimals) return;

              const rawBalance = BigInt(b.tokenBalance);
              if (rawBalance === 0n) return;

              const divisor  = 10 ** meta.decimals;
              const readable = (Number(rawBalance) / divisor).toLocaleString("en-US", {
                maximumFractionDigits: 4,
              });

              resolved.push({
                kind:       "erc20",
                address:    b.contractAddress as `0x${string}`,
                symbol:     meta.symbol  ?? "???",
                name:       meta.name    ?? b.contractAddress,
                balance:    readable,
                rawBalance,
                decimals:   meta.decimals,
                logo:       meta.logo    ?? undefined,
              });
            })
          );
          setTokens(resolved.sort((a, b) => Number(b.rawBalance - a.rawBalance)));
        }

        // ── NFTs ─────────────────────────────────────────────────────────────
        if (nftBase) {
          const nftRes = await fetch(
            `${nftBase}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=24`
          );
          const nftData = await nftRes.json();
          const owned: NFTAsset[] = (nftData.ownedNfts ?? []).map(
            (n: {
              contract: { address: string; name?: string };
              tokenId:  string;
              name?:    string;
              image?:   { thumbnailUrl?: string; cachedUrl?: string };
            }) => ({
              kind:            "nft" as const,
              contractAddress: n.contract.address as `0x${string}`,
              tokenId:         n.tokenId,
              name:            n.name ?? `#${n.tokenId}`,
              collection:      n.contract.name ?? n.contract.address.slice(0, 10) + "…",
              imageUrl:        n.image?.thumbnailUrl ?? n.image?.cachedUrl,
            })
          );
          setNfts(owned);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assets");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [address]);

  return { tokens, nfts, loading, error };
}
