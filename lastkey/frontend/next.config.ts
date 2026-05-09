import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpack = require("webpack");

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    if (isServer) {
      // Replace the browser WASM build with an empty module on the server.
      // The SDK's JS glue code references `self` (a browser-only global) at
      // module init time, which crashes Node.js prerendering. All actual FHE
      // operations happen inside useEffect via FhevmProvider (client-only).
      config.resolve.alias = {
        ...config.resolve.alias,
        "@zama-fhe/relayer-sdk/web": false,
      };
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        // MetaMask SDK ships a React Native dep that doesn't exist in browsers.
        "@react-native-async-storage/async-storage": false,
        // WalletConnect's pino logger optionally imports pino-pretty.
        "pino-pretty": false,
      };

      // @zama-fhe/relayer-sdk references the Node.js `global` at module init.
      config.plugins.push(
        new webpack.DefinePlugin({ global: "globalThis" })
      );
    }

    return config;
  },
};

export default nextConfig;
