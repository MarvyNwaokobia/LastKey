"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import ExplainerCards from "@/components/landing/ExplainerCards";
import EncryptedDisplay from "@/components/landing/EncryptedDisplay";
import HowItWorks from "@/components/landing/HowItWorks";

export default function LandingPage() {
  return (
    <div style={{ background: "var(--bg-base)" }}>
      <Navbar />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden pt-16">
        <div className="hero-glow" />

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-8"
          style={{
            background: "var(--accent-primary-muted)",
            border:     "1px solid rgba(124,106,247,0.25)",
            color:      "var(--accent-primary)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Powered by Zama FHEVM · Sepolia Testnet
        </motion.div>

        {/* Headline — Playfair Display */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="font-serif text-5xl md:text-7xl leading-tight tracking-tight max-w-3xl"
          style={{ color: "var(--text-primary)" }}
        >
          Your legacy,<br />
          <span style={{ color: "var(--accent-primary)" }}>encrypted</span> forever.
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22 }}
          className="mt-6 text-lg leading-relaxed max-w-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          LastKey lets you designate who inherits your crypto assets.
          Beneficiary identities stay encrypted on-chain — invisible to everyone,
          including us. Until the moment it matters.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Link
            href="/create"
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white transition-all"
            style={{
              background: "var(--accent-primary)",
              boxShadow:  "0 0 24px rgba(124,106,247,0.35)",
            }}
          >
            Create Your Will
          </Link>
          <a
            href="#how-it-works"
            className="px-6 py-3 rounded-lg text-sm font-medium transition-colors"
            style={{
              color:   "var(--text-secondary)",
              border:  "1px solid var(--border-default)",
            }}
          >
            See How It Works
          </a>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-14 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Non-custodial · Open source · Auditable on-chain
        </motion.p>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="text-xs">scroll</span>
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-xs"
          >↓</motion.div>
        </motion.div>
      </section>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      <ExplainerCards />
      <EncryptedDisplay />
      <HowItWorks />

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-serif text-4xl md:text-5xl mb-4"
              style={{ color: "var(--text-primary)" }}>
            Start in under two minutes.
          </h2>
          <p className="text-base mb-8" style={{ color: "var(--text-secondary)" }}>
            No paperwork. No lawyers. Just your wallet and an email.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg text-sm font-semibold text-white"
            style={{
              background: "var(--accent-primary)",
              boxShadow:  "0 0 32px rgba(124,106,247,0.3)",
            }}
          >
            Create Your Will — Free
          </Link>
          <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            No gas required until you add beneficiaries
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 px-6 text-center text-xs"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          color:     "var(--text-muted)",
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <span>🔑</span>
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>LastKey</span>
        </div>
        Built with Zama FHEVM for the OpenBuild Hackathon ·{" "}
        <a href="https://github.com" className="underline hover:text-current transition-colors">
          Open Source
        </a>
      </footer>
    </div>
  );
}
