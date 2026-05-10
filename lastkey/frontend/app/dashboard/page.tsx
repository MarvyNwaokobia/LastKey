"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useReadContracts, useWriteContract, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import {
  WILL_FACTORY_ADDRESS, WILL_FACTORY_ABI, FHE_WILL_ABI,
  formatWillState, formatTimestamp, secondsToDays, shortenAddress, WillState,
} from "@/lib/contracts";
import { getWillMeta, maskEmail, type WillMeta } from "@/lib/willStorage";
import { useWillHistory } from "@/hooks/useWillHistory";
import { EditWillPanel } from "@/components/dashboard/EditWillPanel";

// ── Animation helpers ──────────────────────────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const card = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

// ── Card shell ─────────────────────────────────────────────────────────────────
function DashCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={card}
      className="rounded-xl p-6"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2 mb-5">
        {icon && <span className="text-sm">{icon}</span>}
        <p className="text-xs font-mono font-medium uppercase tracking-widest"
           style={{ color: "var(--text-muted)" }}>
          {title}
        </p>
      </div>
      {children}
    </motion.div>
  );
}

// ── Liveness progress bar ──────────────────────────────────────────────────────
function LivenessBar({ pct }: { pct: number }) {
  const cls = pct >= 90 ? "danger" : pct >= 60 ? "warning" : "";
  return (
    <div className="progress-track mt-2">
      <motion.div
        className={`progress-fill ${cls}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(pct, 100)}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="text-xs font-mono px-2 py-0.5 rounded transition-colors"
      style={{
        background: copied ? "rgba(52,211,153,0.12)" : "var(--bg-elevated)",
        color: copied ? "var(--accent-success)" : "var(--text-muted)",
      }}
    >
      {copied ? "Copied!" : shortenAddress(address)}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const config = useConfig();
  const [meta, setMeta]           = useState<WillMeta | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [showEdit, setShowEdit]   = useState(false);

  // Load stored metadata from localStorage
  useEffect(() => {
    if (address) setMeta(getWillMeta(address));
  }, [address]);

  // 1. Get will address
  const { data: willAddr } = useReadContracts({
    contracts: [{
      address:      WILL_FACTORY_ADDRESS,
      abi:          WILL_FACTORY_ABI,
      functionName: "getWill",
      args:         address ? [address] : undefined,
    }],
    query: { enabled: !!address },
  });
  const will = (willAddr?.[0]?.result as `0x${string}` | undefined) ?? null;

  // Transaction history
  const { history, loading: historyLoading, refetch: refetchHistory } = useWillHistory(
    will && will !== "0x0000000000000000000000000000000000000000" ? will : null,
    meta?.deployedAtBlock
  );

  // 2. Read will on-chain state
  const reads = useReadContracts({
    contracts: !will || will === "0x0000000000000000000000000000000000000000" ? [] : [
      { address: will, abi: FHE_WILL_ABI, functionName: "state"                   },
      { address: will, abi: FHE_WILL_ABI, functionName: "beneficiaryCount"         },
      { address: will, abi: FHE_WILL_ABI, functionName: "guardianCount"            },
      { address: will, abi: FHE_WILL_ABI, functionName: "guardianConfirmCount"     },
      { address: will, abi: FHE_WILL_ABI, functionName: "lastActivityTimestamp"    },
      { address: will, abi: FHE_WILL_ABI, functionName: "lastHeartbeatTimestamp"   },
      { address: will, abi: FHE_WILL_ABI, functionName: "inactivityWindow"         },
      { address: will, abi: FHE_WILL_ABI, functionName: "heartbeatInterval"        },
    ],
    query: { enabled: !!will && will !== "0x0000000000000000000000000000000000000000", refetchInterval: 30_000 },
  });

  const [stateVal, benCount, guardCount, , lastActivity, lastHeartbeat, inactWindow] =
    reads.data?.map((r) => r.result) ?? [];

  const willState   = typeof stateVal  === "number" ? stateVal  : 0;
  const benNum      = typeof benCount  === "number" ? benCount  : 0;
  const guardNum    = typeof guardCount=== "number" ? guardCount: 0;
  const stateInfo   = formatWillState(willState);

  // Liveness calculation
  const now         = BigInt(Math.floor(Date.now() / 1000));
  const elapsed     = lastActivity && inactWindow ? Number(now - (lastActivity as bigint)) : 0;
  const windowSecs  = inactWindow ? Number(inactWindow as bigint) : 1;
  const livenessPct = Math.min(100, Math.round((elapsed / windowSecs) * 100));
  const daysLeft    = Math.max(0, secondsToDays(typeof inactWindow === "bigint" ? inactWindow : undefined) - Math.floor(elapsed / 86400));
  const daysElapsed = Math.floor(elapsed / 86400);

  async function heartbeat() {
    if (!will) return;
    const hash = await writeContractAsync({
      address:      will,
      abi:          FHE_WILL_ABI,
      functionName: "submitHeartbeat",
      args:         ["0x01"],
    });
    await waitForTransactionReceipt(config, { hash });
    refetchHistory();
    reads.refetch();
  }

  // ── Not connected ─────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center px-6 pt-16">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-6">🔐</div>
            <h1 className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Connect your wallet to view your will
            </h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
              Your dashboard is tied to your wallet address.
            </p>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  // ── No will ───────────────────────────────────────────────────────────────────
  const noWill = !will || will === "0x0000000000000000000000000000000000000000";
  if (noWill) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center px-6 pt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-sm"
          >
            <div className="text-5xl mb-6">📜</div>
            <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              No will yet
            </h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
              Create your encrypted will in under two minutes. Beneficiary data never touches the chain in plaintext.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white"
              style={{ background: "var(--accent-primary)", boxShadow: "0 0 24px rgba(124,106,247,0.3)" }}
            >
              Create Your Will
            </Link>
            <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
              🔒 All data encrypted via Zama FHEVM
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const windowLabel =
    windowSecs <= 180 * 86400 + 1000 ? "6 months" :
    windowSecs <= 365 * 86400 + 1000 ? "1 year"   :
    "2 years";

  const createdDate = meta?.createdAt
    ? new Date(meta.createdAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pt-16" style={{ background: "var(--bg-base)" }}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Security badge ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg mb-6 text-xs"
          style={{
            background: "var(--accent-primary-muted)",
            border: "1px solid rgba(124,106,247,0.2)",
            color: "var(--accent-primary)",
          }}
        >
          <span>🔒</span>
          <span>
            All beneficiary identities and allocation shares are <strong>end-to-end encrypted</strong> via Zama FHEVM —
            invisible to everyone, including us, until the moment they need to be revealed.
          </span>
        </motion.div>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-6 flex items-start justify-between flex-wrap gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Your LastKey
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <CopyAddress address={will} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Created {createdDate}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Window: {windowLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-3 py-1 rounded-full text-xs font-mono font-semibold"
              style={{
                background: stateInfo.color === "success" ? "rgba(52,211,153,0.12)"
                          : stateInfo.color === "warning" ? "rgba(251,191,36,0.12)"
                          : "var(--bg-elevated)",
                color: stateInfo.color === "success" ? "var(--accent-success)"
                     : stateInfo.color === "warning" ? "var(--accent-warning)"
                     : "var(--text-muted)",
              }}
            >
              ● {stateInfo.label}
            </span>
            {willState === WillState.CONFIRMING && (
              <span className="px-3 py-1 rounded-full text-xs"
                    style={{ background: "rgba(248,113,113,0.12)", color: "var(--accent-danger)" }}>
                ⚠ Action needed
              </span>
            )}
            {willState === WillState.ACTIVE && (
              <button
                onClick={() => setShowEdit(e => !e)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: showEdit ? "var(--accent-primary)" : "var(--bg-elevated)",
                  color:      showEdit ? "#fff" : "var(--text-secondary)",
                  border:     "1px solid var(--border-default)",
                }}
              >
                {showEdit ? "✕ Close" : "✏️ Edit Will"}
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Edit panel ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showEdit && (
            <EditWillPanel
              willAddr={will}
              benCount={benNum}
              guardCount={guardNum}
              inactDays={typeof inactWindow === "bigint" ? Number(inactWindow) : 365 * 86400}
              onSuccess={() => {
                setShowEdit(false);
                reads.refetch();
              }}
            />
          )}
        </AnimatePresence>

        {/* ── 3-card grid ──────────────────────────────────────────────────── */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid md:grid-cols-3 gap-5 mb-6"
        >
          {/* Card 1: LiveSignal */}
          <DashCard title="LiveSignal" icon="💚">
            <div className="space-y-4">
              {/* Days remaining — prominent */}
              <div className="text-center py-3 rounded-lg"
                   style={{ background: "var(--bg-elevated)" }}>
                <p className="text-3xl font-bold font-mono"
                   style={{ color: livenessPct >= 80 ? "var(--accent-danger)" : livenessPct >= 50 ? "var(--accent-warning)" : "var(--accent-success)" }}>
                  {daysLeft}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>days remaining</p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-muted)" }}>Inactivity used</span>
                  <span style={{ color: livenessPct >= 80 ? "var(--accent-danger)" : "var(--text-secondary)" }}>
                    {livenessPct}%
                  </span>
                </div>
                <LivenessBar pct={livenessPct} />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: "var(--text-muted)" }}>Last activity</span>
                  <span style={{ color: "var(--text-primary)" }}>{formatTimestamp(lastActivity as bigint)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--text-muted)" }}>Last check-in</span>
                  <span style={{ color: "var(--text-primary)" }}>{formatTimestamp(lastHeartbeat as bigint)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--text-muted)" }}>Days elapsed</span>
                  <span style={{ color: "var(--text-primary)" }}>{daysElapsed}d / {secondsToDays(typeof inactWindow === "bigint" ? inactWindow : undefined)}d</span>
                </div>
              </div>

              {willState === WillState.CONFIRMING && (
                <button
                  onClick={heartbeat}
                  disabled={isPending}
                  className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: "rgba(248,113,113,0.12)", color: "var(--accent-danger)", border: "1px solid rgba(248,113,113,0.3)" }}
                >
                  ⚠ Confirm I'm Alive
                </button>
              )}
            </div>
          </DashCard>

          {/* Card 2: Beneficiaries */}
          <DashCard title="Beneficiaries" icon="👥">
            <div className="space-y-3">
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>{benNum}</p>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>/ 10 protected</span>
              </div>

              {benNum > 0 && (
                <div className="space-y-2">
                  {Array.from({ length: benNum }).map((_, i) => {
                    const stored = meta?.beneficiaries[i];
                    return (
                      <div key={i}
                           className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                           style={{ background: "var(--bg-elevated)" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                               style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
                            {i + 1}
                          </div>
                          <span className="text-xs font-mono truncate"
                                style={{ color: "var(--text-secondary)" }}>
                            {stored ? maskEmail(stored.email) : "[encrypted]"}
                          </span>
                        </div>
                        <span className="text-xs font-semibold ml-2 shrink-0"
                              style={{ color: stored ? "var(--accent-primary)" : "var(--text-muted)" }}>
                          {stored ? `${stored.share}%` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Allocation bar */}
              {meta && meta.beneficiaries.length > 0 && (
                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Allocation breakdown</p>
                  <div className="flex rounded-full overflow-hidden h-2 gap-px">
                    {meta.beneficiaries.map((b, i) => {
                      const colors = [
                        "var(--accent-primary)", "#34D399", "#FBBF24", "#F87171", "#60A5FA",
                        "#A78BFA", "#34D399", "#FB923C", "#E879F9", "#22D3EE",
                      ];
                      return (
                        <div key={i} style={{ width: `${b.share}%`, background: colors[i % colors.length] }} />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {meta.beneficiaries.map((b, i) => {
                      const colors = [
                        "var(--accent-primary)", "#34D399", "#FBBF24", "#F87171", "#60A5FA",
                        "#A78BFA", "#34D399", "#FB923C", "#E879F9", "#22D3EE",
                      ];
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{b.share}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-1 flex items-center gap-1.5 text-xs"
                   style={{ color: "var(--text-muted)" }}>
                <span>🔒</span>
                <span>Identities encrypted on-chain</span>
              </div>
            </div>
          </DashCard>

          {/* Card 3: Guardians */}
          <DashCard title="Guardians" icon="🛡️">
            <div className="space-y-3">
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>{guardNum}</p>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>/ 3 trusted contacts</span>
              </div>

              {guardNum > 0 && (
                <div className="space-y-2">
                  {Array.from({ length: guardNum }).map((_, i) => {
                    const stored = meta?.guardians[i];
                    return (
                      <div key={i}
                           className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                           style={{ background: "var(--bg-elevated)" }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                             style={{ background: "var(--bg-overlay)", color: "var(--text-secondary)" }}>
                          {i + 1}
                        </div>
                        <span className="text-xs font-mono"
                              style={{ color: "var(--text-secondary)" }}>
                          {stored ? maskEmail(stored.email) : "[encrypted]"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {guardNum < 2 && (
                <p className="text-xs" style={{ color: "var(--accent-warning)" }}>
                  ⚠ Add {2 - guardNum} more guardian{2 - guardNum > 1 ? "s" : ""} for quorum
                </p>
              )}

              <div className="pt-1 text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
                <div className="flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Identities encrypted on-chain</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>✅</span>
                  <span>2-of-{Math.max(guardNum, 2)} quorum required to execute</span>
                </div>
              </div>
            </div>
          </DashCard>
        </motion.div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="flex gap-1 p-1 rounded-xl mb-5"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          {(["overview", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors"
              style={{
                background: activeTab === tab ? "var(--accent-primary)" : "transparent",
                color:      activeTab === tab ? "#fff" : "var(--text-muted)",
              }}
            >
              {tab === "overview" ? "💚 Check-in" : `📋 History${history.length > 0 ? ` (${history.length})` : ""}`}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── Overview tab ───────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl p-8 text-center"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <p className="text-xs font-mono font-medium uppercase tracking-widest mb-5"
                 style={{ color: "var(--text-muted)" }}>
                Monthly Check-in
              </p>

              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="pulse-ring" style={{ animationDelay: "0s" }} />
                <div className="pulse-ring" style={{ animationDelay: "0.5s" }} />
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={heartbeat}
                  disabled={isPending}
                  className="relative w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 text-white font-semibold disabled:opacity-50"
                  style={{ background: "var(--accent-primary)", boxShadow: "0 0 40px rgba(124,106,247,0.4)" }}
                >
                  <span className="text-2xl">{isPending ? "⏳" : "💚"}</span>
                  <span className="text-xs">{isPending ? "Confirming…" : "I'm here"}</span>
                </motion.button>
              </div>

              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Send Monthly Check-in
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Sign to prove you're still here. Resets the {windowLabel} inactivity clock.
              </p>

              {daysLeft <= 30 && daysLeft > 0 && (
                <p className="mt-4 text-sm font-semibold"
                   style={{ color: livenessPct >= 80 ? "var(--accent-danger)" : "var(--accent-warning)" }}>
                  ⚠ Only {daysLeft} days left — check in now!
                </p>
              )}
            </motion.div>
          )}

          {/* ── History tab ────────────────────────────────────────────────── */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl overflow-hidden"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="px-6 py-4"
                   style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <p className="text-xs font-mono font-medium uppercase tracking-widest"
                   style={{ color: "var(--text-muted)" }}>
                  Transaction History
                </p>
              </div>

              {historyLoading && (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 rounded-lg animate-pulse"
                         style={{ background: "var(--bg-elevated)" }} />
                  ))}
                </div>
              )}

              {!historyLoading && history.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No transactions found yet.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Activity will appear here after your first check-in.
                  </p>
                </div>
              )}

              {!historyLoading && history.length > 0 && (
                <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {history.map((entry, i) => {
                    const date = entry.timestamp
                      ? new Date(entry.timestamp * 1000).toLocaleString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })
                      : `Block ${entry.blockNumber.toString()}`;

                    return (
                      <div key={i} className="flex items-start gap-3 px-6 py-4">
                        {/* Icon bubble */}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5"
                             style={{ background: entry.tagBg }}>
                          {entry.emoji}
                        </div>

                        {/* Label + date + tag */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              {entry.label}
                            </p>
                            {/* Action tag */}
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                              style={{ background: entry.tagBg, color: entry.tagColor }}
                            >
                              {entry.tag}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            {date}
                          </p>
                        </div>

                        {/* Tx hash link */}
                        <a
                          href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
                          style={{
                            background: "var(--bg-elevated)",
                            color:      "var(--text-secondary)",
                            border:     "1px solid var(--border-subtle)",
                          }}
                          title={entry.txHash}
                        >
                          {entry.txHash.slice(0, 8)}…{entry.txHash.slice(-6)} ↗
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
