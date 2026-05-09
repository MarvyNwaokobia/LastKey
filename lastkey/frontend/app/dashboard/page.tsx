"use client";
import { motion } from "framer-motion";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import {
  WILL_FACTORY_ADDRESS, WILL_FACTORY_ABI, FHE_WILL_ABI,
  formatWillState, formatTimestamp, secondsToDays, shortenAddress, WillState,
} from "@/lib/contracts";

// ── Stagger animation ──────────────────────────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const card = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

// ── Card shell ─────────────────────────────────────────────────────────────────
function DashCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={card}
      className="rounded-xl p-6"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-xs font-mono font-medium uppercase tracking-widest mb-5"
         style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      {children}
    </motion.div>
  );
}

// ── Liveness progress bar ──────────────────────────────────────────────────────
function LivenessBar({ pct, state }: { pct: number; state: number }) {
  const cls = pct >= 90 ? "danger" : pct >= 60 ? "warning" : "";
  return (
    <div className="progress-track mt-3">
      <motion.div
        className={`progress-fill ${cls}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(pct, 100)}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

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

  // 2. Read will state
  const reads = useReadContracts({
    contracts: !will ? [] : [
      { address: will, abi: FHE_WILL_ABI, functionName: "state" },
      { address: will, abi: FHE_WILL_ABI, functionName: "beneficiaryCount" },
      { address: will, abi: FHE_WILL_ABI, functionName: "guardianCount" },
      { address: will, abi: FHE_WILL_ABI, functionName: "guardianConfirmCount" },
      { address: will, abi: FHE_WILL_ABI, functionName: "lastActivityTimestamp" },
      { address: will, abi: FHE_WILL_ABI, functionName: "lastHeartbeatTimestamp" },
      { address: will, abi: FHE_WILL_ABI, functionName: "inactivityWindow" },
      { address: will, abi: FHE_WILL_ABI, functionName: "heartbeatInterval" },
    ],
    query: { enabled: !!will, refetchInterval: 30_000 },
  });

  const [stateVal, benCount, guardCount, confirmCount, lastActivity, lastHeartbeat, inactWindow, heartbeatInt] =
    reads.data?.map((r) => r.result) ?? [];

  const willState     = typeof stateVal  === "number" ? stateVal : 0;
  const benNum        = typeof benCount  === "number" ? benCount : 0;
  const guardNum      = typeof guardCount=== "number" ? guardCount : 0;
  const stateInfo     = formatWillState(willState);

  // Liveness %
  const now           = BigInt(Math.floor(Date.now() / 1000));
  const elapsed       = lastActivity && inactWindow
    ? Number(now - (lastActivity as bigint)) : 0;
  const window_       = inactWindow ? Number(inactWindow as bigint) : 1;
  const livenessPct   = Math.round((elapsed / window_) * 100);

  // Days until trigger
  const daysLeft      = Math.max(0, secondsToDays(typeof inactWindow === 'bigint' ? inactWindow : undefined) - Math.floor(elapsed / 86400));

  async function heartbeat() {
    if (!will) return;
    await writeContractAsync({
      address:      will,
      abi:          FHE_WILL_ABI,
      functionName: "submitHeartbeat",
      args:         ["0x01"], // mock attestation bytes
    });
  }

  // ── Not connected ────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
           style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="text-center">
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
    );
  }

  // ── No will ──────────────────────────────────────────────────────────────────
  if (will === "0x0000000000000000000000000000000000000000" || !will) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
           style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="text-center">
          <div className="text-4xl mb-6">📜</div>
          <h1 className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            You don't have a will yet
          </h1>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent-primary)" }}
          >
            Create Your Will
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16" style={{ background: "var(--bg-base)" }}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-start justify-between flex-wrap gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Your LastKey
            </h1>
            <p className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>
              {will ? shortenAddress(will) : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 rounded-full text-xs font-mono font-semibold"
              style={{
                background: stateInfo.color === "success" ? "rgba(52,211,153,0.12)"
                          : stateInfo.color === "warning" ? "rgba(251,191,36,0.12)"
                          : "var(--bg-elevated)",
                color:  stateInfo.color === "success" ? "var(--accent-success)"
                      : stateInfo.color === "warning" ? "var(--accent-warning)"
                      : "var(--text-muted)",
              }}
            >
              ● {stateInfo.label}
            </span>
            {willState === WillState.CONFIRMING && (
              <span className="px-3 py-1 rounded-full text-xs" style={{ background: "rgba(248,113,113,0.12)", color: "var(--accent-danger)" }}>
                ⚠ Action needed
              </span>
            )}
          </div>
        </motion.div>

        {/* Three cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid md:grid-cols-3 gap-5 mb-8"
        >
          {/* Card 1: Liveness */}
          <DashCard title="Liveness Status">
            <div className="space-y-4">
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last activity detected</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {formatTimestamp(lastActivity as bigint)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last check-in</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {formatTimestamp(lastHeartbeat as bigint)}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-muted)" }}>Inactivity window</span>
                  <span style={{ color: livenessPct >= 80 ? "var(--accent-danger)" : "var(--text-secondary)" }}>
                    {livenessPct}%
                  </span>
                </div>
                <LivenessBar pct={livenessPct} state={willState} />
              </div>
              {willState === WillState.CONFIRMING && (
                <div className="pt-2">
                  <p className="text-xs mb-3" style={{ color: "var(--accent-danger)" }}>
                    ⚠ Your will may execute in {daysLeft} days
                  </p>
                  <button
                    onClick={heartbeat}
                    disabled={isPending}
                    className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: "rgba(248,113,113,0.12)", color: "var(--accent-danger)", border: "1px solid rgba(248,113,113,0.3)" }}
                  >
                    Confirm I'm Alive
                  </button>
                </div>
              )}
            </div>
          </DashCard>

          {/* Card 2: Beneficiaries */}
          <DashCard title="Beneficiaries">
            <div className="space-y-4">
              <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {benNum}
                <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                  / 10 protected
                </span>
              </p>

              {benNum > 0 && (
                <div className="space-y-2">
                  {Array.from({ length: benNum }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg"
                         style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                             style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
                          {i + 1}
                        </div>
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          [encrypted]
                        </span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        —
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {benNum < 10 && (
                <Link href="/create" className="block text-center py-2 rounded-lg text-xs font-medium"
                      style={{ border: "1px dashed var(--border-default)", color: "var(--text-muted)" }}>
                  + Add Beneficiary
                </Link>
              )}
            </div>
          </DashCard>

          {/* Card 3: Guardians */}
          <DashCard title="Guardians">
            <div className="space-y-4">
              <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {guardNum}
                <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                  / 3 added
                </span>
              </p>

              {guardNum > 0 && (
                <div className="space-y-2">
                  {Array.from({ length: guardNum }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                         style={{ background: "var(--bg-elevated)" }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                           style={{ background: "var(--bg-overlay)", color: "var(--text-secondary)" }}>
                        {i + 1}
                      </div>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        [encrypted]
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {guardNum < 2 && (
                <p className="text-xs" style={{ color: "var(--accent-warning)" }}>
                  ⚠ Add {2 - guardNum} more guardian{2 - guardNum > 1 ? "s" : ""} for quorum
                </p>
              )}

              {guardNum < 3 && (
                <Link href="/create" className="block text-center py-2 rounded-lg text-xs font-medium"
                      style={{ border: "1px dashed var(--border-default)", color: "var(--text-muted)" }}>
                  + Add Guardian
                </Link>
              )}
            </div>
          </DashCard>
        </motion.div>

        {/* Heartbeat button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-xs font-mono font-medium uppercase tracking-widest mb-5"
             style={{ color: "var(--text-muted)" }}>
            Monthly Check-in
          </p>
          <div className="relative inline-flex items-center justify-center mb-6">
            {/* Pulse rings */}
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
            Sign to confirm you're still here. Takes 2 seconds.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
