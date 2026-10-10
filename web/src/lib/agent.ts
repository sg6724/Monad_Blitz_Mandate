import { formatEther, parseEther, type Address, type Hex } from 'viem';
import {
  CATALOG,
  HACKER_ADDRESS,
  SURGE_MULTIPLIER,
  adaptiveCap,
  agentReputation,
  checkPayment,
  detectInjection,
  explorerTx,
  feeFor,
  findProducts,
  getMandate,
  missingFields,
  newNonce,
  productById,
  ref32,
  riskScore,
  vaultWrite,
  type Draft,
  type LocalStep,
  type Question,
} from '@taskpay/sdk';
import { AGENT_ID, CHAIN_ID, PRICECHECK_FEE, PRICECHECK_PAYTO, STORE_PAYTO, agentWallet, pc } from './server';
import { classifyInjection, extractTask, intentScore } from './gemini';

export type AgentEvent = LocalStep;
const now = () => Math.floor(Date.now() / 1000);
const ev = (kind: LocalStep['kind'], text: string, extra: Partial<LocalStep> = {}): AgentEvent => ({ at: now(), kind, text, ...extra });

// ------------------------------------------------------------------ plan

export type PlanInput = {
  messages: { role: 'user' | 'agent'; text: string }[];
  partial?: Partial<Draft>;
  answers?: Partial<Record<Question['field'], string>>;
};

export type PlanResult = { reply: string; questions: Question[]; partial: Partial<Draft>; draft?: Draft; suggestedCap?: string };

function heuristicExtract(text: string) {
  const budget = text.match(/(\d+(?:\.\d+)?)\s*(?:mon)?\b/i)?.[1] ?? null;
  const hits = findProducts(text);
  const item = hits.length < CATALOG.length ? hits[0].name : null;
  return { item, budget, store: /nexus/i.test(text) || item ? 'NEXUS' : null };
}

export async function plan(input: PlanInput): Promise<PlanResult> {
  const convo = input.messages.map((m) => `${m.role}: ${m.text}`).join('\n');
  const userText = input.messages.filter((m) => m.role === 'user').map((m) => m.text).join(' ');
  const g = await extractTask(convo);
  const h = heuristicExtract(userText);
  const p: Partial<Draft> = { ...(input.partial ?? {}) };

  // Gemini's reading wins when it answered; keyword matching is only a fallback.
  const item = input.answers?.item ?? p.item ?? (g ? g.item : h.item) ?? undefined;
  const product = item ? CATALOG.find((x) => x.name.toLowerCase() === item.toLowerCase()) ?? findProducts(item)[0] : undefined;
  if (product && item) p.item = product.name;
  const budget = (input.answers?.budget ?? p.budget ?? (g ? g.budget : h.budget) ?? undefined)?.replace(/\s*mon\s*$/i, '');
  if (budget && !Number.isNaN(Number(budget)) && Number(budget) > 0) p.budget = String(Number(budget));
  if ((input.answers?.store ?? g?.store ?? h.store ?? p.store) || p.item) p.store = { name: 'NEXUS', payTo: STORE_PAYTO, domain: 'nexus' };

  p.v = 1;
  p.chainId = CHAIN_ID;
  p.task = p.task ?? input.messages.find((m) => m.role === 'user')?.text ?? 'Shopping task';
  p.agent = agentWallet().account!.address;
  p.agentId = AGENT_ID;
  p.nonce = p.nonce ?? newNonce();
  p.extraPayees = [{ name: 'PriceCheck API', payTo: PRICECHECK_PAYTO }];

  const items = (p.item ? findProducts(p.item) : findProducts(userText)).map((x) => ({ name: x.name, price: x.price }));
  const questions = missingFields(p, { stores: [{ name: 'NEXUS', domain: 'nexus', category: 'apparel', payTo: STORE_PAYTO }], items });

  if (questions.length) {
    return { reply: g?.reply ?? 'A couple of quick details before I lock a budget.', questions, partial: p };
  }

  // Adaptive per-payment cap from the agent's ERC-8004 track record.
  let rep = null;
  if (AGENT_ID) rep = await agentReputation(pc, BigInt(AGENT_ID), CHAIN_ID).catch(() => null);
  const budgetN = Number(p.budget);
  const cap = Math.max(adaptiveCap(budgetN, rep), Math.min(budgetN, (product?.price ?? 0) * SURGE_MULTIPLIER + 0.01));
  p.perPaymentCap = String(Math.min(budgetN, Math.round(cap * 1000) / 1000));
  p.expiryMins = p.expiryMins ?? 60;
  return {
    reply: `Here's the task card. Lock ${p.budget} MON and I'll only be able to pay NEXUS (and the price-check API), for at most ${p.perPaymentCap} MON per payment, within the next hour.`,
    questions: [],
    partial: p,
    draft: p as Draft,
    suggestedCap: p.perPaymentCap,
  };
}

// ------------------------------------------------------------------- run

export type RunInput = {
  mandateId: string;
  item: string; // product name from the approved draft
  purpose: string;
  compromised?: boolean;
  surge?: boolean;
  phase: 'shop' | 'resume' | 'close';
  logHash?: Hex;
};

export type RunResult = {
  events: AgentEvent[];
  outcome: 'paid' | 'need_topup' | 'need_confirm' | 'blocked' | 'closed' | 'error';
  remaining?: string;
};

function mon(n: bigint) {
  return `${Number(formatEther(n)).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} MON`;
}

export async function run(input: RunInput): Promise<RunResult> {
  const events: AgentEvent[] = [];
  const wc = agentWallet();
  const id = BigInt(input.mandateId);
  const m = await getMandate(pc, id, CHAIN_ID);
  if (!m) return { events: [ev('note', 'Mandate not found')], outcome: 'error' };

  if (input.phase === 'close') {
    const tx = await vaultWrite(wc, pc, 'close', [id, input.logHash ?? (`0x${'0'.repeat(64)}` as Hex)], { chainId: CHAIN_ID });
    events.push(ev('tx', `Closed the task. ${mon(m.remaining)} went back to your wallet.`, { txHash: tx.hash }));
    return { events, outcome: 'closed' };
  }

  const product = CATALOG.find((p) => p.name.toLowerCase() === input.item.toLowerCase()) ?? findProducts(input.item)[0];
  let exposure = 0;

  if (input.phase === 'shop') {
    // Browse: the agent reads the product page and reviews. Reviews are untrusted content.
    events.push(ev('search', `Browsing NEXUS for "${product.name}"`));
    const readable = input.compromised ? [product, productById('tech-cap')!] : [product];
    for (const p of readable) {
      for (const r of p.reviews) {
        const v = await detectInjection(r.text, (t) => classifyInjection(t));
        if (v.verdict !== 'safe') {
          exposure = Math.max(exposure, v.score);
          events.push(
            ev('injection', `TaskGuard flagged a ${v.verdict} review on ${p.name} by "${r.author}": ${v.hits.join(', ')}${v.usedModel ? ' (confirmed by Gemini)' : ''}`, {
              data: { quote: r.text.slice(0, 160), score: v.score },
            }),
          );
        }
      }
    }

    if (input.compromised) {
      // Layers 1-3 switched off: the agent obeys the injected review and tries to drain the task.
      events.push(ev('note', `Compromised mode: TaskGuard off. The agent obeys the review and tries to send ${mon(m.remaining)} to ${HACKER_ADDRESS}.`));
      const tx = await vaultWrite(wc, pc, 'pay', [id, HACKER_ADDRESS as Address, m.remaining, ref32('settlement migration')], { chainId: CHAIN_ID });
      const reason = (await checkPayment(pc, id, HACKER_ADDRESS as Address, m.remaining, CHAIN_ID)) || 'MERCHANT_NOT_ALLOWED';
      events.push(ev('tx', `⛓ Vault blocked it on-chain: ${reason === 'NONE' ? 'MERCHANT_NOT_ALLOWED' : reason}. No MON moved.`, { txHash: tx.hash, data: { blocked: true } }));
    }

    // Pay-per-call: three price checks, 0.001 MON each, paid from the same mandate.
    if (m.payees.some((a) => a.toLowerCase() === PRICECHECK_PAYTO.toLowerCase())) {
      let total = 0;
      for (let i = 1; i <= 3; i++) {
        const tx = await vaultWrite(wc, pc, 'pay', [id, PRICECHECK_PAYTO, parseEther(PRICECHECK_FEE), ref32(`pricecheck-${i}`)], { chainId: CHAIN_ID });
        total += tx.settleMs;
        events.push(ev('tx', `Paid ${PRICECHECK_FEE} MON for price check #${i} (${['NEXUS', 'market avg', 'last 30 days'][i - 1]}) · settled in ${tx.settleMs} ms`, { txHash: tx.hash }));
      }
      events.push(ev('note', `Price checks done: ${product.name} at NEXUS is the best price (avg ${Math.round(total / 3)} ms per micro-payment).`));
    }
  }

  // Quote
  const unit = input.surge ? Math.round(product.price * SURGE_MULTIPLIER * 1000) / 1000 : product.price;
  const amount = parseEther(String(unit));
  const orderId = `NX-${Date.now().toString(36).toUpperCase()}`;
  events.push(ev('quote', `NEXUS quoted ${unit} MON for ${product.name} (order ${orderId})${input.surge ? ' · surge pricing +15%' : ''}`));

  const fresh = (await getMandate(pc, id, CHAIN_ID))!;
  const fee = await feeFor(pc, amount, CHAIN_ID);

  // Over budget or over cap: ask the owner instead of failing.
  if (amount + fee > fresh.remaining || amount > fresh.perPaymentCap) {
    const need = amount + fee > fresh.remaining ? amount + fee - fresh.remaining : amount - fresh.perPaymentCap;
    const ask = ((need + parseEther('0.001')) / parseEther('0.001')) * parseEther('0.001');
    if (fresh.pendingTopUp > 0n) {
      events.push(ev('note', `Waiting for you to approve the top-up of ${mon(fresh.pendingTopUp)}.`));
      return { events, outcome: 'need_topup', remaining: mon(fresh.remaining) };
    }
    const tx = await vaultWrite(wc, pc, 'requestTopUp', [id, ask, ref32(`price now ${unit} MON`)], { chainId: CHAIN_ID });
    events.push(ev('tx', `The price is above what's left (${mon(fresh.remaining)}). Asked you for +${mon(ask)}.`, { txHash: tx.hash }));
    return { events, outcome: 'need_topup', remaining: mon(fresh.remaining) };
  }

  // TaskGuard layer 3 (skipped in compromised mode, which already demonstrated the on-chain backstop).
  if (!input.compromised) {
    const intent = await intentScore(input.purpose, product.name);
    const risk = riskScore({
      purpose: input.purpose,
      item: product.name,
      amount: unit,
      typicalPrices: CATALOG.map((p) => p.price),
      remaining: Number(formatEther(fresh.remaining)),
      injectionExposure: exposure,
      payToMatchesIdentity: true,
      merchantIsNew: false,
      paymentsLastMinute: 3,
      intentScore: intent,
    });
    events.push(
      ev('guard', `TaskGuard risk ${risk.score}/100 → ${risk.decision === 'pay' ? 'pay' : risk.decision === 'step_up' ? 'ask you first' : 'block'}${risk.reasons.length ? ` (${risk.reasons.join('; ')})` : ''}`, {
        data: risk as any,
      }),
    );
    if (risk.decision === 'block') return { events, outcome: 'blocked', remaining: mon(fresh.remaining) };
    if (risk.decision === 'step_up') {
      const tx = await vaultWrite(wc, pc, 'requestApproval', [id, STORE_PAYTO, amount, ref32(orderId)], { chainId: CHAIN_ID });
      events.push(ev('tx', `Parked ${unit} MON to NEXUS for your one-tap confirmation.`, { txHash: tx.hash }));
      return { events, outcome: 'need_confirm', remaining: mon(fresh.remaining) };
    }
  }

  const tx = await vaultWrite(wc, pc, 'pay', [id, STORE_PAYTO, amount, ref32(orderId)], { chainId: CHAIN_ID });
  events.push(ev('tx', `Paid ${unit} MON to NEXUS for ${product.name} · settled in ${tx.settleMs} ms`, { txHash: tx.hash, data: { settleMs: tx.settleMs, explorer: explorerTx(tx.hash, CHAIN_ID) } }));
  const after = (await getMandate(pc, id, CHAIN_ID))!;
  return { events, outcome: 'paid', remaining: mon(after.remaining) };
}
