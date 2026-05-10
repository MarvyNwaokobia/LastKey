"use client";
import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { keccak256, toHex } from "viem";

// Alchemy free tier silently fails eth_getLogs for ranges > ~2000 blocks on some endpoints.
// We fetch the latest block first and scan backwards by a safe window.
// For wills deployed within that window we get full history; older wills get recent history.
const LOOKBACK = BigInt(7_200); // ~24 hours at 12s/block

export interface HistoryEntry {
  type:        string;
  label:       string;       // human-readable action
  tag:         string;       // short badge text
  tagColor:    string;       // CSS color token
  tagBg:       string;       // CSS background token
  emoji:       string;
  txHash:      `0x${string}`;
  blockNumber: bigint;
  timestamp?:  number;
}

// Pre-compute topic0 hashes for every FHEWill event
const T = {
  WillActivated:       keccak256(toHex("WillActivated(address)")),
  BeneficiaryAdded:    keccak256(toHex("BeneficiaryAdded(uint8)")),
  GuardianAdded:       keccak256(toHex("GuardianAdded(uint8)")),
  ActivityRecorded:    keccak256(toHex("ActivityRecorded(address,uint256)")),
  HeartbeatSubmitted:  keccak256(toHex("HeartbeatSubmitted(address,uint256)")),
  GuardianConfirmed:   keccak256(toHex("GuardianConfirmed(uint8)")),
  ExecutionTriggered:  keccak256(toHex("ExecutionTriggered(address)")),
  ExecutionCancelled:  keccak256(toHex("ExecutionCancelled(address)")),
  WillExecuted:        keccak256(toHex("WillExecuted(address,uint8)")),
} as const;

interface EventMeta {
  label:    string;
  tag:      string;
  tagColor: string;
  tagBg:    string;
  emoji:    string;
  type:     string;
}

function decode(topic0: string | undefined): EventMeta {
  switch (topic0) {
    case T.WillActivated:
      return { type: "created",    label: "Will created",             tag: "Created",    tagColor: "var(--accent-primary)",  tagBg: "var(--accent-primary-muted)",    emoji: "✅" };
    case T.BeneficiaryAdded:
      return { type: "beneficiary",label: "Beneficiary added",        tag: "Beneficiary",tagColor: "#60A5FA",                 tagBg: "rgba(96,165,250,0.12)",          emoji: "👥" };
    case T.GuardianAdded:
      return { type: "guardian",   label: "Guardian added",           tag: "Guardian",   tagColor: "#A78BFA",                 tagBg: "rgba(167,139,250,0.12)",         emoji: "🛡️" };
    case T.ActivityRecorded:
      return { type: "activity",   label: "Activity recorded",        tag: "Activity",   tagColor: "#34D399",                 tagBg: "rgba(52,211,153,0.10)",          emoji: "📍" };
    case T.HeartbeatSubmitted:
      return { type: "heartbeat",  label: "Live signal updated",      tag: "Live Signal",tagColor: "#34D399",                 tagBg: "rgba(52,211,153,0.12)",          emoji: "💚" };
    case T.GuardianConfirmed:
      return { type: "confirmed",  label: "Guardian confirmed",       tag: "Confirmed",  tagColor: "#FBBF24",                 tagBg: "rgba(251,191,36,0.12)",          emoji: "✋" };
    case T.ExecutionTriggered:
      return { type: "triggered",  label: "Execution triggered",      tag: "Triggered",  tagColor: "var(--accent-warning)",   tagBg: "rgba(251,191,36,0.12)",          emoji: "⚠️" };
    case T.ExecutionCancelled:
      return { type: "cancelled",  label: "Execution cancelled",      tag: "Cancelled",  tagColor: "var(--text-secondary)",   tagBg: "var(--bg-elevated)",             emoji: "🚫" };
    case T.WillExecuted:
      return { type: "executed",   label: "Will executed",            tag: "Executed",   tagColor: "var(--accent-danger)",    tagBg: "rgba(248,113,113,0.12)",         emoji: "📜" };
    default:
      return { type: "unknown",    label: "Contract interaction",     tag: "Tx",         tagColor: "var(--text-muted)",       tagBg: "var(--bg-elevated)",             emoji: "🔗" };
  }
}

export function useWillHistory(
  willAddr:        `0x${string}` | null,
  deployedAtBlock?: string   // from WillMeta — most precise fromBlock when available
) {
  const [history, setHistory]   = useState<HistoryEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [tick, setTick]         = useState(0);
  const publicClient = usePublicClient();

  function refetch() { setTick(t => t + 1); }

  useEffect(() => {
    if (!willAddr || willAddr === "0x0000000000000000000000000000000000000000") return;
    if (!publicClient) return;
    void tick;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Compute a safe fromBlock: prefer stored deploy block, else scan last LOOKBACK blocks
        const latestBlock = await publicClient!.getBlockNumber();
        const fromBlock = deployedAtBlock
          ? BigInt(deployedAtBlock)
          : latestBlock > LOOKBACK ? latestBlock - LOOKBACK : 0n;

        const logs = await publicClient!.getLogs({
          address:   willAddr as `0x${string}`,
          fromBlock,
          toBlock:   "latest",
        });

        if (cancelled) return;

        // Resolve unique block timestamps in parallel
        const blockNums = [...new Set(logs.map((l) => l.blockNumber).filter(Boolean) as bigint[])];
        const ts = new Map<bigint, number>();

        await Promise.allSettled(
          blockNums.map(async (n) => {
            const block = await publicClient!.getBlock({ blockNumber: n });
            ts.set(n, Number(block.timestamp));
          })
        );

        if (cancelled) return;

        const entries: HistoryEntry[] = logs
          .filter((l) => l.transactionHash && l.blockNumber)
          .map((l) => ({
            ...decode(l.topics[0]),
            txHash:      l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
            timestamp:   ts.get(l.blockNumber as bigint),
          }))
          .sort((a, b) => Number(b.blockNumber - a.blockNumber));

        setHistory(entries);
      } catch (e) {
        console.error("useWillHistory:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [willAddr, publicClient, tick, deployedAtBlock]);

  return { history, loading, refetch };
}
