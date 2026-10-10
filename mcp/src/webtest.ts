// E2E against the local web API: plan -> owner locks (test key, stands in for MetaMask) -> agent run -> close.
import { privateKeyToAccount } from 'viem/accounts';
import { draftId, findByDraft, mandateArgs, publicClientFor, vaultWrite, walletClientFor, getMandate, mon } from '@taskpay/sdk';
const BASE = 'http://localhost:3000';
const post = (p: string, b: unknown) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const pc = publicClientFor();
const owner = walletClientFor(privateKeyToAccount(process.env.OWNER as `0x${string}`));
const [task, surge, compromised] = [process.argv[2] ?? 'Buy the Utility Hoodie, max 1.3 MON', process.argv[3] === 'surge', process.argv[4] === 'compromised'];
const plan = await post('/api/agent/plan', { messages: [{ role: 'user', text: task }] });
console.log('PLAN:', plan.reply, plan.questions?.length ? plan.questions : '');
if (!plan.draft) process.exit(0);
const { args, value } = mandateArgs(plan.draft);
const tx = await vaultWrite(owner, pc, 'createMandate', args, { value });
const id = await findByDraft(pc, draftId(plan.draft));
console.log(`LOCKED #${id} in ${tx.settleMs} ms`);
const body = { mandateId: id.toString(), item: plan.draft.item, purpose: `${task} — ${plan.draft.item}`, surge, compromised };
let r = await post('/api/agent/run', { ...body, phase: 'shop' });
for (const e of r.events) console.log('  ', e.kind.padEnd(9), e.text);
console.log('OUTCOME', r.outcome);
if (r.outcome === 'need_topup') {
  const m = (await getMandate(pc, id))!;
  await vaultWrite(owner, pc, 'increaseBudget', [id], { value: m.pendingTopUp });
  console.log('OWNER approved top-up', mon(m.pendingTopUp));
  r = await post('/api/agent/run', { ...body, phase: 'resume' });
  for (const e of r.events) console.log('  ', e.kind.padEnd(9), e.text);
  console.log('OUTCOME', r.outcome);
}
if (r.outcome === 'need_confirm') {
  await vaultWrite(owner, pc, 'confirmPayment', [id]);
  console.log('OWNER confirmed step-up payment');
  r = { outcome: 'paid' } as any;
}
if (r.outcome === 'paid') {
  const c = await post('/api/agent/run', { ...body, phase: 'close' });
  for (const e of c.events) console.log('  ', e.kind.padEnd(9), e.text);
}
