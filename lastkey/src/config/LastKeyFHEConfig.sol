// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE }               from "fhevm/lib/FHE.sol";
import { CoprocessorConfig } from "fhevm/lib/Impl.sol";

/// @title LastKeyFHEConfig
/// @notice FHE coprocessor config for LastKey.
///         Supports Zama FHEVM Sepolia testnet (11155111) and local forge testing (31337).
///         Extend this instead of ZamaEthereumConfig so both networks are covered.
abstract contract LastKeyFHEConfig {
    constructor() {
        FHE.setCoprocessor(_resolveConfig());
    }

    function _resolveConfig() private view returns (CoprocessorConfig memory) {
        if (block.chainid == 31337) {
            // Local anvil / forge-fhevm mock — addresses match forge-fhevm defaults
            return CoprocessorConfig({
                ACLAddress:          0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D,
                CoprocessorAddress:  0xe3a9105a3a932253A70F126eb1E3b589C643dD24,
                KMSVerifierAddress:  0x901F8942346f7AB3a01F6D7613119Bca447Bb030
            });
        }

        if (block.chainid == 11155111) {
            // Zama FHEVM Sepolia testnet — primary deployment target
            return CoprocessorConfig({
                ACLAddress:          0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D,
                CoprocessorAddress:  0x92C920834Ec8941d2C77D188936E1f7A6f49c127,
                KMSVerifierAddress:  0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A
            });
        }

        revert("LastKey: unsupported chain. Use Sepolia (11155111) or local (31337)");
    }
}
