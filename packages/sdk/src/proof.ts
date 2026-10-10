import { decodeEventLog, encodeAbiParameters, keccak256, toHex, type Address, type Hex, type PublicClient } from 'viem';
import { identityAbi, reputationAbi, vaultAbi } from './abi';
import { addressesFor, DEFAULT_CHAIN_ID, KINDS, REASONS, type ChainId, type Entry, type Mandate } from './vault';

/**
 * On-chain proof helpers.
 *
 * Every vault action appends an Entry to `_history[id]` and folds it into a running hash:
 *   lastHash = keccak256(abi.encode(lastHash, kind, reason, uint64 at, address who, uint128 amount, bytes32 ref))
 * (see TaskPayVault._log). The chain starts at bytes32(0). Re-computing it from the stored
 * entries and landing on `mandate.lastHash` proves no entry was edited, dropped or reordered.
 */

export const ZERO_HASH = `0x${'0'.repeat(64)}` as Hex;

const ENTRY_TYPES = [
  { type: 'bytes32' }, // previous lastHash
  { type: 'uint8' }, // Kind (enum)
  { type: 'uint8' }, // Reason (enum)
  { type: 'uint64' }, // at (block.timestamp)
  { type: 'address' }, // who / counterparty
  { type: 'uint128' }, // amount
  { type: 'bytes32' }, // ref
] as const;

/** Hash of one history entry given the previous hash, exactly as TaskPayVault._log computes it. */
export function entryHash(prev: Hex, e: Pick<Entry, 'kind' | 'reason' | 'at' | 'counterparty' | 'amount' | 'ref'>): Hex {
  const kind = KINDS.indexOf(e.kind);
  const reason = REASONS.indexOf(e.reason);
  if (kind < 0 || reason < 0) throw new Error(`unknown kind/reason: ${e.kind}/${e.reason}`);
  return keccak256(encodeAbiParameters(ENTRY_TYPES, [prev, kind, reason, BigInt(e.at), e.counterparty, e.amount, e.ref]));
}

export type EntryCheck = { index: number; computed: Hex; stored: Hex; ok: boolean };

export type HistoryProof = {
  /** true when every per-entry hash matches and the final hash equals mandate.lastHash */
  ok: boolean;
  /** hash recomputed locally from the entries */
  computed: Hex;
  /** mandate.lastHash as stored by the contract */
  onchain: Hex;
  length: number;
  /** index of the first entry whose stored hash does not match, or null */
  firstMismatch: number | null;
  rows: EntryCheck[];
};

/** Recomputes the hash chain from the on-chain entries and compares it to mandate.lastHash. */
export function verifyHistory(entries: Entry[], mandate: Pick<Mandate, 'lastHash'>): HistoryProof {
  let prev = ZERO_HASH;
  let firstMismatch: number | null = null;
  const rows: EntryCheck[] = entries.map((e, i) => {
    const computed = entryHash(prev, e);
    const ok = computed.toLowerCase() === e.hash.toLowerCase();
    if (!ok && firstMismatch === null) firstMismatch = i;
    prev = computed;
    return { index: e.index ?? i, computed, stored: e.hash, ok };
  });
  const ok = firstMismatch === null && prev.toLowerCase() === mandate.lastHash.toLowerCase();
  return { ok, computed: prev, onchain: mandate.lastHash, length: entries.length, firstMismatch, rows };
}

// ------------------------------------------------------- off-chain step log

/** logHash for the web app's step log (browser localStorage): keccak256(JSON.stringify(steps)). */
export function hashSteps(steps: unknown[]): Hex {
  return keccak256(toHex(JSON.stringify(steps)));
}

/** logHash for the CLI/MCP step log: keccak256 of the raw ~/.taskpay/logs/<id>.jsonl file text. */
export function hashLogText(text: string): Hex {
  return keccak256(toHex(text));
}

/** Checks a local step log (array from the browser, or raw .jsonl text) against mandate.logHash. */
export function verifyLogHash(log: unknown[] | string, mandate: Pick<Mandate, 'logHash'>) {
  const computed = typeof log === 'string' ? hashLogText(log) : hashSteps(log);
  return { ok: computed.toLowerCase() === mandate.logHash.toLowerCase(), computed, onchain: mandate.logHash };
}

// ------------------------------------------------------ tx hashes via logs

/** First block whose timestamp is >= ts (interpolation + bisection; ~10-20 getBlock calls). */
export async function blockAtOrAfter(pc: PublicClient, ts: number): Promise<bigint> {
  const latest = await pc.getBlock({ blockTag: 'latest' });
  if (BigInt(ts) >= latest.timestamp) return latest.number;
  let lo = { n: 0n, t: (await pc.getBlock({ blockNumber: 0n })).timestamp };
  let hi = { n: latest.number, t: latest.timestamp };
  if (BigInt(ts) <= lo.t) return 0n;
  const target = BigInt(ts);
  for (let step = 0; hi.n - lo.n > 1n && step < 80; step++) {
    let mid: bigint;
    if (step % 2 === 0 && hi.t > lo.t) {
      mid = lo.n + ((hi.n - lo.n) * (target - lo.t)) / (hi.t - lo.t);
    } else {
      mid = (lo.n + hi.n) / 2n;
    }
    if (mid <= lo.n) mid = lo.n + 1n;
    if (mid >= hi.n) mid = hi.n - 1n;
    const b = await pc.getBlock({ blockNumber: mid });
    if (b.timestamp < target) lo = { n: mid, t: b.timestamp };
    else hi = { n: mid, t: b.timestamp };
  }
  return hi.n;
}

export type EntryTx = { index: number; txHash: Hex; blockNumber: bigint };

/**
 * Finds the transaction that wrote each history entry by reading the vault's EntryAdded logs.
 * The public RPC limits eth_getLogs to 100-block ranges, so for each entry not yet found we
 * jump to the block matching its timestamp and scan one 100-block window from there.
 */
export async function findEntryTxs(
  pc: PublicClient,
  id: bigint,
  entries: Pick<Entry, 'index' | 'at'>[],
  chainId: ChainId = DEFAULT_CHAIN_ID,
  opts: { window?: bigint } = {},
): Promise<Map<number, EntryTx>> {
  const vault = addressesFor(chainId).vault!;
  const window = opts.window ?? 100n;
  const found = new Map<number, EntryTx>();
  for (const e of entries) {
    if (found.has(e.index)) continue;
    const from = await blockAtOrAfter(pc, e.at);
    const logs = await pc.getContractEvents({
      address: vault,
      abi: vaultAbi,
      eventName: 'EntryAdded',
      args: { id },
      fromBlock: from,
      toBlock: from + window - 1n,
    } as any);
    for (const l of logs as any[]) {
      const idx = Number(l.args.index);
      if (!found.has(idx)) found.set(idx, { index: idx, txHash: l.transactionHash, blockNumber: l.blockNumber });
    }
  }
  return found;
}

/** ERC-8004 feedback the vault wrote in a given transaction (the close/reclaim tx). */
export async function feedbackInTx(pc: PublicClient, txHash: Hex, chainId: ChainId = DEFAULT_CHAIN_ID) {
  const a = addressesFor(chainId);
  const receipt = await pc.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== a.reputationRegistry.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: reputationAbi, data: log.data, topics: log.topics }) as any;
      if (ev.eventName !== 'NewFeedback') continue;
      return {
        agentId: ev.args.agentId as bigint,
        client: ev.args.clientAddress as Address,
        value: Number(ev.args.value) / 10 ** Number(ev.args.valueDecimals),
        tag1: ev.args.tag1 as string,
        tag2: ev.args.tag2 as string,
        feedbackHash: ev.args.feedbackHash as Hex,
      };
    } catch {
      /* not a feedback event */
    }
  }
  return null;
}

/** Checks that an ERC-8004 agent id is registered and controlled by the mandate's agent wallet. */
export async function checkAgentIdentity(pc: PublicClient, agentId: bigint, agent: Address, chainId: ChainId = DEFAULT_CHAIN_ID) {
  const reg = addressesFor(chainId).identityRegistry;
  const read = (functionName: 'ownerOf' | 'getAgentWallet') =>
    pc.readContract({ address: reg, abi: identityAbi, functionName, args: [agentId] } as any).catch(() => null) as Promise<Address | null>;
  const [owner, wallet] = await Promise.all([read('ownerOf'), read('getAgentWallet')]);
  const eq = (x: Address | null) => !!x && x.toLowerCase() === agent.toLowerCase();
  return { agentId, owner, wallet, ok: eq(owner) || eq(wallet) };
}
