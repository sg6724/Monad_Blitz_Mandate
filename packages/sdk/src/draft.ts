import { keccak256, toHex, parseEther, type Address, type Hex } from 'viem';

/** A merchant's public identity, served at https://<domain>/.well-known/taskpay.json */
export type MerchantIdentity = {
  name: string;
  domain: string;
  category: string;
  payTo: Address;
  catalogUrl?: string;
  quoteUrl?: string;
  priceRange?: { min: number; max: number }; // in MON
};

export type Payee = { name: string; payTo: Address; domain?: string };

/** Everything the owner approves in one MetaMask confirmation. Amounts are MON decimals. */
export type Draft = {
  v: 1;
  chainId: number;
  task: string; // the user's own words
  item?: string; // what to buy, as clarified
  store?: Payee;
  extraPayees?: Payee[]; // e.g. a pay-per-call price-check API
  budget?: string;
  perPaymentCap?: string;
  expiryMins?: number;
  agent: Address;
  agentId?: string; // ERC-8004 id as decimal string
  nonce: string;
};

export type Question = {
  field: 'store' | 'item' | 'budget';
  text: string;
  options: string[];
};

export const DEFAULT_EXPIRY_MINS = 24 * 60;

export function newNonce() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Works out what is still missing before a mandate can be drafted, and phrases at
 * most three questions with tap-to-answer suggestions. The budget is never guessed:
 * suggestions come from the store's real prices.
 */
export function missingFields(
  draft: Partial<Draft>,
  ctx: { stores: MerchantIdentity[]; items?: { name: string; price: number }[] },
): Question[] {
  const qs: Question[] = [];
  if (!draft.store) {
    qs.push({ field: 'store', text: 'Which store should I buy from?', options: ctx.stores.map((s) => s.name) });
  }
  if (!draft.item) {
    const names = (ctx.items ?? []).slice(0, 4).map((i) => i.name);
    qs.push({ field: 'item', text: 'What exactly should I get?', options: names });
  }
  if (!draft.budget) {
    const prices = (ctx.items ?? [])
      .filter((i) => !draft.item || i.name.toLowerCase().includes(draft.item.toLowerCase()) || draft.item.toLowerCase().includes(i.name.toLowerCase()))
      .map((i) => i.price);
    const pool = prices.length ? prices : (ctx.items ?? []).map((i) => i.price);
    if (pool.length) {
      const lo = Math.min(...pool);
      const hi = Math.max(...pool);
      const suggest = [round(hi * 1.1), round(hi * 1.25), round(Math.max(lo, hi) * 1.5)];
      qs.push({
        field: 'budget',
        text: lo === hi ? `What's the most I can spend? It costs about ${fmt(hi)} MON.` : `What's the most I can spend? Prices there run ${fmt(lo)}–${fmt(hi)} MON.`,
        options: [...new Set(suggest.map((n) => `${fmt(n)} MON`))],
      });
    } else {
      qs.push({ field: 'budget', text: "What's the most I can spend (in MON)?", options: ['0.5 MON', '1 MON', '2 MON'] });
    }
  }
  return qs.slice(0, 3);
}

function round(n: number) {
  return Math.ceil(n * 100) / 100;
}

function fmt(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function isReady(d: Partial<Draft>): d is Draft {
  return !!(d.store && d.item && d.budget && d.agent && d.chainId);
}

function canonical(d: Draft) {
  return JSON.stringify({
    v: d.v,
    chainId: d.chainId,
    task: d.task,
    item: d.item,
    store: d.store,
    extraPayees: d.extraPayees ?? [],
    budget: d.budget,
    perPaymentCap: d.perPaymentCap ?? d.budget,
    expiryMins: d.expiryMins ?? DEFAULT_EXPIRY_MINS,
    agent: d.agent,
    agentId: d.agentId ?? null,
    nonce: d.nonce,
  });
}

/** Unique id for this exact draft; lets the agent find the mandate once the owner approves. */
export function draftId(d: Draft): Hex {
  return keccak256(toHex(canonical(d)));
}

/** Fingerprint of what the owner actually approved (purpose + item), stored on-chain. */
export function purposeHash(d: Draft): Hex {
  return keccak256(toHex(`${d.task}\n${d.item ?? ''}`));
}

export function payeesOf(d: Draft): Payee[] {
  return [d.store!, ...(d.extraPayees ?? [])].filter(Boolean);
}

/** Arguments for TaskPayVault.createMandate (native MON). */
export function mandateArgs(d: Draft, nowSec = Math.floor(Date.now() / 1000)) {
  const budget = parseEther(d.budget!);
  const cap = parseEther(d.perPaymentCap ?? d.budget!);
  const expiry = BigInt(nowSec + 60 * (d.expiryMins ?? DEFAULT_EXPIRY_MINS));
  const agentId = d.agentId ? BigInt(d.agentId) : 2n ** 256n - 1n;
  return {
    value: budget,
    args: [
      d.agent,
      '0x0000000000000000000000000000000000000000' as Address,
      budget,
      cap,
      expiry,
      payeesOf(d).map((p) => p.payTo),
      purposeHash(d),
      draftId(d),
      agentId,
    ] as const,
  };
}

// URL-fragment transport: the draft travels in the approve link, so no server stores it.

export function encodeDraft(d: Draft): string {
  const json = JSON.stringify(d);
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDraft(s: string): Draft {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as Draft;
}

export function approveUrl(baseUrl: string, d: Draft) {
  return `${baseUrl.replace(/\/$/, '')}/approve#${encodeDraft(d)}`;
}

export async function fetchMerchant(domainOrUrl: string): Promise<MerchantIdentity> {
  const base = domainOrUrl.startsWith('http') ? domainOrUrl.replace(/\/$/, '') : `https://${domainOrUrl}`;
  const res = await fetch(`${base}/.well-known/taskpay.json`, { cache: 'no-store' as RequestCache });
  if (!res.ok) throw new Error(`No TaskPay identity at ${base}`);
  const j = (await res.json()) as MerchantIdentity;
  if (!j.payTo || !/^0x[0-9a-fA-F]{40}$/.test(j.payTo)) throw new Error('Merchant identity has no valid payTo');
  return j;
}
