import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

const inter = Inter({
  subsets:  ["latin"],
  weight:   ["300", "400", "500", "600"],
  variable: "--font-inter",
  display:  "swap",
});

const playfair = Playfair_Display({
  subsets:  ["latin"],
  weight:   ["400", "700"],
  variable: "--font-playfair",
  display:  "swap",
});

const jetbrains = JetBrains_Mono({
  subsets:  ["latin"],
  weight:   ["400", "500"],
  variable: "--font-jetbrains",
  display:  "swap",
});

export const metadata: Metadata = {
  title:       "LastKey — Encrypted Inheritance on Ethereum",
  description: "Designate who inherits your crypto assets. Beneficiary identities stay encrypted on-chain using Fully Homomorphic Encryption.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${jetbrains.variable} dark`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
