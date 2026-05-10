"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useConfig } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { keccak256, toBytes, toHex, maxUint256 } from "viem";
import { useFhevm, encryptBatch } from "@fhevm/sdk";
import Navbar from "@/components/layout/Navbar";
import {
  WILL_FACTORY_ADDRESS, WILL_FACTORY_ABI,
  FHE_WILL_ABI, WILL_EXECUTOR_ADDRESS,
  ERC20_ABI, ERC721_ABI,
} from "@/lib/contracts";
import { saveWillMeta } from "@/lib/willStorage";
import { useWalletAssets, type TokenAsset, type NFTAsset } from "@/hooks/useWalletAssets";

// ── Local types ────────────────────────────────────────────────────────────────
interface Beneficiary { email: string; share: number; id: string }
interface Guardian    { email: string; id: string }
type Phase = "form" | "deploying" | "done";

interface TxStep {
  label:  string;
  status: "pending" | "running" | "done" | "error";
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <motion.div
      animate={{
        background: done || active ? "var(--accent-primary)" : "var(--bg-elevated)",
        borderColor: done || active ? "var(--accent-primary)" : "var(--border-default)",
      }}
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-semibold border-2 shrink-0"
      style={{ color: done || active ? "#fff" : "var(--text-muted)" }}
    >
      {done ? "✓" : n}
    </motion.div>
  );
}

function StepBar({ step }: { step: number }) {
  const steps = ["Beneficiaries", "Assets", "Guardians", "Safety Window"];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center" style={{ flex: i < steps.length - 1 ? "1" : "none" }}>
          <div className="flex flex-col items-center gap-1">
            <StepDot n={i + 1} active={step === i} done={step > i} />
            <span className="text-xs hidden md:block"
                  style={{ color: step === i ? "var(--text-primary)" : "var(--text-muted)" }}>
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

const slide = {
  enter:  (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.35 } },
  exit:   (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.25 } }),
};

// ── TxStep row ─────────────────────────────────────────────────────────────────
function TxRow({ s }: { s: TxStep }) {
  const icon =
    s.status === "done"    ? "✓" :
    s.status === "running" ? "…" :
    s.status === "error"   ? "✕" : "○";

  const bg =
    s.status === "done"    ? "rgba(52,211,153,0.15)" :
    s.status === "running" ? "var(--accent-primary-muted)" :
    s.status === "error"   ? "rgba(248,113,113,0.15)" :
    "var(--bg-overlay)";

  const fg =
    s.status === "done"    ? "var(--accent-success)" :
    s.status === "running" ? "var(--accent-primary)" :
    s.status === "error"   ? "var(--accent-danger)" :
    "var(--text-muted)";

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg"
         style={{ background: "var(--bg-elevated)" }}>
      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs"
           style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <span className="text-sm flex-1"
            style={{ color: s.status === "pending" ? "var(--text-muted)" : s.status === "error" ? "var(--accent-danger)" : "var(--text-primary)" }}>
        {s.label}
      </span>
      {s.status === "running" && (
        <span className="text-xs animate-pulse" style={{ color: "var(--accent-primary)" }}>
          Sign wallet…
        </span>
      )}
    </div>
  );
}

// ── Asset checkbox row ─────────────────────────────────────────────────────────
function AssetRow({
  selected, onToggle, children,
}: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
      style={{
        background: selected ? "var(--accent-primary-muted)" : "var(--bg-elevated)",
        border:     `1px solid ${selected ? "rgba(124,106,247,0.4)" : "transparent"}`,
      }}
    >
      <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
           style={{
             background:   selected ? "var(--accent-primary)" : "transparent",
             borderColor:  selected ? "var(--accent-primary)" : "var(--border-default)",
           }}>
        {selected && <span className="text-white text-xs leading-none">✓</span>}
      </div>
      {children}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CreatePage() {
  const [step, setStep]             = useState(0);
  const [dir,  setDir]              = useState(1);
  const [phase, setPhase]           = useState<Phase>("form");

  // Step 0 – beneficiaries
  const [beneficiaries, setBens]    = useState<Beneficiary[]>([]);
  const [benEmail, setBenEmail]     = useState("");
  const [benShare, setBenShare]     = useState(50);

  // Step 1 – assets
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const [selectedNFTIds,   setSelectedNFTIds]   = useState<Set<string>>(new Set());
  const [assetTab, setAssetTab]     = useState<"tokens" | "nfts">("tokens");

  // Step 2 – guardians
  const [guardians, setGuards]      = useState<Guardian[]>([]);
  const [guardEmail, setGuardEmail] = useState("");

  // Step 3 – safety window
  const [inactivityDays, setInact]  = useState(365);

  // Deploy state
  const [txSteps, setTxSteps]         = useState<TxStep[]>([]);
  const [deployError, setDeployError]  = useState<string | null>(null);
  const [willAddress, setWillAddress]  = useState<`0x${string}` | null>(null);
  const [deployTxHash, setDeployTxHash]= useState<`0x${string}` | null>(null);

  const router = useRouter();
  const { address, isConnected }    = useAccount();
  const { loading: fheLoading }     = useFhevm();
  const { writeContractAsync }      = useWriteContract();
  const config                      = useConfig();

  const { tokens, nfts, loading: assetsLoading, error: assetsError } = useWalletAssets();

  const totalShare = beneficiaries.reduce((s, b) => s + b.share, 0);

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  // ── Asset selection helpers ────────────────────────────────────────────────
  function toggleToken(addr: string) {
    setSelectedTokenIds(prev => {
      const next = new Set(prev);
      next.has(addr) ? next.delete(addr) : next.add(addr);
      return next;
    });
  }

  function toggleNFT(id: string) {
    setSelectedNFTIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allSelected =
    tokens.length > 0 && selectedTokenIds.size === tokens.length &&
    (nfts.length === 0 || selectedNFTIds.size === nfts.length);

  function toggleAll() {
    if (allSelected) {
      setSelectedTokenIds(new Set());
      setSelectedNFTIds(new Set());
    } else {
      setSelectedTokenIds(new Set(tokens.map(t => t.address)));
      setSelectedNFTIds(new Set(nfts.map(n => `${n.contractAddress}_${n.tokenId}`)));
    }
  }

  // ── Build selected asset lists for deploy ──────────────────────────────────
  function selectedTokens(): TokenAsset[] {
    return tokens.filter(t => selectedTokenIds.has(t.address));
  }

  function selectedNFTContracts(): `0x${string}`[] {
    // unique collection addresses from selected NFTs
    const addrs = new Set<`0x${string}`>();
    for (const id of selectedNFTIds) {
      const addr = id.split("_")[0] as `0x${string}`;
      addrs.add(addr);
    }
    return [...addrs];
  }

  // ── Deploy flow ────────────────────────────────────────────────────────────
  function updateTxStep(i: number, status: TxStep["status"]) {
    setTxSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status } : s));
  }

  async function deployWill() {
    if (!address) return;

    const selTokens   = selectedTokens();
    const selNFTAddrs = selectedNFTContracts();

    const steps: TxStep[] = [
      { label: "Deploy will contract",         status: "pending" },
      ...beneficiaries.map((_, i) => ({ label: `Encrypt + add beneficiary ${i + 1}`, status: "pending" as const })),
      ...guardians.map((_, i)     => ({ label: `Encrypt + add guardian ${i + 1}`,    status: "pending" as const })),
      { label: "Set inactivity window",        status: "pending" },
      ...selTokens.map(t            => ({ label: `Approve ${t.symbol} spending`,      status: "pending" as const })),
      ...selNFTAddrs.map((addr)     => ({ label: `Approve NFT collection ${addr.slice(0, 8)}…`, status: "pending" as const })),
    ];

    setTxSteps(steps);
    setDeployError(null);
    setPhase("deploying");

    let cursor = 0;

    try {
      // ── 1. createWill (idempotent — skip if will already exists) ───────────
      updateTxStep(cursor, "running");

      // Check for existing will first to handle retries gracefully
      const existingWill = await readContract(config, {
        address:      WILL_FACTORY_ADDRESS,
        abi:          WILL_FACTORY_ABI,
        functionName: "getWill",
        args:         [address],
      }) as `0x${string}`;

      let willAddr: `0x${string}`;
      let deployedAtBlock: string | undefined;

      const NULL = "0x0000000000000000000000000000000000000000";
      if (existingWill && existingWill !== NULL) {
        willAddr = existingWill;
        setTxSteps(prev => prev.map((s, i) =>
          i === cursor ? { ...s, label: "Will contract already deployed ✓" } : s
        ));
      } else {
        const deployHash = await writeContractAsync({
          address:      WILL_FACTORY_ADDRESS,
          abi:          WILL_FACTORY_ABI,
          functionName: "createWill",
          args:         [WILL_EXECUTOR_ADDRESS],
        });
        setDeployTxHash(deployHash);
        const receipt = await waitForTransactionReceipt(config, { hash: deployHash });
        deployedAtBlock = receipt.blockNumber.toString();

        willAddr = await readContract(config, {
          address:      WILL_FACTORY_ADDRESS,
          abi:          WILL_FACTORY_ABI,
          functionName: "getWill",
          args:         [address],
        }) as `0x${string}`;
      }

      updateTxStep(cursor, "done");
      cursor++;
      setWillAddress(willAddr);

      // ── 2. addBeneficiary × N ──────────────────────────────────────────────
      for (let i = 0; i < beneficiaries.length; i++) {
        updateTxStep(cursor, "running");
        const b = beneficiaries[i];

        const enc = await encryptBatch([
          { type: "uint256", value: BigInt(keccak256(toBytes(b.email))) },
          { type: "uint32",  value: BigInt(b.share * 100) },
          { type: "address", value: "0x0000000000000000000000000000000000000000" },
        ], willAddr, address);

        const txHash = await writeContractAsync({
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
        await waitForTransactionReceipt(config, { hash: txHash });
        updateTxStep(cursor, "done");
        cursor++;
      }

      // ── 3. addGuardian × N ────────────────────────────────────────────────
      for (let i = 0; i < guardians.length; i++) {
        updateTxStep(cursor, "running");
        const g = guardians[i];

        const enc = await encryptBatch([
          { type: "uint256", value: BigInt(keccak256(toBytes(g.email))) },
        ], willAddr, address);

        const txHash = await writeContractAsync({
          address:      willAddr,
          abi:          FHE_WILL_ABI,
          functionName: "addGuardian",
          args: [
            toHex(enc.handles[0], { size: 32 }) as `0x${string}`,
            toHex(enc.inputProof) as `0x${string}`,
          ],
        });
        await waitForTransactionReceipt(config, { hash: txHash });
        updateTxStep(cursor, "done");
        cursor++;
      }

      // ── 4. setInactivityWindow ────────────────────────────────────────────
      updateTxStep(cursor, "running");
      const winHash = await writeContractAsync({
        address:      willAddr,
        abi:          FHE_WILL_ABI,
        functionName: "setInactivityWindow",
        args:         [BigInt(inactivityDays * 86400)],
      });
      await waitForTransactionReceipt(config, { hash: winHash });
      updateTxStep(cursor, "done");
      cursor++;

      // ── 5. ERC-20 approvals ───────────────────────────────────────────────
      for (const t of selTokens) {
        updateTxStep(cursor, "running");
        const hash = await writeContractAsync({
          address:      t.address,
          abi:          ERC20_ABI,
          functionName: "approve",
          args:         [WILL_EXECUTOR_ADDRESS, maxUint256],
        });
        await waitForTransactionReceipt(config, { hash });
        updateTxStep(cursor, "done");
        cursor++;
      }

      // ── 6. ERC-721 setApprovalForAll (one per collection) ─────────────────
      for (const nftAddr of selNFTAddrs) {
        updateTxStep(cursor, "running");
        const hash = await writeContractAsync({
          address:      nftAddr,
          abi:          ERC721_ABI,
          functionName: "setApprovalForAll",
          args:         [WILL_EXECUTOR_ADDRESS, true],
        });
        await waitForTransactionReceipt(config, { hash });
        updateTxStep(cursor, "done");
        cursor++;
      }

      // ── 7. Save metadata ──────────────────────────────────────────────────
      saveWillMeta({
        willAddress:     willAddr,
        ownerAddress:    address,
        beneficiaries:   beneficiaries.map(b => ({ email: b.email, share: b.share })),
        guardians:       guardians.map(g => ({ email: g.email })),
        inactivityDays,
        createdAt:       Math.floor(Date.now() / 1000),
        deployedAtBlock,
      });

      setPhase("done");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed or rejected";
      if (cursor < steps.length) updateTxStep(cursor, "error");
      setDeployError(msg.length > 140 ? msg.slice(0, 140) + "…" : msg);
    }
  }

  // ── Not connected guard ────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center px-6 pt-16">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-6">🔐</div>
            <h1 className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Connect your wallet first
            </h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
              Your will is tied to your wallet address — only you can configure it.
            </p>
            <ConnectButton />
            <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
              Already have a will?{" "}
              <Link href="/dashboard" className="underline">View your dashboard</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Deploying screen ───────────────────────────────────────────────────────
  if (phase === "deploying") {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center px-6 pt-16">
          <div className="w-full max-w-md">
            <div className="rounded-xl p-8"
                 style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
              <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Deploying your will
              </h2>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Sign each wallet prompt. Beneficiary data is encrypted before it leaves your device.
              </p>

              <div className="space-y-2">
                {txSteps.map((s, i) => <TxRow key={i} s={s} />)}
              </div>

              {deployError && (
                <div className="mt-6 p-4 rounded-lg"
                     style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--accent-danger)" }}>
                    Transaction failed
                  </p>
                  <p className="text-xs opacity-75" style={{ color: "var(--accent-danger)" }}>
                    {deployError}
                  </p>
                  <button
                    onClick={() => { setPhase("form"); setDeployError(null); }}
                    className="mt-3 text-xs underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ← Go back and try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === "done") {
    const selTokens     = selectedTokens();
    const selNFTAddrs   = selectedNFTContracts();
    const totalApproved = selTokens.length + selNFTAddrs.length;
    const etherscanBase = "https://sepolia.etherscan.io";

    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center px-6 pt-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md rounded-xl p-8"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            {/* Success icon */}
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-4"
                style={{ background: "rgba(52,211,153,0.12)" }}
              >
                ✓
              </motion.div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Your will is protected.
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {beneficiaries.length} {beneficiaries.length === 1 ? "beneficiary" : "beneficiaries"} ·{" "}
                {guardians.length} guardians ·{" "}
                {totalApproved > 0 ? `${totalApproved} asset${totalApproved > 1 ? "s" : ""} approved` : "no assets approved"}
              </p>
            </div>

            {/* Deployment details */}
            <div className="rounded-lg overflow-hidden mb-4"
                 style={{ border: "1px solid var(--border-subtle)" }}>
              <div className="px-3 py-2"
                   style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
                <p className="text-xs font-mono font-semibold uppercase tracking-wider"
                   style={{ color: "var(--text-muted)" }}>Deployment Details</p>
              </div>

              {/* Contract address */}
              <div className="px-3 py-3"
                   style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Child contract deployed</p>
                {willAddress ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                      {willAddress.slice(0, 12)}…{willAddress.slice(-8)}
                    </span>
                    <a
                      href={`${etherscanBase}/address/${willAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-0.5 rounded transition-colors shrink-0"
                      style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}
                    >
                      View ↗
                    </a>
                  </div>
                ) : (
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </div>

              {/* Tx hash */}
              <div className="px-3 py-3" style={{ background: "var(--bg-surface)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Deployment transaction</p>
                {deployTxHash ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                      {deployTxHash.slice(0, 12)}…{deployTxHash.slice(-8)}
                    </span>
                    <a
                      href={`${etherscanBase}/tx/${deployTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-0.5 rounded transition-colors shrink-0"
                      style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}
                    >
                      View ↗
                    </a>
                  </div>
                ) : (
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    Will was already deployed
                  </span>
                )}
              </div>
            </div>

            {/* Encryption badge */}
            <div className="px-4 py-3 rounded-lg mb-5 text-xs"
                 style={{ background: "var(--accent-primary-muted)", border: "1px solid rgba(124,106,247,0.2)", color: "var(--accent-primary)" }}>
              🔒 All beneficiary identities are encrypted via Zama FHEVM — invisible on-chain until execution.
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white"
              style={{ background: "var(--accent-primary)", boxShadow: "0 0 20px rgba(124,106,247,0.3)" }}
            >
              Go to Dashboard →
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Form steps ─────────────────────────────────────────────────────────────

  // Step 0: Beneficiaries
  const Step0 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Who receives your assets?
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Their identities are encrypted on-chain — invisible to everyone, including us.
      </p>

      <div className="space-y-3 mb-5">
        <input
          type="email"
          value={benEmail}
          onChange={(e) => setBenEmail(e.target.value)}
          placeholder="alice@example.com"
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Allocation</span>
            <span className="text-lg font-semibold font-mono" style={{ color: "var(--accent-primary)" }}>{benShare}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.max(1, 100 - totalShare)}
            value={benShare}
            onChange={(e) => setBenShare(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={() => {
            if (!benEmail.includes("@") || benShare <= 0) return;
            setBens(prev => [...prev, { email: benEmail, share: benShare, id: crypto.randomUUID() }]);
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
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--accent-primary)" }}>🔒</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{b.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--accent-primary)" }}>{b.share}%</span>
              <button onClick={() => setBens(p => p.filter(x => x.id !== b.id))}
                      className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {beneficiaries.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Total allocated</span>
          <span className="text-sm font-semibold font-mono"
                style={{ color: totalShare === 100 ? "var(--accent-success)" : "var(--accent-warning)" }}>
            {totalShare}% {totalShare === 100 ? "✓" : `(${100 - totalShare}% remaining)`}
          </span>
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <Link href="/dashboard"
              className="px-4 py-2.5 rounded-lg text-sm text-center"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
          Cancel
        </Link>
        <button
          onClick={() => go(1)}
          disabled={beneficiaries.length === 0 || totalShare !== 100}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--accent-primary)" }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  // Step 1: Assets
  const totalTokens   = tokens.length;
  const totalNFTs     = nfts.length;
  const selTokCount   = selectedTokenIds.size;
  const selNFTCount   = selectedNFTIds.size;

  const Step1 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Which assets should they receive?
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
        Select the tokens and NFTs from your wallet. We'll approve the executor to transfer them
        when the time comes.
      </p>

      {/* Select All + count */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg mb-4"
           style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
        <label className="flex items-center gap-3 cursor-pointer" onClick={toggleAll}>
          <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
               style={{
                 background:  allSelected ? "var(--accent-primary)" : "transparent",
                 borderColor: allSelected ? "var(--accent-primary)" : "var(--border-default)",
               }}>
            {allSelected && <span className="text-white text-xs leading-none">✓</span>}
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Allow All Assets
          </span>
        </label>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {selTokCount + selNFTCount} / {totalTokens + totalNFTs} selected
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg"
           style={{ background: "var(--bg-elevated)" }}>
        {(["tokens", "nfts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setAssetTab(tab)}
            className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize"
            style={{
              background: assetTab === tab ? "var(--bg-surface)" : "transparent",
              color:      assetTab === tab ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {tab === "tokens" ? `Tokens (${totalTokens})` : `NFTs (${totalNFTs})`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {assetsLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-lg animate-pulse"
                 style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      )}

      {/* Error */}
      {assetsError && !assetsLoading && (
        <div className="px-4 py-3 rounded-lg text-xs"
             style={{ background: "rgba(248,113,113,0.08)", color: "var(--text-secondary)" }}>
          Could not load assets automatically: {assetsError}. You can continue without selecting assets.
        </div>
      )}

      {/* Tokens tab */}
      {!assetsLoading && assetTab === "tokens" && (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {tokens.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              No ERC-20 tokens found in this wallet.
            </p>
          ) : tokens.map((t) => (
            <AssetRow
              key={t.address}
              selected={selectedTokenIds.has(t.address)}
              onToggle={() => toggleToken(t.address)}
            >
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt={t.symbol} className="w-7 h-7 rounded-full shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                     style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
                  {t.symbol.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.symbol}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{t.name}</p>
              </div>
              <span className="text-sm font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
                {t.balance}
              </span>
            </AssetRow>
          ))}
        </div>
      )}

      {/* NFTs tab */}
      {!assetsLoading && assetTab === "nfts" && (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {nfts.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              No NFTs found in this wallet.
            </p>
          ) : nfts.map((n) => {
            const id = `${n.contractAddress}_${n.tokenId}`;
            return (
              <AssetRow
                key={id}
                selected={selectedNFTIds.has(id)}
                onToggle={() => toggleNFT(id)}
              >
                {n.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.imageUrl} alt={n.name} className="w-9 h-9 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0"
                       style={{ background: "var(--bg-overlay)" }}>
                    🖼
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{n.name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{n.collection}</p>
                </div>
                <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-muted)" }}>
                  #{n.tokenId.length > 6 ? n.tokenId.slice(0, 6) + "…" : n.tokenId}
                </span>
              </AssetRow>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        You can skip this step — assets can be approved later from your dashboard.
      </p>

      <div className="flex gap-3 mt-5">
        <button onClick={() => go(0)}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
          Back
        </button>
        <button
          onClick={() => go(2)}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent-primary)" }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  // Step 2: Guardians
  const Step2 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Choose trusted contacts
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        These people confirm your wishes if LastKey ever needs to act. 2-of-3 quorum required.
      </p>

      <div className="space-y-3 mb-5">
        <input
          type="email"
          value={guardEmail}
          onChange={(e) => setGuardEmail(e.target.value)}
          placeholder="trusted@friend.com"
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
        <button
          onClick={() => {
            if (!guardEmail.includes("@") || guardians.length >= 3) return;
            setGuards(prev => [...prev, { email: guardEmail, id: crypto.randomUUID() }]);
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
              <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>G{i + 1}</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{g.email}</span>
            </div>
            <button onClick={() => setGuards(p => p.filter(x => x.id !== g.id))}
                    className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
          </motion.div>
        ))}
      </AnimatePresence>

      {guardians.length < 2 && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Minimum 2 guardians required for a 2-of-3 quorum.
        </p>
      )}

      <div className="flex gap-3 mt-8">
        <button onClick={() => go(1)}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
          Back
        </button>
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

  // Step 3: Safety Window + Review
  const windows = [
    { days: 180, label: "6 months", desc: "Aggressive. Best for active users." },
    { days: 365, label: "1 year",   desc: "Recommended. Balanced safety." },
    { days: 730, label: "2 years",  desc: "Relaxed. Best for long-term holders." },
  ];

  const Step3 = (
    <div>
      <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        How long should we wait?
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        If inactive AND missing check-ins for this long, your guardians will be notified.
      </p>

      <div className="space-y-2 mb-6">
        {windows.map((w) => (
          <button
            key={w.days}
            onClick={() => setInact(w.days)}
            className="w-full text-left px-5 py-4 rounded-lg transition-all"
            style={{
              background: inactivityDays === w.days ? "var(--accent-primary-muted)" : "var(--bg-surface)",
              border: `1px solid ${inactivityDays === w.days ? "var(--accent-primary)" : "var(--border-subtle)"}`,
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

      {/* Summary */}
      <div className="rounded-lg p-4 mb-6 space-y-2"
           style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
        <p className="text-xs font-mono font-medium uppercase tracking-widest mb-3"
           style={{ color: "var(--text-muted)" }}>Summary</p>
        {[
          ["Beneficiaries",    `${beneficiaries.length} protected`],
          ["Tokens approved",  selTokCount > 0 ? `${selTokCount} token${selTokCount > 1 ? "s" : ""}` : "none — select in Assets step"],
          ["NFT collections",  selectedNFTIds.size > 0 ? `${selectedNFTContracts().length} collection${selectedNFTContracts().length > 1 ? "s" : ""}` : "none"],
          ["Guardians",        `${guardians.length} trusted contacts`],
          ["Inactivity window", windows.find(w => w.days === inactivityDays)?.label ?? `${inactivityDays} days`],
          ["Encryption",       "🔒 Zama FHEVM"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span style={{ color: "var(--text-secondary)" }}>{k}</span>
            <span style={{ color: k === "Encryption" ? "var(--accent-primary)" : "var(--text-primary)" }}>{v}</span>
          </div>
        ))}
      </div>

      {fheLoading && (
        <div className="px-4 py-2.5 rounded-lg text-xs text-center mb-4"
             style={{ background: "var(--accent-primary-muted)", color: "var(--accent-primary)" }}>
          ⏳ Initializing FHE encryption engine…
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => go(2)}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
          Back
        </button>
        <button
          onClick={deployWill}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--accent-primary)", boxShadow: "0 0 20px rgba(124,106,247,0.25)" }}
        >
          Deploy &amp; Protect My Will
        </button>
      </div>
    </div>
  );

  const stepContent = [Step0, Step1, Step2, Step3];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Navbar />
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-28 pb-16">
        <div className="w-full max-w-140 mb-6">
          <Link href="/dashboard" className="text-xs flex items-center gap-1"
                style={{ color: "var(--text-muted)" }}>
            ← Back to dashboard
          </Link>
        </div>

        <div className="w-full max-w-140">
          <StepBar step={step} />

          <div className="rounded-xl p-8 overflow-hidden"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
