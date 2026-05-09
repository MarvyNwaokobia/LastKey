"use client";
import { WagmiProvider }           from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { FhevmProvider }           from "@fhevm/sdk";
import { wagmiConfig }             from "../lib/wagmi";

const queryClient = new QueryClient();

const rkTheme = darkTheme({
  accentColor:          "#7C6AF7",
  accentColorForeground:"#fff",
  borderRadius:         "medium",
  fontStack:            "system",
  overlayBlur:          "small",
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} coolMode>
          <FhevmProvider>
            {children}
          </FhevmProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
