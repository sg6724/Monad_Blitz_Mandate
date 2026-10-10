import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatEther, keccak256, parseEther, toHex, type Address, type Hex } from 'viem';
import {
  CATALOG,
  HACKER_ADDRESS,
  QUARANTINE_RULES,
  addressesFor,
  agentCard,
  approveUrl,
  checkPayment,
  detectInjection,
  draftId as draftIdOf,
  explorerTx,
  fetchMerchant,
  findByDraft,
  findProducts,
  getHistory,
  getMandate,
  isReady,
  mandatesOfAgent,
  mergeTimeline,
  missingFields,
  mon,
  newNonce,
  publicClientFor,
  quarantine,
  ref32,
  registerAgent,
  riskScore,
  vaultWrite,
  walletClientFor,
  type ChainId,
  type Draft,
  type LocalStep,
  type MerchantIdentity,
} from '@taskpay/sdk';

// ------------------------------------------------------------------ config

export const HOME = process.env.TASKPAY_HOME ?? join(homedir(), '.taskpay');
export const CHAIN_ID = Number(process.env.TASKPAY_CHAIN_ID ?? 10143) as ChainId;
export const WEB_URL = (process.env.TASKPAY_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const STORES = (process.env.TASKPAY_STORES ?? WEB_URL).split(',').map((s) => s.trim()).filter(Boolean);
export const RPC = process.env.MONAD_RPC_URL;

mkdirSync(join(HOME, 'logs'), { recursive: true });
mkdirSync(join(HOME, 'drafts'), { recursive: true });

type AgentFile = { privateKey: Hex; address: Address; agentId?: string; chainId: number };

function loadAgent(): AgentFile {
  const path = join(HOME, 'agent.json');
  if (process.env.TASKPAY_AGENT_KEY) {
    const acct = privateKeyToAccount(process.env.TASKPAY_AGENT_KEY as Hex);
    const cached = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as AgentFile) : null;
    return {
      privateKey: process.env.TASKPAY_AGENT_KEY as Hex,
      address: acct.address,
      agentId: process.env.TASKPAY_AGENT_ID ?? (cached?.address === acct.address ? cached.agentId : undefined),
      chainId: CHAIN_ID,
    };
  }
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as AgentFile;
  const privateKey = generatePrivateKey();
  const a: AgentFile = { privateKey, address: privateKeyToAccount(privateKey).address, chainId: CHAIN_ID };
  writeFileSync(path, JSON.stringify(a, null, 2), { mode: 0o600 });
  return a;
}

export const agentFile = loadAgent();
export const agentAccount = privateKeyToAccount(agentFile.privateKey);
export const pc = publicClientFor(CHAIN_ID, RPC);
export const wc = walletClientFor(agentAccount, CHAIN_ID, RPC);

function saveAgent(patch: Partial<AgentFile>) {
  Object.assign(agentFile, patch);
  writeFileSync(join(HOME, 'agent.json'), JSON.stringify(agentFile, null, 2), { mode: 0o600 });
}

// ------------------------------------------------------------- local logs

const logPath = (key: string) => join(HOME, 'logs', `${key}.jsonl`);

export function logStep(key: string, step: Omit<LocalStep, 'at'>) {
  appendFileSync(logPath(key), JSON.stringify({ at: Math.floor(Date.now() / 1000), ...step }) + '\n');
}

export function readSteps(key: string): LocalStep[] {
  if (!existsSync(logPath(key))) return [];
  return readFileSync(logPath(key), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function logHash(key: string): Hex {
  return existsSync(logPath(key)) ? keccak256(toHex(readFileSync(logPath(key), 'utf8'))) : (`0x${'0'.repeat(64)}` as Hex);
}

/** Steps logged under a draft id are moved to the mandate's log once it exists. */
async function adoptDraftLog(draftKey: string, mandateKey: string) {
  if (existsSync(logPath(draftKey)) && !existsSync(logPath(mandateKey))) await fs.rename(logPath(draftKey), logPath(mandateKey));
}

// ----------------------------------------------------------------- agent

export async function ensureAgent() {
  const bal = await pc.getBalance({ address: agentAccount.address });
  if (bal < parseEther('0.05')) {
    throw new Error(
      `Agent key ${agentAccount.address} needs MON for fees (has ${formatEther(bal)}). Send it some testnet MON or use "Get test MON" at ${WEB_URL}.`,
    );
  }
  if (!agentFile.agentId) {
    try {
      const id = await registerAgent(wc, pc, agentCard('TaskPay agent', 'Shops and pays inside TaskPay mandates', CHAIN_ID), CHAIN_ID);
      saveAgent({ agentId: id.toString() });
    } catch {
      /* identity is optional: mandates still work without it */
    }
  }
  return { address: agentAccount.address, agentId: agentFile.agentId, balance: bal };
}

// ---------------------------------------------------------------- stores

const BUILTIN_STORE: MerchantIdentity = {
  name: 'BlockMart',
  domain: 'blockmart',
  category: 'apparel',
  payTo: (process.env.TASKPAY_STORE_PAYTO ?? '0x27dd67D92c1754D3F30b9D7965D8Cf6cf2B3D0be') as Address,
  priceRange: { min: 0.4, max: 1.4 },
};

export async function knownStores(): Promise<MerchantIdentity[]> {
  const out: MerchantIdentity[] = [];
  for (const s of STORES) {
    try {
      out.push(await fetchMerchant(s));
    } catch {
      /* unreachable store */
    }
  }
  if (!out.find((m) => m.name.toLowerCase() === 'blockmart')) out.push(BUILTIN_STORE);
  return out;
}

export async function resolveStore(name?: string) {
  if (!name) return undefined;
  const stores = await knownStores();
  return stores.find((s) => s.name.toLowerCase() === name.toLowerCase() || s.domain.toLowerCase().includes(name.toLowerCase()));
}

async function storeFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${WEB_URL}${path}`, init);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/** Browse BlockMart. Reviews are quarantined and scanned for injection before the model sees them. */
export async function browse(query: string | undefined, logKey?: string) {
  let products: { id: string; name: string; price: number; blurb: string; reviews: { author: string; text: string }[] }[];
  try {
    products = (await storeFetch(`/api/store/products${query ? `?q=${encodeURIComponent(query)}` : ''}`)).products;
  } catch {
    products = findProducts(query);
  }
  let exposure = 0;
  const flags: string[] = [];
  const out = [];
  for (const p of products) {
    const reviews = [];
    for (const r of p.reviews) {
      const verdict = await detectInjection(r.text);
      exposure = Math.max(exposure, verdict.score);
      if (verdict.verdict !== 'safe') flags.push(`${p.name}: review by ${r.author} ${verdict.verdict} (${verdict.hits.join(', ')})`);
      reviews.push({ author: r.author, flagged: verdict.verdict !== 'safe' ? verdict.verdict : undefined, text: quarantine(`review:${p.id}`, r.text) });
    }
    out.push({ id: p.id, name: p.name, price_mon: p.price, about: p.blurb, reviews });
  }
  if (logKey) {
    logStep(logKey, { kind: 'search', text: `Browsed BlockMart${query ? ` for "${query}"` : ''}: ${out.length} products` });
    for (const f of flags) logStep(logKey, { kind: 'injection', text: `TaskGuard flagged ${f}` });
  }
  if (logKey && exposure) bumpExposure(logKey, exposure);
  return { rules: QUARANTINE_RULES, products: out, taskguard_flags: flags };
}

const exposureFile = (key: string) => join(HOME, 'logs', `${key}.exposure`);
function bumpExposure(key: string, score: number) {
  const prev = existsSync(exposureFile(key)) ? Number(readFileSync(exposureFile(key), 'utf8')) : 0;
  writeFileSync(exposureFile(key), String(Math.max(prev, score)));
}
function exposureOf(key: string) {
  return existsSync(exposureFile(key)) ? Number(readFileSync(exposureFile(key), 'utf8')) : 0;
}

export async function quote(productId: string, qty = 1) {
  try {
    return await storeFetch('/api/store/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, qty }),
    });
  } catch {
    const p = CATALOG.find((x) => x.id === productId);
    if (!p) throw new Error(`Unknown product ${productId}`);
    return { orderId: `BM-${Date.now().toString(36).toUpperCase()}`, productId, name: p.name, qty, amount: (p.price * qty).toFixed(4), payTo: BUILTIN_STORE.payTo, network: `eip155:${CHAIN_ID}` };
  }
}

// --------------------------------------------------------------- mandates

const draftFile = (id: string) => join(HOME, 'drafts', `${id}.json`);

export async function requestMandate(input: { task: string; store?: string; item?: string; budget?: string; expiry_mins?: number }) {
  const stores = await knownStores();
  const store = await resolveStore(input.store ?? (stores.length === 1 ? stores[0].name : undefined));
  const items = findProducts(input.item ?? input.task).map((p) => ({ name: p.name, price: p.price }));
  const partial: Partial<Draft> = {
    v: 1,
    chainId: CHAIN_ID,
    task: input.task,
    item: input.item,
    store: store ? { name: store.name, payTo: store.payTo, domain: store.domain } : undefined,
    budget: input.budget?.replace(/\s*mon\s*$/i, ''),
    expiryMins: input.expiry_mins,
    agent: agentAccount.address,
    agentId: agentFile.agentId,
    nonce: newNonce(),
  };
  const questions = missingFields(partial, { stores, items });
  if (questions.length || !isReady(partial)) {
    return { status: 'needs_info' as const, questions, hint: 'Ask the user these questions, then call request_mandate again with their answers.' };
  }
  const draft = partial as Draft;
  const id = draftIdOf(draft);
  writeFileSync(draftFile(id), JSON.stringify(draft, null, 2));
  logStep(id, { kind: 'note', text: `Drafted task "${draft.task}" · ${draft.item} at ${draft.store!.name} · up to ${draft.budget} MON` });
  return {
    status: 'ready' as const,
    draft_id: id,
    card: {
      task: draft.task,
      item: draft.item,
      merchant: `${draft.store!.name} → ${draft.store!.payTo}`,
      budget: `${draft.budget} MON`,
      expires_in: `${draft.expiryMins ?? 1440} minutes`,
      agent: draft.agent,
    },
    approve_url: approveUrl(WEB_URL, draft),
    next: 'Send the approve_url to the user. They confirm once in MetaMask. Then call wait_for_approval with draft_id.',
  };
}

export async function waitForApproval(draftId: Hex, timeoutS = 90) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    const id = await findByDraft(pc, draftId, CHAIN_ID);
    if (id > 0n) {
      await adoptDraftLog(draftId, String(id));
      logStep(String(id), { kind: 'note', text: `Owner approved mandate #${id}` });
      return { approved: true, mandate_id: id.toString() };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { approved: false, hint: 'Not approved yet. Call wait_for_approval again.' };
}

export async function mandateSummary(id: bigint) {
  const m = await getMandate(pc, id, CHAIN_ID);
  if (!m) throw new Error(`Mandate #${id} not found`);
  const [entries] = await Promise.all([getHistory(pc, id, CHAIN_ID)]);
  const names = { [m.owner.toLowerCase()]: 'you', [BUILTIN_STORE.payTo.toLowerCase()]: 'BlockMart' };
  const lines = mergeTimeline(entries, m, readSteps(String(id)), names);
  return {
    id: id.toString(),
    status: m.frozen ? 'frozen' : m.status.toLowerCase(),
    budget: mon(m.budget),
    spent: mon(m.spent),
    remaining: mon(m.remaining),
    per_payment_cap: mon(m.perPaymentCap),
    expires: new Date(m.expiry * 1000).toISOString(),
    payees: m.payees,
    pending_topup: m.pendingTopUp > 0n ? mon(m.pendingTopUp) : null,
    pending_approval: m.pendingPayment ? `${mon(m.pendingPayment.amount)} to ${m.pendingPayment.payee}` : null,
    timeline: lines.map((l) => `${new Date(l.at * 1000).toLocaleTimeString()} ${l.source === 'chain' ? '⛓' : '·'} ${l.text}`),
    web: `${WEB_URL}/mandate/${id}`,
  };
}

export async function pay(input: { mandate_id: string; amount: string; pay_to: string; item: string; order_ref: string; skip_guard?: boolean }) {
  const id = BigInt(input.mandate_id);
  const key = String(id);
  const m = await getMandate(pc, id, CHAIN_ID);
  if (!m) throw new Error('Mandate not found');
  const amount = parseEther(input.amount.replace(/\s*mon\s*$/i, ''));
  const payTo = input.pay_to as Address;

  if (!input.skip_guard) {
    const store = (await knownStores()).find((s) => s.payTo.toLowerCase() === payTo.toLowerCase());
    const prices = CATALOG.map((p) => p.price);
    const steps = readSteps(key);
    const recentPays = steps.filter((s) => s.kind === 'tx' && s.at > Date.now() / 1000 - 60).length;
    const purpose = steps.find((s) => s.text.startsWith('Drafted task'))?.text ?? '';
    const risk = riskScore({
      purpose,
      item: input.item,
      amount: Number(input.amount),
      typicalPrices: prices,
      remaining: Number(formatEther(m.remaining)),
      injectionExposure: exposureOf(key),
      payToMatchesIdentity: !!store,
      merchantIsNew: false,
      paymentsLastMinute: recentPays,
    });
    logStep(key, { kind: 'guard', text: `TaskGuard risk ${risk.score} → ${risk.decision}${risk.reasons.length ? `: ${risk.reasons.join('; ')}` : ''}`, data: risk as any });
    if (risk.decision === 'block') {
      return { paid: false, blocked_by: 'TaskGuard (off-chain)', risk };
    }
    if (risk.decision === 'step_up') {
      const tx = await vaultWrite(wc, pc, 'requestApproval', [id, payTo, amount, ref32(input.order_ref)], { chainId: CHAIN_ID });
      logStep(key, { kind: 'tx', text: `Asked the owner to confirm ${input.amount} MON to ${payTo}`, txHash: tx.hash });
      return { paid: false, waiting_for_owner: true, risk, explorer: explorerTx(tx.hash, CHAIN_ID), web: `${WEB_URL}/mandate/${id}` };
    }
  }

  const pre = await checkPayment(pc, id, payTo, amount, CHAIN_ID);
  const tx = await vaultWrite(wc, pc, 'pay', [id, payTo, amount, ref32(input.order_ref)], { chainId: CHAIN_ID });
  const ok = pre === 'NONE';
  logStep(key, {
    kind: 'tx',
    text: ok ? `Paid ${input.amount} MON for ${input.item} (${input.order_ref}) in ${tx.settleMs} ms` : `Vault blocked ${input.amount} MON to ${payTo}: ${pre}`,
    txHash: tx.hash,
  });
  if (ok) {
    try {
      await fetch(`${WEB_URL}/api/store/paid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: input.order_ref, txHash: tx.hash }) });
    } catch {
      /* store offline is fine */
    }
  }
  return {
    paid: ok,
    blocked_reason: ok ? undefined : pre,
    settle_ms: tx.settleMs,
    tx: tx.hash,
    explorer: explorerTx(tx.hash, CHAIN_ID),
    remaining: mon((await getMandate(pc, id, CHAIN_ID))!.remaining),
    hint: ok ? undefined : pre === 'OVER_BUDGET' ? 'Ask the owner for more with request_topup.' : 'The vault refused this payment. Do not retry it.',
  };
}

export async function requestTopUp(input: { mandate_id: string; amount: string; reason: string }) {
  const id = BigInt(input.mandate_id);
  const tx = await vaultWrite(wc, pc, 'requestTopUp', [id, parseEther(input.amount.replace(/\s*mon\s*$/i, '')), ref32(input.reason)], { chainId: CHAIN_ID });
  logStep(String(id), { kind: 'tx', text: `Asked for +${input.amount} MON: ${input.reason}`, txHash: tx.hash });
  return { requested: true, explorer: explorerTx(tx.hash, CHAIN_ID), approve_at: `${WEB_URL}/mandate/${id}`, next: 'Wait for the owner, then check get_mandate.' };
}

export async function closeMandate(input: { mandate_id: string }) {
  const id = BigInt(input.mandate_id);
  const before = await getMandate(pc, id, CHAIN_ID);
  logStep(String(id), { kind: 'note', text: 'Closing task' });
  const h = logHash(String(id));
  const tx = await vaultWrite(wc, pc, 'close', [id, h], { chainId: CHAIN_ID });
  return { closed: true, refunded: before ? mon(before.remaining) : undefined, log_hash: h, explorer: explorerTx(tx.hash, CHAIN_ID) };
}

export async function listMandates() {
  const ids = await mandatesOfAgent(pc, agentAccount.address, CHAIN_ID);
  const out = [];
  for (const id of ids.slice(-10).reverse()) {
    const m = await getMandate(pc, id, CHAIN_ID);
    if (m) out.push({ id: id.toString(), status: m.frozen ? 'frozen' : m.status.toLowerCase(), remaining: mon(m.remaining), budget: mon(m.budget) });
  }
  return { agent: agentAccount.address, mandates: out };
}

/** Demo only: a fully compromised agent pays an attacker straight through the vault (no TaskGuard). */
export async function attack(id: bigint, to: Address = HACKER_ADDRESS, amount = '0.1') {
  const tx = await vaultWrite(wc, pc, 'pay', [id, to, parseEther(amount), ref32('injected')], { chainId: CHAIN_ID });
  logStep(String(id), { kind: 'tx', text: `Compromised agent tried to pay ${amount} MON to ${to}`, txHash: tx.hash });
  const hist = await getHistory(pc, id, CHAIN_ID);
  return { tx: tx.hash, explorer: explorerTx(tx.hash, CHAIN_ID), recorded: hist.at(-1) };
}

export { addressesFor };
