import { publicDecrypt } from "./decrypt";
import { FhevmError }    from "./errors";
import type { ChainKey } from "./config";

// ─── Gateway Callback Resolution ─────────────────────────────────────────────
//
// When a contract calls Gateway.requestDecryption(), the decryption result
// arrives as a callback transaction 2-5 seconds later on Sepolia.
//
// CRITICAL (FHEVM-009): The resolver contract function requires 3 arguments:
//   1. The identifying key (e.g. borrower address, auctionId)
//   2. The ABI-encoded clear values
//   3. The decryption proof
//
// Passing only 1 arg (the key) will revert silently. Always pass all 3.

const POLL_INTERVAL_MS   = 2_000;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Poll for a contract event (use to detect when Gateway callback has fired).
 */
export async function pollForEvent(
  contract:  { on: Function; off: Function },
  eventName: string,
  filter:    Record<string, string> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      contract.off(eventName, handler);
      reject(new FhevmError(
        `Event '${eventName}' not received within ${timeoutMs}ms. ` +
        `Verify the contract called Gateway.requestDecryption() and Sepolia gateway is reachable.`
      ));
    }, timeoutMs);

    const handler = (...args: unknown[]) => {
      const event = args[args.length - 1] as { args?: Record<string, string> };
      const matches = Object.entries(filter).every(
        ([k, v]) => event.args?.[k]?.toLowerCase() === v.toLowerCase()
      );
      if (!matches) return;

      clearTimeout(timer);
      contract.off(eventName, handler);
      resolve(event);
    };

    contract.on(eventName, handler);
  });
}

/**
 * Full health check resolve flow — 3-step pattern.
 *
 * Step 1: Get the pending health handle via getPendingHealthHandle()
 * Step 2: Call publicDecrypt() via Relayer SDK
 * Step 3: Call resolveHealthCheck(borrower, clearValue) on-chain
 */
export async function resolveHealthCheck(
  vault:    { getPendingHealthHandle: Function; resolveHealthCheck: Function; connect: Function },
  borrower: string,
  signer:   unknown,
  chain:    ChainKey = "sepolia"
): Promise<{ isUndercollateralized: boolean }> {
  const handle: bigint = await vault.getPendingHealthHandle(borrower);
  if (handle === 0n) {
    throw new FhevmError(
      `No pending health check for ${borrower}. ` +
      `Call requestHealthCheck(borrower) first.`
    );
  }

  const { clearValues } = await publicDecrypt([handle], chain);

  const tx = await (vault.connect(signer) as typeof vault).resolveHealthCheck(
    borrower,
    clearValues[0]
  );
  await (tx as { wait: Function }).wait();

  // clearValues[0]: 0n = healthy, 1n = undercollateralized
  return { isUndercollateralized: clearValues[0] === 1n };
}

/**
 * Full auction bid resolve flow. Same 3-step pattern as health check.
 */
export async function resolveAuctionBid(
  auction:   { getPendingBidHandle: Function; resolveBid: Function; connect: Function },
  auctionId: bigint,
  bidder:    string,
  signer:    unknown,
  chain:     ChainKey = "sepolia"
): Promise<{ bidWon: boolean; settlePrice: bigint }> {
  const handle: bigint = await auction.getPendingBidHandle(auctionId, bidder);
  if (handle === 0n) {
    throw new FhevmError(`No pending bid for ${bidder} on auction ${auctionId}`);
  }

  const { clearValues } = await publicDecrypt([handle], chain);

  const tx = await (auction.connect(signer) as typeof auction).resolveBid(
    auctionId,
    bidder,
    clearValues[0]
  );
  await (tx as { wait: Function }).wait();

  return { bidWon: clearValues[0] === 1n, settlePrice: clearValues[1] ?? 0n };
}
