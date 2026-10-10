// Starts the MCP server over stdio and calls a few tools, like Claude Code would.
// Works from any cwd: npx tsx /path/to/mcp/src/selftest.ts [path/to/index.ts]
// Full on-chain run through the MCP tools (test owner key stands in for MetaMask on the approve page):
//   TASKPAY_OWNER_KEY=0x… npx tsx mcp/src/selftest.ts --e2e      buys a Bucket Hat (0.4 MON) on a 0.5 MON budget
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const e2e = process.argv.includes('--e2e');
const server = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? fileURLToPath(new URL('./index.ts', import.meta.url));
const client = new Client({ name: 'selftest', version: '0' });
await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', server], env: { ...process.env } as Record<string, string> }));
const text = (r: any) => (r.content as any)[0].text as string;

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

const browse = JSON.parse(text(await client.callTool({ name: 'browse_store', arguments: { query: 'cap' } })));
console.log('browse_store(cap):', browse.products?.map((p: any) => `${p.name} ${p.price_mon} MON`).join(', '), '| flags:', browse.taskguard_flags?.length ?? 0);

const r = await client.callTool({ name: 'request_mandate', arguments: { task: 'I need a bag for my laptop charger' } });
console.log('request_mandate:', text(r).slice(0, 400));

const l = await client.callTool({ name: 'list_mandates', arguments: {} });
console.log('list_mandates:', text(l).slice(0, 200));

if (e2e) {
  const { privateKeyToAccount } = await import('viem/accounts');
  const { decodeDraft, mandateArgs, publicClientFor, vaultWrite, walletClientFor } = await import('@taskpay/sdk');
  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await client.callTool({ name, arguments: args });
    const v = JSON.parse(text(r));
    if (r.isError) throw new Error(`${name}: ${v.error}`);
    console.log(`${name}:`, JSON.stringify(v).slice(0, 300));
    return v;
  };
  const d = await call('request_mandate', { task: 'Buy me a bucket hat', store: 'BlockMart', item: 'Bucket Hat', budget: '0.5', expiry_mins: 60 });
  if (d.status !== 'ready') throw new Error('draft not ready');
  // What the approve page does after "Lock 0.5 MON" + one MetaMask confirmation:
  const draft = decodeDraft(new URL(d.approve_url).hash.slice(1));
  const owner = walletClientFor(privateKeyToAccount(process.env.TASKPAY_OWNER_KEY as `0x${string}`));
  const { args, value } = mandateArgs(draft);
  const lock = await vaultWrite(owner, publicClientFor(), 'createMandate', args, { value });
  console.log('owner locked budget:', lock.hash);
  const { mandate_id } = await call('wait_for_approval', { draft_id: d.draft_id, timeout_s: 60 });
  const q = await call('get_quote', { product_id: 'bucket-hat', mandate_id });
  const p = await call('pay', { mandate_id, amount: q.amount_mon, pay_to: q.pay_to, item: q.item, order_ref: q.order_id });
  if (!p.paid) throw new Error('not paid');
  await new Promise((r) => setTimeout(r, 2000));
  await call('close_mandate', { mandate_id });
  const m = await call('get_mandate', { mandate_id });
  console.log(m.timeline.join('\n'));
}
await client.close();
