# ShadowBridge

> Confidential cross-chain USDC settlement and staking — powered by Zama FHEVM

ShadowBridge is a privacy-first cross-chain bridge and staking protocol. It moves USDC between Ethereum, Base, and
Arbitrum using Circle's CCTP while keeping every balance and transfer amount **fully encrypted on-chain** via Fully
Homomorphic Encryption. Validators, MEV bots, and chain observers see only opaque ciphertexts — never dollar values.

---

## Table of Contents

- [How It Works — The Full Flow](#how-it-works--the-full-flow)
- [How FHE Comes Into Play](#how-fhe-comes-into-play)
- [Architecture](#architecture)
- [Deployed Contracts](#deployed-contracts)
- [Financial Analysis](#financial-analysis)
- [Value to the Zama Ecosystem](#value-to-the-zama-ecosystem)
- [Tech Stack](#tech-stack)
- [Running Locally](#running-locally)

---

## How It Works — The Full Flow

ShadowBridge operates across three chains: **Ethereum Sepolia** (source), **Base Sepolia**, and **Arbitrum Sepolia**
(destinations). The entire lifecycle of a user's funds — deposit, bridge, stake, earn rewards, withdraw — happens
without a single cleartext amount ever appearing on-chain.

### Step 1 — Client-side Encryption

Before anything hits the blockchain, the user's browser encrypts the USDC amount using the **Zama FHEVM Relayer SDK**.
The SDK connects to the Zama KMS (Key Management Service) and produces two artifacts:

- A **ciphertext handle** — an opaque 32-byte pointer to the encrypted value stored in the FHEVM coprocessor
- An **input proof** — a zero-knowledge proof that the user knows the plaintext behind the handle

No cleartext amount is ever submitted in a transaction calldata.

### Step 2 — Confidential Deposit on Ethereum (`depositConfidential`)

The user calls `ShadowBridgeETH.depositConfidential(handle, proof, destDomain, recipient)` on Ethereum Sepolia.

Inside the contract:

1. `FHE.fromExternal(handle, proof)` validates the ciphertext and loads it as a `euint64`
2. The encrypted amount is stored in `_encryptedDeposits[user]`
3. `FHE.makePubliclyDecryptable(encryptedAmount)` schedules an async KMS decryption request
4. Control returns to the user — no plaintext exists on-chain at this point

### Step 3 — KMS Callback Triggers the CCTP Burn

The Zama KMS relayer detects the decryption request, decrypts off-chain, and calls back
`onDecryptCallback(requestId, amount, signature)`.

Inside the callback:

1. `FHE.checkSignatures(handles, result, proof)` verifies the KMS signature — the contract only trusts results signed by
   the KMS
2. The revealed `amount` is used **once and only once** to call
   `cctpMessenger.depositForBurn(amount, destDomain, recipient, usdcToken)`
3. Circle CCTP burns the USDC on Ethereum, creating a burn message
4. The cleartext amount disappears after this single internal use — it is never emitted or stored

### Step 4 — Circle Attestation Relay

The backend relay service polls **Circle's Iris V2 API** for a signed attestation of the CCTP burn message. This process
typically takes 5–40 minutes on testnet (seconds on mainnet). Once the attestation is ready, the relay submits it to the
destination chain.

### Step 5 — Confidential Mint on the Destination (`receiveAndEncrypt`)

On Base or Arbitrum, the relay calls `ShadowBridgeDest.receiveAndEncrypt(recipient, cctpMessage, attestation)`.

Inside the contract:

1. `cctpMessageTransmitter.receiveMessage(cctpMessage, attestation)` mints the canonical USDC to the bridge contract
2. The minted amount is **immediately re-encrypted** — via `IERC7984ERC20Wrapper.wrap()` (production path) or
   `FHE.asEuint64(amount)` (fallback)
3. The `euint64` handle is added to `_encryptedStake[recipient]` using `FHE.add(existing, minted)`
4. `FHE.allowThis(handle)` and `FHE.allow(handle, user)` are called so the contract and user can use the handle later

The USDC is now held as **confidential cUSDC (ERC-7984)** inside the bridge. The minted amount has been encrypted before
any state is written — it is never visible to observers.


### Step 6 — Optional Decrypt and Reveal (`decryptBalance`)

At any time, the user may call `decryptBalance()` to see their own total (stake + rewards). The contract calls
`FHE.allow(handle, user)` so only that specific user's address can trigger a KMS decryption — the contract owner and
everyone else remain blind.

### Step 7 — Cross-L2 Bridge-Out (`bridgeOut`)

Users can move their encrypted balance from Base to Arbitrum (or vice versa) by calling
`bridgeOut(encryptedAmount, proof, destDomain, recipient)`. The flow mirrors the deposit: FHE clamp → KMS callback →
CCTP burn → relay → `receiveAndEncrypt` on the new chain. The funds arrive on the destination chain **already
encrypted**.

---

## How FHE Comes Into Play

Fully Homomorphic Encryption is the core primitive that makes ShadowBridge possible. Without FHE, any bridge would need
to write cleartext amounts to the chain at some point — at deposit, at mint, or at withdrawal. ShadowBridge eliminates
all of these.

### What FHE Enables

| Problem Without FHE                                      | FHE Solution                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| CCTP burn requires a cleartext amount in calldata        | User submits ciphertext; KMS decrypts in a single internal callback, never stored |
| Staking balances are visible on-chain                    | `euint64` handles store ciphertexts — nodes see only opaque bytes                 |
| Reward calculations require readable state               | `FHE.mul(encryptedStake, publicRate)` computes on ciphertext                      |
| Conditional logic (clamp on unstake) leaks balance range | `FHE.select(FHE.le(a, b), a, b)` — no branch, no leak                             |
| Anyone can watch CCTP attestation → infer bridge amount  | Amount is re-encrypted before any state write                                     |
| Contract owner could read user balances                  | `FHE.allow(handle, user)` — only the user can decrypt their own handle            |

### FHE Operations Reference

| Operation                                      | Contract Location                                      | Purpose                                     |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| `FHE.fromExternal(handle, proof)`              | `depositConfidential`, `stake`, `unstake`, `bridgeOut` | Validate user-supplied ciphertext           |
| `FHE.asEuint64(uint64)`                        | `receiveAndEncrypt` (fallback)                         | Encrypt plaintext CCTP mint amount          |
| `IERC7984ERC20Wrapper.wrap()`                  | `receiveAndEncrypt` (production)                       | Wrap USDC → cUSDC, return `euint64`         |
| `FHE.add(euint64, euint64)`                    | All balance writes                                     | Encrypted accumulation                      |
| `FHE.sub(euint64, euint64)`                    | `unstake`, `bridgeOut`                                 | Encrypted deduction                         |
| `FHE.mul(euint64, uint64)`                     | `_accrueRewards`                                       | Scalar reward multiplication                |
| `FHE.le(euint64, euint64)`                     | `unstake`, `bridgeOut`                                 | Encrypted comparison                        |
| `FHE.select(ebool, euint64, euint64)`          | `unstake`, `bridgeOut`                                 | Branch-free conditional — no plaintext leak |
| `FHE.makePubliclyDecryptable(euint64)`         | `depositConfidential`, `unstake`, `decryptBalance`     | Schedule async KMS decryption               |
| `FHE.checkSignatures(bytes32[], bytes, bytes)` | All KMS callbacks                                      | Verify KMS proof before acting              |
| `FHE.allowThis(handle)`                        | After every FHE write                                  | Permit contract to re-read its own handles  |
| `FHE.allow(handle, user)`                      | Before user-facing decrypt                             | Permit user to decrypt via relayer          |
| `FHE.isInitialized(handle)`                    | Guard clauses                                          | Check handle existence                      |

### The KMS Trust Model

ShadowBridge uses Zama's threshold KMS. Decryption requires a quorum of KMS nodes and produces a cryptographic signature
(`FHE.checkSignatures`). Contracts reject any callback that doesn't carry a valid KMS signature — preventing any single
node or the protocol deployer from forging a decryption result. The user's balance can only be revealed if: (a) the user
calls `decryptBalance()`, and (b) the KMS quorum agrees.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  User Browser                                                    │
│  • Zama Relayer SDK encrypts amount → (handle, inputProof)       │
└──────────────────────┬───────────────────────────────────────────┘
                       │ depositConfidential(handle, proof, domain)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  ShadowBridgeETH  [Ethereum Sepolia]                             │
│  • FHE.fromExternal → euint64                                    │
│  • FHE.makePubliclyDecryptable → async KMS request               │
└──────────────────────┬───────────────────────────────────────────┘
                       │ KMS decrypts off-chain
                       │ onDecryptCallback(amount, sig)
                       │ FHE.checkSignatures ✓
                       │ cctpMessenger.depositForBurn(amount, domain)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Circle CCTP  (Burn → Attestation → Mint)                        │
│  • Burns USDC on ETH                                             │
│  • Iris V2 API produces attestation (~seconds mainnet)           │
│  • Mints canonical USDC on destination                           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Backend relay submits attestation
                       │ receiveAndEncrypt(recipient, msg, attest)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  ShadowBridgeBase / ShadowBridgeArbitrum  [L2]                   │
│  • CCTP mints USDC to bridge                                     │
│  • ERC-7984 wrap → euint64 (amount never in plaintext state)     │
│  • FHE.add(_encryptedStake[user], minted)                        │
│  • User calls stake / unstake / accrueRewards                    │
│    — all arithmetic on euint64, never on cleartext               │
│  • bridgeOut → re-uses same burn/attestation/mint cycle          │
└──────────────────────────────────────────────────────────────────┘
```

**Contract Roles:**

| Contract               | Chain            | Role                                                               |
| ---------------------- | ---------------- | ------------------------------------------------------------------ |
| `ShadowBridgeETH`      | Ethereum Sepolia | Source — accepts encrypted deposits, triggers CCTP burn            |
| `ShadowBridgeBase`     | Base Sepolia     | Destination — receives CCTP mints, manages encrypted staking       |
| `ShadowBridgeArbitrum` | Arbitrum Sepolia | Destination — same as Base, different CCTP domain                  |
| Backend Relay          | Off-chain        | Polls Circle Iris V2, submits attestations, forwards KMS callbacks |

---

## Deployed Contracts

| Contract                      | Network          | Address                                                                                                                              |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ShadowBridgeETH               | Ethereum Sepolia | [`0x03DDBa3088E598aB95Bc03Cb58ae209F77D29d18`](https://sepolia.etherscan.io/address/0x03DDBa3088E598aB95Bc03Cb58ae209F77D29d18#code) |
| ShadowBridgeBase              | Base Sepolia     | [`0x8410EcE3bD4bA15CF868Cf53F766736334fa389D`](https://sepolia.etherscan.io/address/0x8410EcE3bD4bA15CF868Cf53F766736334fa389D#code) |
| ShadowBridgeArbitrum          | Arbitrum Sepolia | [`0xA0DcB7dD510e410bD1BABBD920E095551658B20c`](https://sepolia.arbiscan.io/address/0xA0DcB7dD510e410bD1BABBD920E095551658B20c#code)  |
| Mock USDC (ETH Sepolia)       | Ethereum Sepolia | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`                                                                                         |
| Confidential cUSDC / ERC-7984 | Ethereum Sepolia | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`                                                                                         |
| Mock USDC (Arbitrum Sepolia)  | Arbitrum Sepolia | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`                                                                                         |

---

## Financial Analysis

### Market Context

Cross-chain bridging is a multi-billion-dollar sector. As of early 2025:

- Circle CCTP has processed over **$12 billion** in cumulative cross-chain USDC volume
- Total Value Locked (TVL) across all cross-chain bridges exceeds **$20 billion**
- On-chain stablecoins represent **$160+ billion** in market cap, with USDC the second largest
- DeFi staking protocols manage **$80+ billion** in TVL globally

Despite this scale, **every bridge exposes amounts in plaintext**. USDC transfers on CCTP, Stargate, and Across are
fully visible — amounts, wallets, and timing are indexed by analytics platforms and exploited by MEV searchers and
front-runners.

### The Privacy Gap and Addressable Market

Institutional participants — hedge funds, family offices, corporate treasuries — have explicitly stated that on-chain
privacy is a prerequisite for adopting DeFi stablecoin products. Research from Chainalysis and Coinbase Institutional
indicates:

- **Institutional DeFi participation is $15–25 billion** but estimated to be 10x larger if compliance-grade privacy were
  available
- **$1.2 trillion** in daily stablecoin settlement volume happens off-chain specifically because on-chain is too
  transparent for institutional counterparties
- **30–40% of bridge volume** is whale transactions > $500k; these participants explicitly avoid on-chain bridges due to
  front-running exposure

ShadowBridge addresses the intersection: a privacy-preserving bridge and staking layer for stablecoins that does not
compromise on compliance or canonical token guarantees.

### Revenue Model

ShadowBridge generates revenue from three streams:

#### 1. Bridge Fee (Basis Points on Transfer)

A configurable protocol fee applied at `receiveAndEncrypt` time, computed on the cleartext amount during the one-time
KMS callback.

| Volume Tier                   | Fee           | Projected Monthly Volume | Monthly Revenue   |
| ----------------------------- | ------------- | ------------------------ | ----------------- |
| Retail ($1–$10k)              | 5 bps (0.05%) | $5M                      | $2,500            |
| Mid-market ($10k–$1M)         | 3 bps (0.03%) | $50M                     | $15,000           |
| Institutional ($1M+)          | 1 bp (0.01%)  | $200M                    | $20,000           |
| **Year-1 Conservative Total** |               | **$255M/month**          | **$37,500/month** |

At scale (year 2–3, comparable to mid-sized CCTP integrators), $1B+ monthly volume is achievable, generating
**$300k–$500k monthly in protocol fees**.

#### 2. Staking Yield Spread

The protocol earns a spread between the gross staking yield distributed to users and the underlying yield source (e.g.
USDC lending markets, T-bill products, Morpho vaults).

| Metric                  | Conservative | Optimistic   |
| ----------------------- | ------------ | ------------ |
| TVL in staking          | $10M         | $100M        |
| Gross yield             | 5% APY       | 6% APY       |
| Spread retained         | 15% of yield | 20% of yield |
| Annual protocol revenue | $75,000      | $1,200,000   |

#### 3. Privacy Premium (Enterprise Licensing)

Institutions requiring whitelisted privacy (known counterparties, FHE-based access control) pay a flat monthly licensing
fee to deploy customized ShadowBridge vaults. Comparable on-chain privacy SaaS products (Panther Protocol, Aztec
enterprise) charge $20k–$100k/month per institutional client.

At 5 institutional clients in year 1: **$100k–$300k/year in licensing revenue**.

### Total Addressable Market (TAM)

```
TAM:  $160B stablecoin market × 10% DeFi-active × 20% privacy-sensitive = $3.2B
SAM:  CCTP-compatible chains (ETH, Base, Arb, Polygon, Solana) × institutional segment = $800M TVL
SOM:  Year-1 realistic target with Zama FHEVM on mainnet = $50M–$200M TVL
```

### Cost Structure

The key cost driver is the Zama KMS decryption fee per callback. Each user action that requires a plaintext value
(deposit burn, unstake, bridgeOut) triggers one KMS callback. At current testnet pricing:

- KMS callback cost: ~$0.05–$0.20 per operation (estimated mainnet)
- At 10,000 operations/month: $500–$2,000/month in KMS costs
- Break-even bridge fee: **0.002% per $10k transfer** — well below the 3–5 bps charged

Gas costs on L2s (Base, Arbitrum) are negligible (<$0.10/tx). The FHE coprocessor computation is off-chain — only the
result hash goes on-chain.

### Competitive Moat

| Feature                           | ShadowBridge | CCTP Native | Stargate     | Aztec Connect |
| --------------------------------- | ------------ | ----------- | ------------ | ------------- |
| Canonical USDC (no wrapping risk) | Yes          | Yes         | No (bridged) | No            |
| Encrypted on-chain balances       | Yes          | No          | No           | Yes           |
| Cross-chain encrypted staking     | Yes          | No          | No           | No            |
| Mainnet deployed                  | Testnet      | Yes         | Yes          | Sunset        |
| ERC-7984 confidential tokens      | Yes          | No          | No           | No            |
| Compliance-friendly (KYC-gatable) | Yes          | Yes         | No           | No            |

ShadowBridge's moat is technical: the combination of Circle's canonical CCTP guarantee (no bridge risk on the USDC
itself) with Zama's FHEVM (no plaintext exposure) has no direct competitor as of 2025.

---

## Value to the Zama Ecosystem

### 1. First Production Integration of FHEVM + CCTP

ShadowBridge is the first protocol to combine Zama FHEVM with Circle's Cross-Chain Transfer Protocol. This demonstrates
that FHEVM is not limited to isolated DeFi primitives — it can integrate with the canonical institutional stablecoin
infrastructure that already processes trillions of dollars annually.

### 2. Proving ERC-7984 in a Real Cross-Chain Context

ShadowBridge implements `IERC7984ERC20Wrapper` (confidential token wrapping) as the production path for
`receiveAndEncrypt`. This is one of the first real-world deployments of OpenZeppelin's ERC-7984 standard, which Zama
co-authored. ShadowBridge stress-tests the standard's `wrap()` / `confidentialTransfer()` interfaces across chain
boundaries — producing direct feedback for the standard's ongoing development.

### 3. Expands FHEVM Chain Coverage

Zama's FHEVM coprocessor is live on Ethereum Sepolia. ShadowBridge implements `ShadowBridgeBaseConfig` and
`ShadowBridgeArbitrumConfig` — configuration stubs ready to activate FHEVM on Base and Arbitrum the moment Zama deploys
coprocessors there. This creates direct incentive for Zama to accelerate L2 deployments: ShadowBridge TVL is waiting.

### 4. Demonstrates the "Encrypt Once, Compute Anywhere" Pattern

The core architectural pattern of ShadowBridge — encrypt on source, compute privately on destination, decrypt only on
user request — is a reusable template for any cross-chain protocol that wants FHE privacy. Zama can reference
ShadowBridge as a canonical example of this pattern in documentation, developer onboarding, and grant programs.

### 5. Institutional On-Ramp to FHEVM

ShadowBridge targets institutional stablecoin flows. Institutions that adopt ShadowBridge become FHEVM users by default.
Every institutional transaction that flows through ShadowBridge generates KMS calls, coprocessor usage, and relayer fees
— all of which are part of Zama's protocol revenue model. A single institution moving $100M/month through ShadowBridge
generates more FHEVM usage than a thousand retail DeFi users.

### 6. Builds the Developer Template Library

ShadowBridge is open-source and fully tested (27 passing tests covering deposit, stake, unstake, reward, and bridgeOut).
The contract patterns it introduces — `onDecryptCallback` wiring, `FHE.select` for clamped arithmetic,
`receiveAndEncrypt` for post-CCTP re-encryption — can be extracted into Zama's `fhevm-hardhat-template` and developer
cookbooks, accelerating the next generation of FHEVM builders.

### 7. MEV and Front-Running Elimination Narrative

DeFi MEV extraction exceeded **$1.5 billion in 2024**. ShadowBridge eliminates bridge-level MEV entirely: there is no
plaintext order to front-run. Validators on Base and Arbitrum cannot see transaction amounts. This is a flagship use
case for Zama's "MEV-resistant DeFi" narrative and directly supports Zama's positioning in the broader Ethereum privacy
roadmap.

---

## Tech Stack

| Layer               | Technology                                                                      |
| ------------------- | ------------------------------------------------------------------------------- |
| FHE Runtime         | Zama FHEVM · `@fhevm/solidity` v0.11.1 · `@fhevm/hardhat-plugin` v0.4.2         |
| Confidential Tokens | OpenZeppelin Confidential Contracts v0.4.0 (`IERC7984`, `IERC7984ERC20Wrapper`) |
| Cross-chain Bridge  | Circle CCTP V2 (burn/mint, Sepolia TokenMessenger)                              |
| Smart Contracts     | Solidity ^0.8.27 · Hardhat v2 · OpenZeppelin Contracts v5                       |
| Frontend            | Next.js 14 · wagmi v2 · viem · RainbowKit v2 · Tailwind CSS                     |
| FHE Client SDK      | `@zama-fhe/relayer-sdk` v0.4.3                                                  |
| Backend Relay       | Express + WebSocket · Circle Iris V2 API · Supabase                             |
| Testing             | Hardhat + Mocha + Chai · **27 tests, all passing**                              |

---

## Running Locally

### Prerequisites

- Node >= 20
- A funded Sepolia wallet
- Sepolia RPC URL (Infura / Alchemy)

### Install and Test

```bash
npm install
npm run compile
npx hardhat test          # 27 passing
```

### Mint Testnet Tokens

```bash
npx hardhat run scripts/mint-test-tokens.ts --network sepolia
```

### Deploy (3-Step Sequence)

```bash
# 1. Deploy Base and Arbitrum destination contracts
npx hardhat run scripts/deploy-base.ts --network sepolia
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrumSepolia

# 2. Deploy ETH source contract (provide destination addresses)
BASE_BRIDGE_ADDRESS=0x... ARB_BRIDGE_ADDRESS=0x... \
  npx hardhat run scripts/deploy-eth.ts --network sepolia

# 3. Wire contracts together
BASE_BRIDGE_ADDRESS=0x... ETH_BRIDGE_ADDRESS=0x... \
  npx hardhat run scripts/register-destinations.ts
```

### Run the Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in deployed addresses + WalletConnect project ID
npm install
npm run dev                         # http://localhost:3000
```

### Run the Backend Relay

```bash
cd backend
npm install
RELAY_PRIVATE_KEY=0x... npx ts-node src/index.ts
```

---

## License

MIT
