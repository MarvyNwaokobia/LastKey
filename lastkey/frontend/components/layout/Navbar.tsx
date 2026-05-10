"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed top-0 inset-x-0 z-50"
      style={{
        background: "rgba(10,10,15,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold text-white"
            style={{ background: "var(--accent-primary)" }}
          >
            🔑
          </div>
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            LastKey
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono font-medium"
            style={{
              background: "var(--accent-primary-muted)",
              color: "var(--accent-primary)",
              fontSize: "0.65rem",
            }}
          >
            BETA
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-6">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/claim",     label: "Claim"     },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm transition-colors"
              style={{
                color: pathname === link.href
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
                fontWeight: pathname === link.href ? 600 : 400,
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Wallet — always visible */}
        <ConnectButton
          accountStatus="avatar"
          chainStatus="none"
          showBalance={false}
        />
      </div>
    </nav>
  );
}
