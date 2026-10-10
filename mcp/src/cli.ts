#!/usr/bin/env -S npx tsx
/**
 * taskpay CLI: inspect mandates and run the demo actions from a terminal.
 *   taskpay status                     agent address, balance, ERC-8004 id
 *   taskpay fund                       get test MON for the agent key's gas from the TaskPay faucet
 *   taskpay register                   register the agent key in the ERC-8004 IdentityRegistry
 *   taskpay list                       this agent's mandates
 *   taskpay draft "<task>" <item> <budget>   draft a mandate (prints the approve link)
 *   taskpay approve <draft_id>         TEST ONLY: approve as the owner using TASKPAY_OWNER_KEY
 *   taskpay buy <mandate_id> <product_id>    quote + pay through TaskGuard
 *   taskpay timeline <mandate_id>      merged on-chain + local timeline
 *   taskpay attack <mandate_id> [addr] compromised agent pays an attacker directly (gets blocked on-chain)
 *   taskpay topup <mandate_id> <amount> <reason>
 *   taskpay approve-topup <mandate_id> TEST ONLY: owner adds the pending top-up
 *   taskpay close <mandate_id>
 *   taskpay reclaim <mandate_id>       anyone can trigger the refund after expiry
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { formatEther, type Address, type Hex } from 'viem';
import { getMandate, mandateArgs, mon, vaultWrite, walletClientFor, explorerTx, type Draft } from '@taskpay/sdk';
import * as rt from './runtime';

const [cmd, ...args] = process.argv.slice(2);
const out = (v: unknown) => console.log(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2));

function ownerWallet() {
  const key = process.env.TASKPAY_OWNER_KEY as Hex | undefined;
  if (!key) throw new Error('Set TASKPAY_OWNER_KEY (test owner) for this command. In the real flow the owner approves in MetaMask.');
  return walletClientFor(privateKeyToAccount(key), rt.CHAIN_ID, rt.RPC);
}

async function main() {
  switch (cmd) {
    case 'status': {
      const bal = await rt.pc.getBalance({ address: rt.agentAccount.address });
      return out({ agent: rt.agentAccount.address, balance: `${formatEther(bal)} MON`, agentId: rt.agentFile.agentId ?? null, home: rt.HOME, web: rt.WEB_URL, vault: rt.addressesFor(rt.CHAIN_ID).vault });
    }
    case 'fund':
      return out(await rt.fundAgent());
    case 'register':
      return out(await rt.ensureAgent());
    case 'list':
      return out(await rt.listMandates());
    case 'draft':
      await rt.ensureAgent();
      return out(await rt.requestMandate({ task: args[0], store: 'BlockMart', item: args[1], budget: args[2], expiry_mins: args[3] ? Number(args[3]) : undefined }));
    case 'approve': {
      const file = join(rt.HOME, 'drafts', `${args[0]}.json`);
      if (!existsSync(file)) throw new Error(`No local draft ${args[0]}`);
      const draft = JSON.parse(readFileSync(file, 'utf8')) as Draft;
      const owner = ownerWallet();
      const { args: a, value } = mandateArgs(draft);
      const tx = await vaultWrite(owner, rt.pc, 'createMandate', a, { value, chainId: rt.CHAIN_ID });
      return out({ created: tx.ok, settle_ms: tx.settleMs, explorer: explorerTx(tx.hash, rt.CHAIN_ID), ...(await rt.waitForApproval(args[0] as Hex, 20)) });
    }
    case 'buy': {
      const q = await rt.quote(args[1], 1);
      rt.logStep(args[0], { kind: 'quote', text: `Quote ${q.orderId}: ${q.name} = ${q.amount} MON` });
      return out(await rt.pay({ mandate_id: args[0], amount: String(q.amount), pay_to: q.payTo, item: q.name, order_ref: q.orderId }));
    }
    case 'timeline':
      return out(await rt.mandateSummary(BigInt(args[0])));
    case 'attack':
      return out(await rt.attack(BigInt(args[0]), (args[1] as Address) ?? undefined));
    case 'topup':
      return out(await rt.requestTopUp({ mandate_id: args[0], amount: args[1], reason: args.slice(2).join(' ') || 'price changed' }));
    case 'approve-topup': {
      const m = await getMandate(rt.pc, BigInt(args[0]), rt.CHAIN_ID);
      if (!m?.pendingTopUp) throw new Error('No pending top-up');
      const tx = await vaultWrite(ownerWallet(), rt.pc, 'increaseBudget', [BigInt(args[0])], { value: m.pendingTopUp, chainId: rt.CHAIN_ID });
      return out({ added: mon(m.pendingTopUp), explorer: explorerTx(tx.hash, rt.CHAIN_ID) });
    }
    case 'close':
      return out(await rt.closeMandate({ mandate_id: args[0] }));
    case 'reclaim': {
      const tx = await vaultWrite(rt.wc, rt.pc, 'reclaimExpired', [BigInt(args[0])], { chainId: rt.CHAIN_ID });
      return out({ reclaimed: tx.ok, explorer: explorerTx(tx.hash, rt.CHAIN_ID) });
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 18).join('\n'));
  }
}

main().catch((e) => {
  console.error('Error:', e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
