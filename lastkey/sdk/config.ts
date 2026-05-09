// FHEVM chain configurations.
// All addresses are Zama's official deployed contracts — do not modify.

export type ChainKey = "sepolia" | "mainnet" | "base" | "arbitrum";

export interface FhevmChainConfig {
  chainId:                                   number;
  gatewayChainId:                            number;
  aclContractAddress:                        string;
  kmsContractAddress:                        string;
  inputVerifierContractAddress:              string;
  verifyingContractAddressDecryption:        string;
  verifyingContractAddressInputVerification: string;
}

export const CHAIN_CONFIGS: Record<ChainKey, FhevmChainConfig> = {
  sepolia: {
    chainId:                                   11155111,
    gatewayChainId:                            55815,
    aclContractAddress:                        "0x687820221192C5B662b25367F70076A37bc79b6c",
    kmsContractAddress:                        "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
    inputVerifierContractAddress:              "0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4",
    verifyingContractAddressDecryption:        "0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1",
    verifyingContractAddressInputVerification: "0x7048C39f048125eDa9d678AEbaDfB22F7900a29F",
  },
  mainnet: {
    chainId: 1, gatewayChainId: 55815,
    aclContractAddress: "", kmsContractAddress: "",
    inputVerifierContractAddress: "",
    verifyingContractAddressDecryption: "",
    verifyingContractAddressInputVerification: "",
  },
  base: {
    chainId: 8453, gatewayChainId: 55815,
    aclContractAddress: "", kmsContractAddress: "",
    inputVerifierContractAddress: "",
    verifyingContractAddressDecryption: "",
    verifyingContractAddressInputVerification: "",
  },
  arbitrum: {
    chainId: 42161, gatewayChainId: 55815,
    aclContractAddress: "", kmsContractAddress: "",
    inputVerifierContractAddress: "",
    verifyingContractAddressDecryption: "",
    verifyingContractAddressInputVerification: "",
  },
};
