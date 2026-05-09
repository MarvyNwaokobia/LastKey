"use client";
import { motion } from "framer-motion";

const steps = [
  { n: "01", title: "Connect your wallet",         desc: "Link your Ethereum wallet. This becomes the master key for your will." },
  { n: "02", title: "Add beneficiaries",           desc: "Enter email addresses and allocations. They're encrypted before leaving your browser." },
  { n: "03", title: "Set your safety window",      desc: "Choose how long you can be inactive before your contacts are notified. We recommend one year." },
  { n: "04", title: "Live your life",              desc: "Tap 'I'm here' once a month. If you stop, your trusted guardians are asked to confirm. Then and only then does anything happen." },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-mono font-medium tracking-widest uppercase mb-3"
             style={{ color: "var(--accent-primary)" }}>
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold"
              style={{ color: "var(--text-primary)" }}>
            Four steps. Then relax.
          </h2>
        </motion.div>

        <div className="relative space-y-0">
          {/* Connecting line */}
          <div
            className="absolute left-[19px] top-8 bottom-8 w-px"
            style={{ background: "var(--border-default)" }}
          />

          {steps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative flex gap-6 pb-10 last:pb-0"
            >
              {/* Number bubble */}
              <div
                className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-mono font-semibold"
                style={{
                  background: "var(--bg-surface)",
                  border:     "1px solid var(--border-default)",
                  color:      "var(--accent-primary)",
                }}
              >
                {step.n}
              </div>

              <div className="pt-2">
                <h3 className="font-semibold mb-1.5 text-base"
                    style={{ color: "var(--text-primary)" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed"
                   style={{ color: "var(--text-secondary)" }}>
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
