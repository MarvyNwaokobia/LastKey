import { Wallet, JsonRpcProvider, type Contract } from "ethers";
import {
  getFhevmInstance,
  encryptUint64, encryptBatch,
  publicDecrypt,
  resolveHealthCheck, resolveAuctionBid,
  type ChainKey
} from "@fhevm/sdk";

/**
 * Headless FHEVM runtime for autonomous agents.
 * Use this in monitor agents, bidder agents, and server-side scripts.
 *
 * Unlike the browser SDK, this does not require MetaMask or wallet injection.
 * It uses an ethers Wallet with a private key from environment variables.
 *
 * Usage:
 *   const agent = new FhevmAgent(process.env.SEPOLIA_RPC_URL!, process.env.AGENT_KEY!);
 *   const { handle, inputProof } = await agent.encryptUint64(2000n, vaultAddress);
 */
export class FhevmAgent {
  public  readonly wallet:   Wallet;
  private readonly provider: JsonRpcProvider;
  private readonly chain:    ChainKey;

  constructor(rpcUrl: string, privateKey: string, chain: ChainKey = "sepolia") {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet   = new Wallet(privateKey, this.provider);
    this.chain    = chain;
  }

  get address(): string {
    return this.wallet.address;
  }

  async encryptUint64(value: bigint, contractAddress: string) {
    const r = await encryptUint64(value, contractAddress, this.wallet.address, this.chain);
    return { handle: r.handles[0], inputProof: r.inputProof };
  }

  async encryptBatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: Array<{ type: string; value: bigint | boolean | string }>,
    contractAddress: string
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return encryptBatch(inputs as any, contractAddress, this.wallet.address, this.chain);
  }

  async publicDecrypt(handles: bigint[]) {
    return publicDecrypt(handles, this.chain);
  }

  async resolveHealthCheck(vault: Contract, borrower: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resolveHealthCheck(vault as any, borrower, this.wallet, this.chain);
  }

  async resolveAuctionBid(auction: Contract, auctionId: bigint, bidder: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resolveAuctionBid(auction as any, auctionId, bidder, this.wallet, this.chain);
  }
}
