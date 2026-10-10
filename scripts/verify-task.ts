#!/usr/bin/env -S npx tsx
/**
 * Independently verify one TaskPay task straight from Monad testnet. No backend, no database:
 * everything below is read from the TaskPayVault contract and the ERC-8004 registries.
 *
 *   npx tsx scripts/verify-task.ts <taskId> [--no-tx]
 *
 * --no-tx skips the EntryAdded log scan that finds each entry's transaction (faster).
 */
import type { Address, Hex } from 'viem';
import {
  addressesFor,
  checkAgentIdentity,
  describeEntry,
  explorerAddress,
  explorerTx,
  feedbackInTx,
  findEntryTxs,
  getHistory,
  getMandate,
  mon,
  publicClientFor,
  refText,
  short,
  vaultAbi,
  verifyHistory,
  NATIVE,
  NO_AGENT,
  type EntryTx,
} from '@taskpay/sdk';

const CHAIN_ID = 10143 as const;
const args = process.argv.slice(2);
const idArg = args.find((a) => !a.startsWith('--'));
if (!idArg || !/^\d+$/.test(idArg)) {
  console.error('usage: npx tsx scripts/verify-task.ts <taskId> [--no-tx]');
  process.exit(1);
}
const id = BigInt(idArg);
const scanTx = !args.includes('--no-tx');

const A = addressesFor(CHAIN_ID);
const VAULT = A.vault as Address;
const pc = publicClientFor(CHAIN_ID);

const STORE = (process.env.NEXT_PUBLIC_STORE_PAYTO ?? '0x27dd67D92c1754D3F30b9D7965D8Cf6cf2B3D0be').toLowerCase();
const PRICECHECK = (process.env.NEXT_PUBLIC_PRICECHECK_PAYTO ?? '0x1344fb00634e7141e8Ed551aB00893b710245bce').toLowerCase();
const DEAD = '0x000000000000000000000000000000000000dead';

const ok = (b: boolean) => (b ? 'OK  ' : 'FAIL');
const line = (s = '') => console.log(s);
const title = (s: string) => line(`\n== ${s} ${'='.repeat(Math.max(0, 70 - s.length))}`);
const when = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

async function main() {
  const m = await getMandate(pc, id, CHAIN_ID);
  if (!m) {
    console.error(`Task ${id} does not exist on vault ${VAULT}`);
    process.exit(1);
  }
  const [entries, feeBps, treasury, vaultBal] = await Promise.all([
    getHistory(pc, id, CHAIN_ID),
    pc.readContract({ address: VAULT, abi: vaultAbi, functionName: 'feeBps' }) as Promise<number>,
    pc.readContract({ address: VAULT, abi: vaultAbi, functionName: 'treasury' }) as Promise<Address>,
    pc.getBalance({ address: VAULT }),
  ]);

  const names: Record<string, string> = {
    [m.owner.toLowerCase()]: 'Owner',
    [m.agent.toLowerCase()]: 'Agent',
    [STORE]: 'BlockMart',
    [PRICECHECK]: 'PriceCheck API',
    [DEAD]: '0x…dEaD (attacker)',
    [treasury.toLowerCase()]: 'TaskPay treasury',
    [VAULT.toLowerCase()]: 'TaskPayVault',
  };
  const who = (a: string) => names[a.toLowerCase()] ?? short(a);

  // ------------------------------------------------------------ mandate
  title(`Task #${id} on TaskPayVault ${short(VAULT)} (Monad testnet)`);
  line(`Status         ${m.status}${m.frozen ? ' (frozen)' : ''}   blocked strikes: ${m.blocked}/3`);
  line(`Owner          ${m.owner}`);
  line(`Agent          ${m.agent}${m.agentId !== NO_AGENT ? `   ERC-8004 agent #${m.agentId}` : ''}`);
  line(`Token          ${m.token === NATIVE ? 'MON (native)' : m.token}`);
  line(`Budget         ${mon(m.budget, 6)}  (original ${mon(m.originalBudget, 6)} + top-ups ${mon(m.toppedUp, 6)})`);
  line(`Spent          ${mon(m.spent, 6)}  (payments + ${feeBps / 100}% vault fee)`);
  line(`Remaining      ${mon(m.remaining, 6)}`);
  line(`Per-pay cap    ${mon(m.perPaymentCap, 6)}`);
  line(`Created        ${when(m.createdAt)}`);
  line(`Expires        ${when(m.expiry)}`);
  line(`Allowed payees ${m.payees.map((p) => `${who(p)} ${short(p)}`).join(', ')}`);
  line(`purposeHash    ${m.purposeHash}`);
  line(`logHash        ${m.logHash}${/^0x0+$/.test(m.logHash) ? '  (none)' : '  (keccak of the agent step log, set on close)'}`);
  line(`lastHash       ${m.lastHash}`);

  // ------------------------------------------------------------ tx lookup
  let txs = new Map<number, EntryTx>();
  const signer = new Map<string, Address>();
  if (scanTx && entries.length) {
    try {
      txs = await findEntryTxs(pc, id, entries, CHAIN_ID);
      await Promise.all(
        [...new Set([...txs.values()].map((t) => t.txHash))].map(async (h) => {
          const tx = await pc.getTransaction({ hash: h });
          signer.set(h, tx.from);
        }),
      );
    } catch (e: any) {
      line(`\n(tx lookup skipped: ${e?.shortMessage ?? e?.message ?? e})`);
    }
  }

  // ------------------------------------------------------------ history
  title(`On-chain history (${entries.length} entries, getHistory(${id}))`);
  for (const e of entries) {
    const d = describeEntry(e, m, names);
    const txt = refText(e.ref);
    const label = e.kind === 'Created' ? 'purposeHash' : e.kind === 'Closed' ? 'logHash' : 'ref';
    const ref = /^0x0+$/.test(e.ref) ? '' : txt && /^[\x20-\x7e]+$/.test(txt) ? `  ref="${txt}"` : `  ${label}=${e.ref}`;
    line(`#${e.index}  ${when(e.at)}  ${d.text}`);
    line(`     kind=${e.kind}${e.reason !== 'NONE' ? ` reason=${e.reason}` : ''}  counterparty=${who(e.counterparty)}  amount=${mon(e.amount, 6)}${ref}`);
    const t = txs.get(e.index);
    if (t) {
      const from = signer.get(t.txHash);
      line(`     tx ${explorerTx(t.txHash, CHAIN_ID)}  (block ${t.blockNumber}${from ? `, signed by ${who(from)}` : ''})`);
    }
  }

  // ------------------------------------------------------------ hash chain
  title('Hash-chain check');
  const proof = verifyHistory(entries, m);
  for (const r of proof.rows) line(`  ${ok(r.ok)} entry #${r.index}  ${r.stored}`);
  line(`  recomputed lastHash ${proof.computed}`);
  line(`  on-chain   lastHash ${proof.onchain}`);
  line(`  ${proof.ok ? 'VERIFIED: history is complete and unaltered' : `MISMATCH${proof.firstMismatch !== null ? ` at entry #${proof.firstMismatch}` : ''}`}`);

  // ------------------------------------------------------------ money reconciliation
  title('Money reconciliation (from the history alone)');
  const fee = (x: bigint) => (x * BigInt(feeBps)) / 10_000n;
  const pays = entries.filter((e) => e.kind === 'Paid' || e.kind === 'ApprovalConfirmed');
  const paid = pays.reduce((s, e) => s + e.amount, 0n);
  const fees = pays.reduce((s, e) => s + fee(e.amount), 0n);
  const topups = entries.filter((e) => e.kind === 'TopUpApproved').reduce((s, e) => s + e.amount, 0n);
  const created = entries.find((e) => e.kind === 'Created')?.amount ?? 0n;
  const end = entries.find((e) => e.kind === 'Closed' || e.kind === 'Reclaimed');
  const byPayee = new Map<string, bigint>();
  for (const e of pays) byPayee.set(who(e.counterparty), (byPayee.get(who(e.counterparty)) ?? 0n) + e.amount);
  for (const [k, v] of byPayee) line(`  paid to ${k.padEnd(16)} ${mon(v, 6)}`);
  line(`  vault fees            ${mon(fees, 6)}`);
  line(`  blocked attempts      ${entries.filter((e) => e.kind === 'Blocked').length} (no money moved)`);
  line(`  ${ok(created + topups === m.budget)} locked ${mon(created, 6)} + top-ups ${mon(topups, 6)} = budget ${mon(m.budget, 6)}`);
  line(`  ${ok(paid + fees === m.spent)} payments + fees = spent ${mon(m.spent, 6)}`);
  if (end) line(`  ${ok(end.amount === m.budget - m.spent)} refunded to owner ${mon(end.amount, 6)} = budget - spent`);

  // ------------------------------------------------------------ ERC-8004
  title('ERC-8004 identity and reputation');
  if (m.agentId === NO_AGENT) {
    line('  task has no ERC-8004 agent id');
  } else {
    const idc = await checkAgentIdentity(pc, m.agentId, m.agent, CHAIN_ID);
    line(`  ${ok(idc.ok)} agent #${m.agentId} in IdentityRegistry ${short(A.identityRegistry)}: owner ${idc.owner ?? '?'}, wallet ${idc.wallet ?? '?'}`);
    const endTx = end ? txs.get(end.index) : undefined;
    if (endTx) {
      const fb = await feedbackInTx(pc, endTx.txHash as Hex, CHAIN_ID);
      if (fb) {
        line(`  ${ok(fb.client.toLowerCase() === VAULT.toLowerCase() && fb.feedbackHash.toLowerCase() === m.logHash.toLowerCase())} feedback written in the close tx by ${who(fb.client)}: score ${fb.value}, tags "${fb.tag1}"/"${fb.tag2}", feedbackHash = logHash`);
      } else line('  no NewFeedback event found in the close tx');
    } else if (end) line('  (close tx not located; run without --no-tx to check the feedback event)');
    else line('  task still open: feedback is written on close');
  }

  // ------------------------------------------------------------ links
  title('Check it yourself');
  line(`  Vault MON balance (all open tasks): ${mon(vaultBal, 6)}`);
  line(`  Vault contract  ${explorerAddress(VAULT, CHAIN_ID)}#readContract`);
  line(`  Owner           ${explorerAddress(m.owner, CHAIN_ID)}`);
  line(`  Agent           ${explorerAddress(m.agent, CHAIN_ID)}`);
  line(`  cast call ${VAULT} "getHistory(uint256)((uint8,uint8,uint64,address,uint128,bytes32,bytes32)[])" ${id} --rpc-url ${A.rpc}`);
  line('');
  process.exit(proof.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
