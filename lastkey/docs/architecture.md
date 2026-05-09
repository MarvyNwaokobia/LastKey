# LastKey — Architecture

**Confidential On-Chain Inheritance Protocol**  
Built on Zama FHEVM · Inco Gentry Testnet (ChainID 9090)

---

## Protocol Overview

LastKey lets crypto owners create **encrypted wills** on-chain. Beneficiary identities and allocation shares are Fully Homomorphic Encryption (FHE) ciphertexts — no one, not even the protocol, can read them. Execution is only triggered when the owner is **genuinely unreachable** across multiple independent signals. Beneficiaries claim using email identity with no crypto knowledge required.

---

## State Machine

```
                    ┌─────────────────────────────────┐
                    │           ACTIVE                 │
                    │  Owner configures will,          │
                    │  submits heartbeats,             │
                    │  monitors on-chain activity      │
                    └──────────────┬──────────────────┘
                                   │
                    Guardian quorum confirmed (≥2/3)
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │          CONFIRMING              │
                    │  All liveness signals failing.   │
                    │  Owner can still cancel.         │
                    └──────────┬──────────────────────┘
                               │                     ▲
              Inactivity window                       │
              elapsed + heartbeat                     │ owner calls
              missed + executor                       │ cancelExecution()
              validates                               │
                               │                     │
                               ▼                     │
                    ┌─────────────────────────────────┐
                    │           EXECUTED               │
                    │  FHE handles publicly            │
                    │  decryptable. Agent resolves     │
                    │  beneficiaries and transfers.    │
                    └─────────────────────────────────┘
```

**Transition guards:**
- `ACTIVE → CONFIRMING`: ≥ 2 guardian confirmations received
- `CONFIRMING → EXECUTED`: inactivity window elapsed + heartbeat missed + executor validated
- `CONFIRMING → ACTIVE`: owner calls `cancelExecution()` (proves they are alive)

---

## Multi-Signal Liveness System

Three independent signals must ALL fail before execution:

| Signal | Source | Reset by |
|--------|--------|----------|
| **On-chain activity** | Wallet transactions, contract interactions | Any tx from owner's wallet |
| **Passkey heartbeat** | Owner pings `submitHeartbeat()` every ≤ 30 days | Owner action |
| **Guardian quorum** | ≥ 2-of-3 guardians confirm death | Guardian email confirmation |

The Chainlink Automation keeper (`LivenessOracle`) monitors all three signals and triggers execution only when the window is expired, heartbeat missed, and guardian quorum met.

---

## FHE Data Model

| Field | Type | Encrypted? | Why |
|-------|------|-----------|-----|
| Beneficiary email hash | `euint256` | ✅ Yes | `keccak256(email)` — 256 bits. Privacy: no one learns who inherits |
| Allocation share | `euint32` | ✅ Yes | Basis points (0–10 000). Privacy: amounts hidden |
| Fallback wallet | `eaddress` | ✅ Yes | Optional direct wallet. Privacy: address hidden |
| Guardian email hash | `euint256` | ✅ Yes | `keccak256(email)` — identity kept private |
| Liveness flag | `ebool` | ✅ Yes | Encrypted state mirror for executor checks |
| Will state | `WillState` enum | ❌ Public | State machine must be readable by all parties |
| Activity timestamp | `uint256` | ❌ Public | Needed by Chainlink keeper for liveness check |
| Heartbeat timestamp | `uint256` | ❌ Public | Same — keepers are on-chain |
| Beneficiary count | `uint8` | ❌ Public | Needed for iteration during execution |
| Guardian count | `uint8` | ❌ Public | Needed for quorum threshold |
| Confirm count | `uint8` | ❌ Public | Needed for quorum threshold |

**Note on `euint256` vs `ebytes32`:** `ebytes32` exists in `EncryptedTypes.sol` but `FHE.fromExternal(externalEbytes32, ...)` is not yet implemented in fhevm-solidity v0.11.1. `euint256` is semantically identical for 32-byte values (256 bits = 32 bytes) and has full FHE library support including `fromExternal`, `allow`, `allowThis`, `makePubliclyDecryptable`.

---

## Contract Architecture

```
WillFactory
  │  Deploys FHEWill via CREATE2 (deterministic address per owner)
  │  Mapping: owner → will address
  ▼
FHEWill (per owner)
  │  Stores all encrypted beneficiary + guardian data
  │  Manages liveness timestamps
  │  Controls state machine transitions
  │  On execution: calls makePubliclyDecryptable() on all handles
  ▼
WillExecutor (singleton, stateless)
  │  Validates execution conditions
  │  Receives decrypted values + KMS proof from off-chain agent
  │  Verifies proof on-chain via KMS verifier
  │  Resolves email hash → wallet address via email bridge
  │  Executes ETH + ERC-20 transfers proportional to shares
  ▼
LivenessOracle (Chainlink Automation)
     Monitors registered wills
     Calls executor.execute() when all signals fail
```

---

## Execution Flow (Step-by-Step)

```
1. Owner creates will via WillFactory.createWill()
2. Owner calls addBeneficiary() with encrypted email hash + share + fallback
3. Owner calls addGuardian() with encrypted guardian email hashes
4. Owner submits periodic heartbeats via submitHeartbeat()
5. Chainlink keeper monitors lastActivityTimestamp + lastHeartbeatTimestamp
6. If owner becomes unreachable, guardians call confirmDeceased(emailHash)
7. After ≥2 guardian confirmations → state = CONFIRMING
8. After inactivity window + heartbeat interval expire → keeper calls executor.execute()
9. executor.execute() calls will.triggerExecution() which calls makePubliclyDecryptable()
   on all beneficiary handles
10. Off-chain agent detects ExecutionTriggered event, calls sdk.publicDecrypt(handles)
11. Agent gets (abiEncodedClearValues, decryptionProof) from relayer SDK
12. Agent calls executor.resolveTransfer(will, index, clearValues, proof) for each slot
13. Executor verifies proof on-chain, resolves wallet from email hash, transfers assets
14. Executor calls revokeACL() to clean up FHE permissions
```

---

## Trust Assumptions

1. **Zama KMS**: The FHE key management service holds the decryption key. It only decrypts handles marked `makePubliclyDecryptable()` — i.e., after execution is triggered on-chain.
2. **Guardian honesty**: Guardians can submit false confirmations, but the executor verifies their email hashes match the encrypted registry. False confirmations cannot pass the FHE verification step.
3. **Email bridge**: The email→wallet resolution service is trusted for beneficiary address mapping. Use a ZK-based bridge (e.g., EmailAuth) for production.
4. **Chainlink Automation**: The keeper is trusted to trigger `checkUpkeep` / `performUpkeep` correctly. A malicious keeper cannot fabricate liveness expiry — it's computed on-chain.
5. **Owner safety**: The `cancelExecution()` function gives the owner a window to abort after CONFIRMING. This relies on the owner having wallet access to prove they are alive.

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| Attacker reads beneficiary identities | All identities are FHE ciphertexts — unreadable without the KMS key |
| Premature execution by attacker | `triggerExecution()` requires executor + CONFIRMING state + liveness expiry |
| False guardian confirmations | Executor verifies `keccak256(email)` matches encrypted guardian hashes via FHE proof |
| Malicious executor | Only `onlyOwner` functions can configure the will; executor cannot change beneficiaries |
| Replay of decryption proof | Proof is bound to specific handles + KMS epoch; cannot be reused across wills |
| Beneficiary front-running | Email→wallet resolution happens after proof verification; address is derived, not supplied |

---

## Gas Estimates (FHE Operations)

| Operation | On-Chain Gas | Coprocessor Gas |
|-----------|-------------|-----------------|
| `addBeneficiary` (3 FHE ops) | ~56 000 | ~465 000 |
| `triggerExecution` (10 × 3 makePubliclyDecryptable) | ~300 000 | 0 |
| `fromExternal` (per value) | ~6 000 | ~50 000 |
| `allowThis + allow` per handle | ~6 000 | 0 |

---

## Environment Variables

```bash
PRIVATE_KEY=0x...               # Deployer wallet
INCO_RPC_URL=https://testnet.inco.org
SEPOLIA_RPC_URL=                # For Zama Sepolia testing
ETHERSCAN_API_KEY=              # For Sepolia verification
```

---

*Generated for LastKey · Zama × OpenBuild Hackathon · 2026*
