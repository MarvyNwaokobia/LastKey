"use client";
import { motion } from "framer-motion";

const rows = [
  { label: "Beneficiary 1", widths: ["w-48", "flex-1"] },
  { label: "Beneficiary 2", widths: ["w-40", "flex-1"] },
  { label: "Share 1",       widths: ["w-32", "flex-1"] },
  { label: "Share 2",       widths: ["w-36", "flex-1"] },
];

export default function EncryptedDisplay() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-mono font-medium mb-3 tracking-widest uppercase"
             style={{ color: "var(--accent-primary)" }}>
            What Etherscan sees
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}>
            Your beneficiaries are invisible — even on-chain.
          </h2>
          <p className="text-base mb-10" style={{ color: "var(--text-secondary)" }}>
            Every name, email, and allocation is encrypted before it reaches the blockchain.
            No one can read it — not miners, not validators, not even us.
          </p>
        </motion.div>

        {/* The "wow" moment card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-lg overflow-hidden text-left"
          style={{
            background:   "var(--bg-surface)",
            border:       "1px solid var(--border-default)",
            fontFamily:   "var(--font-jetbrains)",
          }}
        >
          {/* Terminal header bar */}
          <div className="flex items-center gap-2 px-4 py-3"
               style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="w-3 h-3 rounded-full" style={{ background: "#F87171" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#FBBF24" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#34D399" }} />
            <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
              etherscan.io — Contract Storage
            </span>
          </div>

          <div className="p-5 space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs w-28 shrink-0" style={{ color: "var(--text-muted)" }}>
                  {row.label}:
                </span>
                <div className="flex gap-2 flex-1">
                  {row.widths.map((w, j) => (
                    <div
                      key={j}
                      className={`encrypt-bar ${w} ${j === 1 ? "flex-1" : ""}`}
                      style={{ animationDelay: `${(i * 0.3 + j * 0.15).toFixed(2)}s` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              <span style={{ color: "var(--accent-primary)" }}>✦</span>{" "}
              Encrypted on-chain. Unreadable to everyone — until your will executes.
            </p>
          </div>
        </motion.div>

        {/* Contrast: what the family sees */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 rounded-lg p-5 text-left"
          style={{
            background: "var(--bg-surface)",
            border:     "1px solid var(--border-subtle)",
            fontFamily: "var(--font-jetbrains)",
          }}
        >
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            What Alice receives when the time comes:
          </p>
          {[
            { label: "Beneficiary 1:", value: "alice@example.com", color: "var(--text-primary)" },
            { label: "Share:",         value: "60%",                color: "var(--accent-success)" },
          ].map((row, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--accent-success)" }}>✓</span>{" "}
            Decrypted only after your safety window expires and your guardians confirm.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
