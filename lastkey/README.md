# 🗝️ Last Key

**Confidential Digital Inheritance & Decentralized Dead Man's Switch**

Built on [Zama FHEVM](https://docs.zama.ai/fhevm), Last Key ensures your digital legacy is protected and distributed privately. Your beneficiaries, allocations, and guardians remain completely encrypted on-chain, only being revealed when your liveness can no longer be verified.

---

## 🌟 Overview

Last Key solves the "Confidential Digital Inheritance" problem. Traditional smart contract wills reveal your beneficiaries and assets to the world. Last Key uses **Fully Homomorphic Encryption (FHE)** to keep everything secret until the moment of execution.

### Key Pillars
- **🔒 Absolute Privacy**: Beneficiary emails, wallet addresses, and share percentages are stored as FHE ciphertexts.
- **📡 Multi-Signal Liveness**: We track three independent signals: on-chain activity, periodic Passkey (WebAuthn) heartbeats, and a customizable inactivity window.
- **🛡️ Guardian Quorum**: Execution requires a quorum of encrypted guardians to confirm your status, preventing accidental triggers.
- **🤖 Autonomous Execution**: Integrated with Chainlink Automation and a specialized FHE Agent for seamless, trustless handovers.

---

## 🏗️ Architecture

Last Key is structured as a monorepo containing the full stack of FHE development:

- **`src/`**: Confidential Solidity contracts using TFHE types.
  - `FHEWill.sol`: The core state machine and encrypted storage for a user's will.
  - `WillFactory.sol`: Permissionless deployment of personal wills.
  - `LivenessOracle.sol`: Chainlink Automation keeper for monitoring inactivity.
  - `WillExecutor.sol`: Coordinates the final decryption and distribution process.
- **`frontend/`**: A modern Next.js 15 dashboard for managing your digital legacy.
- **`agent/`**: A headless Node.js runtime that monitors liveness and handles off-chain FHE computations.
- **`sdk/`**: A unified TypeScript SDK that abstracts WASM initialization and FHEVM complexity.

---

## 🗺️ User Journey

1. **Setup**: Deploy your personal `FHEWill` via the Factory.
2. **Configure**: Add beneficiaries and guardians. Their identities (emails) and your asset allocations are encrypted client-side using FHE before being sent to the contract.
3. **Maintain**: Submit periodic "Heartbeats" (Passkey/WebAuthn) or simply remain active on-chain to keep the will in an `ACTIVE` state.
4. **Trigger**: If liveness expires, anyone can trigger the `CONFIRMING` state. Guardians are notified (off-chain) to confirm the status.
5. **Execute**: Once quorum is met, the Agent decrypts the beneficiary data and the `WillExecutor` initiates asset transfers to wallets or `BeneficiaryVaults` (for email-only claimants).

---

## 🚀 Getting Started

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) (v20+)
- [fhevm-forge](https://github.com/zama-ai/fhevm-forge)

### Installation

```bash
# Clone the repository
git clone https://github.com/marvy/last_key.git
cd last_key

# Install dependencies
forge install
npm install
```

### Environment Setup
Copy the example environment file and fill in your RPC URLs and keys:
```bash
cp .env.example .env
```

### Development Workflow

**1. Test the Contracts** (Local FHE Mock)
```bash
forge test
```

**2. Lint for FHE-specific bugs**
```bash
fhevm-forge lint ./src
```

**3. Deploy to Sepolia FHEVM**
```bash
fhevm-forge deploy --chains sepolia --contract WillFactory
```

**4. Run the Frontend**
```bash
cd frontend
npm run dev
```

**5. Start the Monitoring Agent**
```bash
cd agent
npm run agent:monitor
```

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Smart Contracts** | Solidity, Zama FHEVM, OpenZeppelin |
| **Frontend** | Next.js 15, Wagmi, Viem, RainbowKit, Tailwind CSS 4 |
| **Animation** | Framer Motion |
| **FHE SDK** | @fhevm/sdk (WASM-based) |
| **Oracle** | Chainlink Automation |
| **Tooling** | Foundry, fhevm-forge |

---

## 📜 Development Rules (FHEVM)

When contributing to Last Key, you MUST follow these FHEVM-specific patterns:

1. **`allowThis()` is Mandatory**: Call it immediately after every `fromExternal()` or FHE operation.
2. **No FHE in `view`**: FHE operations are computationally expensive and must be state-changing transactions.
3. **Use `FHE.select()`**: Never use `if/else` logic based on encrypted values. Use `FHE.select` to choose between ciphertexts.
4. **ACL Protection**: Grant access to handles (`FHE.allow`) only to the necessary actors (e.g., the Executor) and only at the point of execution.

Refer to [AGENT.md](./AGENT.md) for a detailed technical guide on FHEVM development patterns used in this project.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with ❤️ for the Zama FHEVM Hackathon.*
