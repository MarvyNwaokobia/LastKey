"use client";
import { motion } from "framer-motion";

const cards = [
  {
    icon: "🔒",
    title: "Fully Private",
    desc: "Beneficiary names and allocations are encrypted using Fully Homomorphic Encryption. Nobody can read them — not even the Ethereum blockchain nodes that store them.",
  },
  {
    icon: "🛡️",
    title: "Multi-Signal Safety",
    desc: "Three independent signals must all fail before anything moves: on-chain activity, monthly check-ins, and confirmation from your trusted guardians. False triggers are impossible.",
  },
  {
    icon: "👵",
    title: "Anyone Can Claim",
    desc: "Beneficiaries don't need a crypto wallet or any technical knowledge. Just an email address and their identity. We handle the rest — no gas fees, no seed phrases.",
  },
];

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function ExplainerCards() {
  return (
    <section className="py-20 px-6" id="how-it-works">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="text-xs font-mono font-medium tracking-widest uppercase mb-3"
             style={{ color: "var(--accent-primary)" }}>
            Why LastKey
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold"
              style={{ color: "var(--text-primary)" }}>
            Privacy you can prove.
          </h2>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-5"
        >
          {cards.map((card) => (
            <motion.div
              key={card.title}
              variants={item}
              whileHover={{ y: -4, borderColor: "var(--border-strong)" }}
              className="rounded-lg p-8 transition-colors cursor-default"
              style={{
                background:    "var(--bg-surface)",
                border:        "1px solid var(--border-subtle)",
                borderRadius:  "var(--radius-lg)",
                transition:    "var(--transition-base)",
              }}
            >
              <div className="text-3xl mb-5">{card.icon}</div>
              <h3 className="text-base font-semibold mb-3"
                  style={{ color: "var(--text-primary)" }}>
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed"
                 style={{ color: "var(--text-secondary)" }}>
                {card.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
