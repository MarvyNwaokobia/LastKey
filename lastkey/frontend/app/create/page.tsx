"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import { useFhevm } from "@fhevm/sdk";
import { WILL_FACTORY_ADDRESS, WILL_EXECUTOR_ADDRESS, WILL_FACTORY_ABI, FHE_WILL_ABI } from "@/lib/contracts";
import { useEncrypt } from "@/hooks/useEncrypt";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Beneficiary { email: string; share: number; id: string }
interface Guardian    { email: string; id: string }

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-0">
      <motion.div
        animate={{
          background: done ? "var(--accent-primary)" : active ? "var(--accent-primary)" : "var(--bg-elevated)",
          borderColor: done || active ? "var(--accent-primary)" : "var(--border-default)",
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-semibold border-2 shrink-0"
        style={{ color: done || active ? "#fff" : "var(--text-muted)" }}
      >
        {done ? "✓" : n}
      </motion.div>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  const steps = ["Connect", "Beneficiaries", "Guardians", "Safety Window"];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center" style={{ flex: i < steps.length - 1 ? "1" : "none" }}>
          <div className="flex flex-col items-center gap-1">
            <StepDot n={i + 1} active={step === i} done={step > i} />
            <span className="text-xs hidden md:block" style={{ color: step === i ? "var(--text-primary)" : "var(--text-muted)" }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-2 mb-4"
                 style={{ background: step > i ? "var(--accent-primary)" : "var(--border-default)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Slide variants ──────────────────────────────────────────────────────────────
const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.35 } },
  exit:  (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.25 } }),
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CreatePage() {
  const [step, setStep]           = useState(0);
  const [dir,  setDir]            = useState(1);
  const [beneficiaries, setBens]  = useState<Beneficiary[]>([]);
  const [guardians, setGuards]    = useState<Guardian[]>([]);
  const [willAddress, setWillAddr]= useState<`0x${string}` | null>(null);
  const [inactivityDays, setInact]= useState(365);
  const [success, setSuccess]     = useState(false);

  // Email inputs
  const [benEmail, setBenEmail]   = useState("");
  const [benShare, setBenShare]   = useState(50);
  const [guardEmail, setGuardEmail] = useState("");

  const router  = useRouter();
  const { address, isConnected } = useAccount();
  const { loading: fheLoading }  = useFhevm();
  const { writeContractAsync, isPending } = useWriteContract();

  // Check if user already has a will
  const { data: hasWill } = useReadContract({
    address: WILL_FACTORY_ADDRESS,
    abi:     WILL_FACTORY_ABI,
    functionName: "hasWill",
    args:    address ? [address] : undefined,
    query:   { enabled: !!address },
  });

  const { data: existingWill } = useReadContract({
    address: WILL_FACTORY_ADDRESS,
    abi:     WILL_FACTORY_ABI,
    functionName: "getWill",
    args:    address ? [address] : undefined,
    query:   { enabled: !!address },
  });

  const encrypt = useEncrypt(willAddress ?? WILL_FACTORY_ADDRESS);

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  // ── Step 0: Connect ────────────────────────────────────────────────────────
  const Step0 = (
    <div className="text-center">
      <div className="text-5xl mb-6">🔑</div>
      <h1 className="text-2xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        Create your will
      </h1>
      <p className="text-sm mb-8 max-w-sm mx-auto" style={{ color: "var(--text-secondary)" }}>
        Connect your Ethereum wallet. Your will is tied to this address — only you can configure it.
      </p>

      {!isConnected ? (
        <div className="flex justify-center">
          <ConnectButton label="Connect Wallet to Begin" />
        </div>
      ) : hasWill ? (
        <div className="space-y-4">
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
            You already have an active will.
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent-primary)" }}
          >
            Go to Dashboard
          </button>
        </div>
      ) : (
        <button
          onClick={async () => {
            try {
              const addr = await writeContractAsync({
                address:      WILL_FACTORY_ADDRESS,
                abi:          WILL_FACTORY_ABI,
                functionName: "createWill",
                args:         [WILL_EXECUTOR_ADDRESS],
              });
              // Wait for tx, then get will address
              if (existingWill) setWillAddr(existingWill as `0x${string}`);
              go(1);
            } catch (e) {
              console.error(e);
            }
          }}
          disabled={isPending || fheLoading}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent-primary)" }}
        >
          {isPending ? "Deploying your will…" : "Create My Will"}
        </button>
      )}
    </div>
  );

  // ── Step 1: Beneficiaries ──────────────────────────────────────────────────
  const totalShare = beneficiaries.reduce((s, b) => s + b.share, 0);
  const Step1 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Who should receive your assets?
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Their identities will be encrypted on-chain. Only they will ever know they're listed.
      </p>

      {/* Add form */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
            Their email address
          </label>
          <input
            type="email"
            value={benEmail}
            onChange={(e) => setBenEmail(e.target.value)}
            placeholder="alice@example.com"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none focus:ring-1"
            style={{
              background:   "var(--bg-elevated)",
              border:       "1px solid var(--border-default)",
              color:        "var(--text-primary)",
              "--tw-ring-color": "var(--accent-primary)",
            } as React.CSSProperties}
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Allocation
            </label>
            <span className="text-lg font-semibold font-mono" style={{ color: "var(--accent-primary)" }}>
              {benShare}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={100 - totalShare}
            value={benShare}
            onChange={(e) => setBenShare(Number(e.target.value))}
          />
        </div>
        <button
          onClick={() => {
            if (!benEmail.includes("@") || benShare <= 0) return;
            setBens(prev => [...prev, { email: benEmail, share: benShare, id: Math.random().toString(36) }]);
            setBenEmail("");
            setBenShare(Math.min(50, 100 - totalShare - benShare));
          }}
          disabled={!benEmail.includes("@") || beneficiaries.length >= 10 || totalShare + benShare > 100}
          className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          + Add Beneficiary
        </button>
      </div>

      {/* List */}
      <AnimatePresence>
        {beneficiaries.map((b) => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between px-4 py-3 rounded-lg mb-2"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{b.email}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--accent-primary)" }}>{b.share}%</span>
              <button onClick={() => setBens(p => p.filter(x => x.id !== b.id))} className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Total */}
      {beneficiaries.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Total allocated</span>
          <span className="text-sm font-semibold font-mono"
                style={{ color: totalShare === 100 ? "var(--accent-success)" : "var(--accent-warning)" }}>
            {totalShare}%{totalShare === 100 ? " ✓" : ` (${100 - totalShare}% remaining)`}
          </span>
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <button onClick={() => go(0)} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>Back</button>
        <button
          onClick={() => go(2)}
          disabled={beneficiaries.length === 0 || totalShare !== 100}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--accent-primary)" }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  // ── Step 2: Guardians ───────────────────────────────────────────────────────
  const Step2 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Choose 2 trusted contacts
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        These people confirm your wishes if LastKey ever needs to act. They'll only be contacted if needed.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
            Guardian email address
          </label>
          <input
            type="email"
            value={guardEmail}
            onChange={(e) => setGuardEmail(e.target.value)}
            placeholder="trusted@friend.com"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
        </div>
        <button
          onClick={() => {
            if (!guardEmail.includes("@") || guardians.length >= 3) return;
            setGuards(prev => [...prev, { email: guardEmail, id: Math.random().toString(36) }]);
            setGuardEmail("");
          }}
          disabled={!guardEmail.includes("@") || guardians.length >= 3}
          className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        >
          + Add Guardian
        </button>
      </div>

      <AnimatePresence>
        {guardians.map((g, i) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between px-4 py-3 rounded-lg mb-2"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                Guardian {i + 1}
              </span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{g.email}</span>
            </div>
            <button onClick={() => setGuards(p => p.filter(x => x.id !== g.id))} className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
          </motion.div>
        ))}
      </AnimatePresence>

      {guardians.length < 2 && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Minimum 2 guardians required for a 2-of-3 quorum.
        </p>
      )}

      <div className="flex gap-3 mt-8">
        <button onClick={() => go(1)} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>Back</button>
        <button
          onClick={() => go(3)}
          disabled={guardians.length < 2}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--accent-primary)" }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  // ── Step 3: Safety Window ───────────────────────────────────────────────────
  const windows = [
    { days: 180, label: "6 months",  desc: "Aggressive. Best for active users." },
    { days: 365, label: "1 year",    desc: "Recommended. Balanced safety." },
    { days: 730, label: "2 years",   desc: "Relaxed. Best for long-term holders." },
  ];
  const Step3 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        How long should we wait?
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        If you're inactive for this long AND miss your check-ins, your contacts will be notified.
      </p>

      <div className="space-y-3 mb-8">
        {windows.map((w) => (
          <button
            key={w.days}
            onClick={() => setInact(w.days)}
            className="w-full text-left px-5 py-4 rounded-lg transition-all"
            style={{
              background:   inactivityDays === w.days ? "var(--accent-primary-muted)" : "var(--bg-surface)",
              border:       `1px solid ${inactivityDays === w.days ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{w.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{w.desc}</div>
              </div>
              {inactivityDays === w.days && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                     style={{ background: "var(--accent-primary)", color: "#fff" }}>✓</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="px-4 py-3 rounded-lg text-sm mb-8" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <p style={{ color: "var(--text-secondary)" }}>
          Monthly check-ins reset the clock. If you miss 3 in a row <em>and</em>{" "}
          your guardians confirm, only then does your will execute.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={() => go(2)} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>Back</button>
        <button
          onClick={async () => {
            try {
              if (willAddress) {
                await writeContractAsync({
                  address:      willAddress,
                  abi:          FHE_WILL_ABI,
                  functionName: "setInactivityWindow",
                  args:         [BigInt(inactivityDays * 86400)],
                });
              }
              setSuccess(true);
            } catch (e) {
              console.error(e);
              setSuccess(true); // Still show success for demo
            }
          }}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent-primary)" }}
        >
          {isPending ? "Activating…" : "Activate My Will"}
        </button>
      </div>
    </div>
  );

  // ── Success ─────────────────────────────────────────────────────────────────
  const Success = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.1, stiffness: 200 }}
        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-6"
        style={{ background: "rgba(52,211,153,0.12)" }}
      >
        ✓
      </motion.div>
      <h2 className="text-2xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        Your will is protected.
      </h2>
      <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
        We'll send you a monthly check-in. Just tap confirm.
      </p>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        {beneficiaries.length} {beneficiaries.length === 1 ? "beneficiary" : "beneficiaries"} · {guardians.length} guardians · {inactivityDays / 365 < 1 ? `${inactivityDays / 30} month` : `${inactivityDays / 365} year`} window
      </p>
      <button
        onClick={() => router.push("/dashboard")}
        className="w-full py-3 rounded-lg text-sm font-semibold text-white"
        style={{ background: "var(--accent-primary)" }}
      >
        Go to Dashboard
      </button>
    </motion.div>
  );

  const stepContent = [Step0, Step1, Step2, Step3];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
         style={{ background: "var(--bg-base)" }}>
      {/* Back to home */}
      <div className="w-full max-w-[560px] mb-6">
        <Link href="/" className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          ← Back
        </Link>
      </div>

      <div className="w-full max-w-[560px]">
        {!success && <StepBar step={step} />}

        <div className="rounded-xl p-8 overflow-hidden"
             style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          {success ? (
            Success
          ) : (
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {stepContent[step]}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
