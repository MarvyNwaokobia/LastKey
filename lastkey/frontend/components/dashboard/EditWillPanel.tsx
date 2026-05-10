"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWriteContract, useConfig } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { keccak256, toBytes, toHex, maxUint256 } from "viem";
import { encryptBatch } from "@fhevm/sdk";
import { FHE_WILL_ABI, WILL_EXECUTOR_ADDRESS, ERC20_ABI, ERC721_ABI } from "@/lib/contracts";
import { useWalletAssets } from "@/hooks/useWalletAssets";

interface Props {
  willAddr:     `0x${string}`;
  benCount:     number;
  guardCount:   number;
  inactDays:    number;        // current inactivity window in days
  onSuccess?:   () => void;   // called after any successful tx
}

type Section = "beneficiary" | "guardian" | "window" | "assets" | null;

function SectionHeader({
  id, open, onClick, label, subtitle, icon, disabled, disabledReason,
}: {
  id: Section; open: boolean; onClick: () => void;
  label: string; subtitle: string; icon: string;
  disabled?: boolean; disabledReason?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left"
      style={{
        cursor:     disabled ? "not-allowed" : "pointer",
        opacity:    disabled ? 0.45 : 1,
        borderBottom: open ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {disabled ? disabledReason : subtitle}
          </p>
        </div>
      </div>
      {!disabled && (
        <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
          {open ? "▲" : "▼"}
        </span>
      )}
    </button>
  );
}

// ── Individual sections ────────────────────────────────────────────────────────

function AddBeneficiarySection({
  willAddr, onSuccess,
}: { willAddr: `0x${string}`; onSuccess?: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const [email, setEmail] = useState("");
  const [share, setShare] = useState(10);
  const [status, setStatus] = useState<"idle" | "encrypting" | "signing" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit() {
    if (!address || !email.includes("@") || share <= 0) return;
    setStatus("encrypting");
    setErrMsg(null);
    try {
      const enc = await encryptBatch([
        { type: "uint256", value: BigInt(keccak256(toBytes(email))) },
        { type: "uint32",  value: BigInt(share * 100) },
        { type: "address", value: "0x0000000000000000000000000000000000000000" },
      ], willAddr, address);

      setStatus("signing");
      const hash = await writeContractAsync({
        address:      willAddr,
        abi:          FHE_WILL_ABI,
        functionName: "addBeneficiary",
        args: [
          toHex(enc.handles[0], { size: 32 }) as `0x${string}`,
          toHex(enc.handles[1], { size: 32 }) as `0x${string}`,
          toHex(enc.handles[2], { size: 32 }) as `0x${string}`,
          toHex(enc.inputProof) as `0x${string}`,
        ],
      });
      await waitForTransactionReceipt(config, { hash });
      setStatus("done");
      setEmail("");
      onSuccess?.();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed");
      setStatus("error");
    }
  }

  return (
    <div className="px-5 pb-5 pt-2 space-y-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Their email is encrypted on-chain — only they will ever know they're listed.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="newbeneficiary@example.com"
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
      />
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: "var(--text-muted)" }}>Allocation</span>
          <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{share}%</span>
        </div>
        <input type="range" min={1} max={100} value={share}
               onChange={(e) => setShare(Number(e.target.value))} className="w-full" />
      </div>
      {status === "done" && (
        <p className="text-xs" style={{ color: "var(--accent-success)" }}>✓ Beneficiary added successfully</p>
      )}
      {status === "error" && (
        <p className="text-xs" style={{ color: "var(--accent-danger)" }}>{errMsg}</p>
      )}
      <button
        onClick={submit}
        disabled={!email.includes("@") || status === "encrypting" || status === "signing"}
        className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent-primary)" }}
      >
        {status === "encrypting" ? "Encrypting…"
         : status === "signing"  ? "Sign wallet…"
         : "Add Beneficiary"}
      </button>
    </div>
  );
}

function AddGuardianSection({
  willAddr, onSuccess,
}: { willAddr: `0x${string}`; onSuccess?: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "encrypting" | "signing" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit() {
    if (!address || !email.includes("@")) return;
    setStatus("encrypting");
    setErrMsg(null);
    try {
      const enc = await encryptBatch([
        { type: "uint256", value: BigInt(keccak256(toBytes(email))) },
      ], willAddr, address);

      setStatus("signing");
      const hash = await writeContractAsync({
        address:      willAddr,
        abi:          FHE_WILL_ABI,
        functionName: "addGuardian",
        args: [
          toHex(enc.handles[0], { size: 32 }) as `0x${string}`,
          toHex(enc.inputProof) as `0x${string}`,
        ],
      });
      await waitForTransactionReceipt(config, { hash });
      setStatus("done");
      setEmail("");
      onSuccess?.();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed");
      setStatus("error");
    }
  }

  return (
    <div className="px-5 pb-5 pt-2 space-y-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Guardian email is encrypted on-chain. They'll only be contacted if execution is triggered.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="guardian@example.com"
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
      />
      {status === "done" && (
        <p className="text-xs" style={{ color: "var(--accent-success)" }}>✓ Guardian added successfully</p>
      )}
      {status === "error" && (
        <p className="text-xs" style={{ color: "var(--accent-danger)" }}>{errMsg}</p>
      )}
      <button
        onClick={submit}
        disabled={!email.includes("@") || status === "encrypting" || status === "signing"}
        className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent-primary)" }}
      >
        {status === "encrypting" ? "Encrypting…"
         : status === "signing"  ? "Sign wallet…"
         : "Add Guardian"}
      </button>
    </div>
  );
}

function UpdateWindowSection({
  willAddr, currentDays, onSuccess,
}: { willAddr: `0x${string}`; currentDays: number; onSuccess?: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const windows = [
    { days: 180, label: "6 months", desc: "Aggressive. Best for active users." },
    { days: 365, label: "1 year",   desc: "Recommended. Balanced safety." },
    { days: 730, label: "2 years",  desc: "Relaxed. Best for long-term holders." },
  ];
  const [selected, setSelected] = useState(currentDays);
  const [status, setStatus] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit() {
    setStatus("signing");
    setErrMsg(null);
    try {
      const hash = await writeContractAsync({
        address:      willAddr,
        abi:          FHE_WILL_ABI,
        functionName: "setInactivityWindow",
        args:         [BigInt(selected * 86400)],
      });
      await waitForTransactionReceipt(config, { hash });
      setStatus("done");
      onSuccess?.();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed");
      setStatus("error");
    }
  }

  return (
    <div className="px-5 pb-5 pt-2 space-y-3">
      {windows.map((w) => (
        <button
          key={w.days}
          onClick={() => setSelected(w.days)}
          className="w-full text-left px-4 py-3 rounded-lg transition-all"
          style={{
            background: selected === w.days ? "var(--accent-primary-muted)" : "var(--bg-base)",
            border: `1px solid ${selected === w.days ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{w.label}</span>
              {currentDays === w.days && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>current</span>
              )}
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{w.desc}</p>
            </div>
            {selected === w.days && (
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs"
                   style={{ background: "var(--accent-primary)", color: "#fff" }}>✓</div>
            )}
          </div>
        </button>
      ))}
      {status === "done" && (
        <p className="text-xs" style={{ color: "var(--accent-success)" }}>✓ Inactivity window updated</p>
      )}
      {status === "error" && (
        <p className="text-xs" style={{ color: "var(--accent-danger)" }}>{errMsg}</p>
      )}
      <button
        onClick={submit}
        disabled={selected === currentDays || status === "signing"}
        className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent-primary)" }}
      >
        {status === "signing" ? "Sign wallet…" : "Update Window"}
      </button>
    </div>
  );
}

function ManageAssetsSection() {
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const { tokens, nfts, loading } = useWalletAssets();
  const [approving, setApproving] = useState<string | null>(null);
  const [approved, setApproved]   = useState<Record<string, boolean>>({});

  const nftContracts = [...new Map(nfts.map(n => [n.contractAddress, n])).values()];

  async function approveToken(addr: `0x${string}`, symbol: string) {
    setApproving(symbol);
    try {
      const hash = await writeContractAsync({
        address: addr, abi: ERC20_ABI,
        functionName: "approve",
        args: [WILL_EXECUTOR_ADDRESS, maxUint256],
      });
      await waitForTransactionReceipt(config, { hash });
      setApproved(p => ({ ...p, [symbol]: true }));
    } catch {}
    setApproving(null);
  }

  async function approveNFT(addr: `0x${string}`, name: string) {
    setApproving(addr);
    try {
      const hash = await writeContractAsync({
        address: addr, abi: ERC721_ABI,
        functionName: "setApprovalForAll",
        args: [WILL_EXECUTOR_ADDRESS, true],
      });
      await waitForTransactionReceipt(config, { hash });
      setApproved(p => ({ ...p, [addr]: true }));
    } catch {}
    setApproving(null);
  }

  return (
    <div className="px-5 pb-5 pt-2 space-y-4">
      {loading && (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--bg-base)" }} />)}
        </div>
      )}

      {!loading && tokens.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>ERC-20 Tokens</p>
          <div className="space-y-2">
            {tokens.map(t => (
              <div key={t.address} className="flex items-center justify-between px-3 py-2 rounded-lg"
                   style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  {t.logo
                    ? <img src={t.logo} alt={t.symbol} className="w-6 h-6 rounded-full" />
                    : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                           style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
                        {t.symbol.slice(0, 2)}
                      </div>
                  }
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{t.symbol}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t.balance}</p>
                  </div>
                </div>
                {approved[t.symbol] ? (
                  <span className="text-xs" style={{ color: "var(--accent-success)" }}>Approved ✓</span>
                ) : (
                  <button
                    onClick={() => approveToken(t.address, t.symbol)}
                    disabled={approving !== null}
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    {approving === t.symbol ? "…" : "Approve"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && nftContracts.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>NFT Collections</p>
          <div className="space-y-2">
            {nftContracts.map(n => (
              <div key={n.contractAddress} className="flex items-center justify-between px-3 py-2 rounded-lg"
                   style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{n.collection}</p>
                  <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {n.contractAddress.slice(0, 10)}…
                  </p>
                </div>
                {approved[n.contractAddress] ? (
                  <span className="text-xs" style={{ color: "var(--accent-success)" }}>Approved ✓</span>
                ) : (
                  <button
                    onClick={() => approveNFT(n.contractAddress, n.collection)}
                    disabled={approving !== null}
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    {approving === n.contractAddress ? "…" : "Approve All"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tokens.length === 0 && nftContracts.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
          No assets found in this wallet.
        </p>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function EditWillPanel({ willAddr, benCount, guardCount, inactDays, onSuccess }: Props) {
  const [open, setOpen] = useState<Section>(null);

  function toggle(section: Section) {
    setOpen(prev => prev === section ? null : section);
  }

  const benFull   = benCount >= 10;
  const guardFull = guardCount >= 3;
  const inactDaysFromWindow = Math.round(inactDays / 86400);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl overflow-hidden mb-6"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      {/* Panel header */}
      <div className="px-5 py-4 flex items-center justify-between"
           style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Edit Will</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Beneficiary and guardian entries are append-only (FHE-encrypted). Inactivity window and asset approvals can be updated at any time.
          </p>
        </div>
      </div>

      {/* Section: Add Beneficiary */}
      <SectionHeader
        id="beneficiary" open={open === "beneficiary"} onClick={() => toggle("beneficiary")}
        icon="👥" label="Add Beneficiary"
        subtitle={`${benCount}/10 slots used — add a new protected beneficiary`}
        disabled={benFull} disabledReason="Maximum 10 beneficiaries reached"
      />
      <AnimatePresence>
        {open === "beneficiary" && !benFull && (
          <motion.div key="ben" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", borderBottom: "1px solid var(--border-subtle)" }}>
            <AddBeneficiarySection willAddr={willAddr} onSuccess={onSuccess} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section: Add Guardian */}
      <SectionHeader
        id="guardian" open={open === "guardian"} onClick={() => toggle("guardian")}
        icon="🛡️" label="Add Guardian"
        subtitle={`${guardCount}/3 slots used — add a new trusted contact`}
        disabled={guardFull} disabledReason="Maximum 3 guardians reached"
      />
      <AnimatePresence>
        {open === "guardian" && !guardFull && (
          <motion.div key="guard" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", borderBottom: "1px solid var(--border-subtle)" }}>
            <AddGuardianSection willAddr={willAddr} onSuccess={onSuccess} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section: Update Inactivity Window */}
      <SectionHeader
        id="window" open={open === "window"} onClick={() => toggle("window")}
        icon="⏱️" label="Update Inactivity Window"
        subtitle="Change how long before your will can be triggered"
      />
      <AnimatePresence>
        {open === "window" && (
          <motion.div key="win" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", borderBottom: "1px solid var(--border-subtle)" }}>
            <UpdateWindowSection willAddr={willAddr} currentDays={inactDaysFromWindow} onSuccess={onSuccess} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section: Manage Assets */}
      <SectionHeader
        id="assets" open={open === "assets"} onClick={() => toggle("assets")}
        icon="🏦" label="Manage Asset Approvals"
        subtitle="Approve or revoke executor access to your tokens and NFTs"
      />
      <AnimatePresence>
        {open === "assets" && (
          <motion.div key="assets" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <ManageAssetsSection />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
