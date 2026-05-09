"use client";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

function ClaimContent() {
  const params      = useSearchParams();
  const willAddress = params.get("will");
  const index       = params.get("index");
  const [path, setPath] = useState<"wallet" | "email" | null>(null);
  const [emailStep, setEmailStep] = useState<"input" | "loading" | "done">("input");
  const [email, setEmail] = useState("");
  const { isConnected, address } = useAccount();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      {/* Minimal header */}
      <header className="flex items-center justify-between px-8 py-5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <span>🔑</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>LastKey</span>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
          Secure Claim
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Icon */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.6, delay: 0.1 }}
                className="text-6xl mb-6"
              >
                🔑
              </motion.div>
              <h1 className="font-serif text-3xl md:text-4xl mb-4 leading-snug"
                  style={{ color: "var(--text-primary)" }}>
                Someone left you something.
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                A crypto inheritance has been designated for your email address.
                It's been held privately on-chain, waiting for you.
              </p>
            </div>

            {/* Asset card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="rounded-xl p-6 mb-8"
              style={{
                background: "var(--bg-surface)",
                border:     "1px solid var(--border-default)",
              }}
            >
              {willAddress ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Will contract</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {willAddress.slice(0, 10)}…{willAddress.slice(-6)}
                    </span>
                  </div>
                  {index !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Beneficiary slot</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                        #{parseInt(index) + 1}
                      </span>
                    </div>
                  )}
                  <div className="pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <p className="text-sm font-semibold text-center" style={{ color: "var(--accent-success)" }}>
                      ✓ Your inheritance is ready to claim
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
                  Your inheritance is ready to claim.
                </p>
              )}
            </motion.div>

            {/* Path selection */}
            {!path && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="space-y-3"
              >
                {/* Path B — New to crypto (highlighted) */}
                <button
                  onClick={() => setPath("email")}
                  className="w-full text-left px-5 py-4 rounded-xl transition-all"
                  style={{
                    background: "var(--accent-primary-muted)",
                    border:     "1px solid rgba(124,106,247,0.35)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">📧</span>
                    <div>
                      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                        I'm new to crypto
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-normal"
                              style={{ background: "var(--accent-primary)", color: "#fff" }}>
                          Recommended
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Sign in with your email — we'll create a secure wallet for you automatically.
                      </p>
                    </div>
                  </div>
                </button>

                {/* Path A — I have a wallet */}
                <button
                  onClick={() => setPath("wallet")}
                  className="w-full text-left px-5 py-4 rounded-xl transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">🦊</span>
                    <div>
                      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                        I have a crypto wallet
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Connect MetaMask, Coinbase Wallet, or any other wallet.
                      </p>
                    </div>
                  </div>
                </button>
              </motion.div>
            )}

            {/* Path A: Wallet */}
            {path === "wallet" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="space-y-4"
              >
                {!isConnected ? (
                  <div className="flex flex-col items-center gap-4">
                    <ConnectButton label="Connect Wallet to Claim" />
                    <button onClick={() => setPath(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>
                      ← Back
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl p-6 text-center"
                       style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-2xl mb-3">✓</div>
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--accent-success)" }}>
                      Wallet connected
                    </p>
                    <p className="text-xs font-mono mb-4" style={{ color: "var(--text-muted)" }}>
                      {address?.slice(0, 10)}…{address?.slice(-6)}
                    </p>
                    <button
                      className="w-full py-3 rounded-lg text-sm font-semibold text-white"
                      style={{ background: "var(--accent-primary)" }}
                    >
                      Claim My Inheritance
                    </button>
                    <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                      Funds will be sent to your connected wallet.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Path B: Email */}
            {path === "email" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="rounded-xl overflow-hidden"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                {emailStep === "input" && (
                  <div className="p-6 space-y-4">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Enter your email address
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      We'll verify it matches the encrypted record in the will.
                    </p>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border:     "1px solid var(--border-default)",
                        color:      "var(--text-primary)",
                      }}
                    />
                    <button
                      onClick={() => {
                        setEmailStep("loading");
                        setTimeout(() => setEmailStep("done"), 2500);
                      }}
                      disabled={!email.includes("@")}
                      className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: "var(--accent-primary)" }}
                    >
                      Continue with Email
                    </button>
                    <button onClick={() => setPath(null)} className="w-full text-xs text-center" style={{ color: "var(--text-muted)" }}>
                      ← Back
                    </button>
                  </div>
                )}

                {emailStep === "loading" && (
                  <div className="p-10 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto mb-4"
                      style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }}
                    />
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Creating your secure wallet…
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Verifying identity on-chain
                    </p>
                  </div>
                )}

                {emailStep === "done" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl mx-auto mb-5"
                      style={{ background: "rgba(52,211,153,0.15)" }}
                    >
                      ✓
                    </motion.div>
                    <h3 className="text-base font-semibold mb-2" style={{ color: "var(--accent-success)" }}>
                      Funds transferred to your wallet
                    </h3>
                    <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                      Your new wallet has been created and the funds sent. Download a wallet app to access them anytime.
                    </p>
                    <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                      You won't pay any fees to claim.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimContent />
    </Suspense>
  );
}
