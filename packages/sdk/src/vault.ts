import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  encodeFunctionData,
  keccak256,
  stringToHex,
  hexToString,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { sendRawTransactionSync } from 'viem/actions';
import { vaultAbi } from './abi';
import { addressesJson } from './addresses';

export const NATIVE = '0x0000000000000000000000000000000000000000' as const;
export const NO_AGENT = 2n ** 256n - 1n;

export type ChainId = 10143 | 143;
export type Addresses = {
  vault: Address | null;
  identityRegistry: Address;
  reputationRegistry: Address;
  explorer: string;
  rpc: string;
};

export const DEFAULT_CHAIN_ID: ChainId = 10143;

export function addressesFor(chainId: ChainId = DEFAULT_CHAIN_ID): Addresses {
  return (addressesJson as Record<string, Addresses>)[String(chainId)];
}

export function chainFor(chainId: ChainId = DEFAULT_CHAIN_ID) {
  return chainId === 143 ? monad : monadTestnet;
}

export function explorerTx(hash: string, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return `${addressesFor(chainId).explorer}/tx/${hash}`;
}

export function explorerAddress(addr: string, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return `${addressesFor(chainId).explorer}/address/${addr}`;
}

export function publicClientFor(chainId: ChainId = DEFAULT_CHAIN_ID, rpc?: string): PublicClient {
  // Reads made in the same tick are batched into one multicall, which keeps us under the public RPC rate limit.
  return createPublicClient({ chain: chainFor(chainId), batch: { multicall: { wait: 16 } }, transport: http(rpc ?? addressesFor(chainId).rpc, { retryCount: 3, retryDelay: 400 }) }) as PublicClient;
}

export function walletClientFor(account: Account, chainId: ChainId = DEFAULT_CHAIN_ID, rpc?: string): WalletClient {
  return createWalletClient({ account, chain: chainFor(chainId), transport: http(rpc ?? addressesFor(chainId).rpc) });
}

// ------------------------------------------------------------------ enums

export const KINDS = [
  'Created',
  'Paid',
  'Blocked',
  'ApprovalRequested',
  'ApprovalConfirmed',
  'ApprovalRejected',
  'TopUpRequested',
  'TopUpApproved',
  'TopUpDeclined',
  'Frozen',
  'Unfrozen',
  'Closed',
  'Reclaimed',
] as const;
export type Kind = (typeof KINDS)[number];

export const REASONS = [
  'NONE',
  'NOT_OPEN',
  'EXPIRED',
  'FROZEN',
  'MERCHANT_NOT_ALLOWED',
  'OVER_PAYMENT_CAP',
  'OVER_BUDGET',
  'VELOCITY',
] as const;
export type Reason = (typeof REASONS)[number];

export const REASON_TEXT: Record<Reason, string> = {
  NONE: '',
  NOT_OPEN: 'task is closed',
  EXPIRED: 'task expired',
  FROZEN: 'agent or task is frozen',
  MERCHANT_NOT_ALLOWED: 'merchant not on this task',
  OVER_PAYMENT_CAP: 'over the per-payment cap',
  OVER_BUDGET: 'over the remaining budget',
  VELOCITY: 'too many payments in a minute',
};

export const STATUSES = ['None', 'Open', 'Closed'] as const;

// ----------------------------------------------------------------- types

export type Mandate = {
  id: bigint;
  owner: Address;
  agent: Address;
  token: Address;
  agentId: bigint;
  budget: bigint;
  originalBudget: bigint;
  spent: bigint;
  remaining: bigint;
  perPaymentCap: bigint;
  toppedUp: bigint;
  pendingTopUp: bigint;
  expiry: number;
  createdAt: number;
  purposeHash: Hex;
  draftId: Hex;
  logHash: Hex;
  lastHash: Hex;
  status: (typeof STATUSES)[number];
  frozen: boolean;
  blocked: number;
  payees: Address[];
  pendingPayment: { payee: Address; amount: bigint; ref: Hex } | null;
};

export type Entry = {
  index: number;
  kind: Kind;
  reason: Reason;
  at: number;
  counterparty: Address;
  amount: bigint;
  ref: Hex;
  hash: Hex;
};

// ----------------------------------------------------------------- reads

export async function getMandate(pc: PublicClient, id: bigint, chainId: ChainId = DEFAULT_CHAIN_ID): Promise<Mandate | null> {
  const vault = addressesFor(chainId).vault!;
  const [m, payees, pending] = await Promise.all([
    pc.readContract({ address: vault, abi: vaultAbi, functionName: 'getMandate', args: [id] }),
    pc.readContract({ address: vault, abi: vaultAbi, functionName: 'getPayees', args: [id] }),
    pc.readContract({ address: vault, abi: vaultAbi, functionName: 'pendingPayment', args: [id] }),
  ]);
  const mm = m as any;
  if (Number(mm.status) === 0) return null;
  const [pPayee, pAmount, pRef] = pending as readonly [Address, bigint, Hex];
  return {
    id,
    owner: mm.owner,
    agent: mm.agent,
    token: mm.token,
    agentId: mm.agentId,
    budget: mm.budget,
    originalBudget: mm.originalBudget,
    spent: mm.spent,
    remaining: (mm.budget as bigint) - (mm.spent as bigint),
    perPaymentCap: mm.perPaymentCap,
    toppedUp: mm.toppedUp,
    pendingTopUp: mm.pendingTopUp,
    expiry: Number(mm.expiry),
    createdAt: Number(mm.createdAt),
    purposeHash: mm.purposeHash,
    draftId: mm.draftId,
    logHash: mm.logHash,
    lastHash: mm.lastHash,
    status: STATUSES[Number(mm.status)],
    frozen: mm.frozen,
    blocked: Number(mm.blocked),
    payees: [...(payees as Address[])],
    pendingPayment: pAmount > 0n ? { payee: pPayee, amount: pAmount, ref: pRef } : null,
  };
}

export async function getHistory(pc: PublicClient, id: bigint, chainId: ChainId = DEFAULT_CHAIN_ID): Promise<Entry[]> {
  const rows = (await pc.readContract({
    address: addressesFor(chainId).vault!,
    abi: vaultAbi,
    functionName: 'getHistory',
    args: [id],
  })) as readonly any[];
  return rows.map((r, index) => ({
    index,
    kind: KINDS[Number(r.kind)],
    reason: REASONS[Number(r.reason)],
    at: Number(r.at),
    counterparty: r.counterparty,
    amount: r.amount,
    ref: r.ref,
    hash: r.hash,
  }));
}

export async function mandatesOf(pc: PublicClient, owner: Address, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return (await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'mandatesOf', args: [owner] })) as bigint[];
}

export async function mandatesOfAgent(pc: PublicClient, agent: Address, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return (await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'mandatesOfAgent', args: [agent] })) as bigint[];
}

export async function findByDraft(pc: PublicClient, draftId: Hex, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return (await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'findByDraft', args: [draftId] })) as bigint;
}

export async function openExpired(pc: PublicClient, max = 20, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return (await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'openExpired', args: [BigInt(max)] })) as bigint[];
}

export async function checkPayment(pc: PublicClient, id: bigint, payee: Address, amount: bigint, chainId: ChainId = DEFAULT_CHAIN_ID): Promise<Reason> {
  const r = await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'check', args: [id, payee, amount] });
  return REASONS[Number(r)];
}

export async function feeFor(pc: PublicClient, amount: bigint, chainId: ChainId = DEFAULT_CHAIN_ID) {
  return (await pc.readContract({ address: addressesFor(chainId).vault!, abi: vaultAbi, functionName: 'feeFor', args: [amount] })) as bigint;
}

// ---------------------------------------------------------------- writes

export type TxResult = { hash: Hex; receipt: TransactionReceipt; settleMs: number; ok: boolean };

/**
 * Sends a vault call and returns once the receipt is in. The transaction is signed
 * locally first, so its hash is known before broadcast; it is then sent with Monad's
 * eth_sendRawTransactionSync (receipt in the same call). If that times out we only
 * ever wait on the same hash, so a transaction is never sent twice.
 */
export async function vaultWrite(
  wc: WalletClient,
  pc: PublicClient,
  functionName: string,
  args: readonly unknown[],
  opts: { value?: bigint; chainId?: ChainId } = {},
): Promise<TxResult> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const address = addressesFor(chainId).vault!;
  const account = wc.account!;
  const call = { address, abi: vaultAbi, functionName: functionName as any, args: args as any, account, value: opts.value } as any;

  // Pre-broadcast steps may be retried safely.
  let serialized: Hex | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3 && !serialized; attempt++) {
    try {
      await pc.simulateContract(call);
      const gas = await pc.estimateContractGas(call);
      const data = encodeFunctionData({ abi: vaultAbi, functionName: functionName as any, args: args as any });
      const req = await wc.prepareTransactionRequest({
        account,
        chain: wc.chain,
        to: address,
        data,
        value: opts.value,
        gas: gas + gas / 10n, // Monad charges the gas limit: keep it tight
        nonce: await pc.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      } as any);
      serialized = await wc.signTransaction(req as any);
    } catch (e: any) {
      lastErr = e;
      if (String(e?.message ?? e).match(/revert|insufficient funds/i)) throw e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  if (!serialized) throw lastErr;

  const hash = keccak256(serialized);
  const t0 = Date.now();
  let receipt: TransactionReceipt;
  try {
    receipt = (await sendRawTransactionSync(pc as any, { serializedTransaction: serialized, timeout: 8_000 } as any)) as TransactionReceipt;
  } catch (e: any) {
    const msg = String(e?.shortMessage ?? e?.message ?? e);
    if (/nonce too low|already known/i.test(msg) || /timeout|timed out|took too long/i.test(msg)) {
      receipt = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    } else {
      // Not broadcast (or rejected): try the classic path once with the same signed bytes.
      try {
        await pc.sendRawTransaction({ serializedTransaction: serialized });
      } catch (e2: any) {
        if (!/already known|nonce too low/i.test(String(e2?.message ?? e2))) throw e2;
      }
      receipt = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    }
  }
  return { hash: receipt.transactionHash, receipt, settleMs: Date.now() - t0, ok: receipt.status === 'success' };
}

// --------------------------------------------------------------- helpers

export function ref32(text: string): Hex {
  return stringToHex(text.slice(0, 31), { size: 32 });
}

export function refText(ref: Hex): string {
  try {
    return hexToString(ref, { size: 32 }).replace(/\0+$/g, '');
  } catch {
    return ref;
  }
}

export function mon(wei: bigint, digits = 4): string {
  const n = Number(formatEther(wei));
  return `${n.toLocaleString('en-US', { maximumFractionDigits: digits })} MON`;
}

export function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
