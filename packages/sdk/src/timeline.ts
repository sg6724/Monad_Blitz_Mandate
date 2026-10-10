import type { Address, Hex } from 'viem';
import { mon, refText, short, REASON_TEXT, type Entry, type Mandate } from './vault';

/** A step the agent took off-chain (stored locally: ~/.taskpay/logs or browser localStorage). */
export type LocalStep = {
  at: number; // unix seconds
  kind: 'question' | 'answer' | 'search' | 'quote' | 'guard' | 'injection' | 'note' | 'tx' | 'onramp';
  text: string;
  txHash?: Hex;
  data?: Record<string, unknown>;
};

export type TimelineLine = {
  at: number;
  source: 'chain' | 'local';
  tone: 'ok' | 'warn' | 'bad' | 'info';
  text: string;
  hash?: Hex;
};

export function describeEntry(e: Entry, m: Pick<Mandate, 'owner' | 'agent' | 'expiry'>, names: Record<string, string> = {}): TimelineLine {
  const who = (a: Address) => names[a.toLowerCase()] ?? short(a);
  const ref = refText(e.ref);
  const base = { at: e.at, source: 'chain' as const, hash: e.hash };
  switch (e.kind) {
    case 'Created':
      return { ...base, tone: 'info', text: `Approved: up to ${mon(e.amount)} until ${new Date(m.expiry * 1000).toLocaleString()}` };
    case 'Paid':
      return { ...base, tone: 'ok', text: `Paid ${mon(e.amount)} to ${who(e.counterparty)}${ref ? ` for ${ref}` : ''}` };
    case 'Blocked':
      return { ...base, tone: 'bad', text: `Blocked: ${mon(e.amount)} to ${who(e.counterparty)} (${REASON_TEXT[e.reason]})` };
    case 'ApprovalRequested':
      return { ...base, tone: 'warn', text: `Waiting for your OK: ${mon(e.amount)} to ${who(e.counterparty)}${ref ? ` (${ref})` : ''}` };
    case 'ApprovalConfirmed':
      return { ...base, tone: 'ok', text: `You confirmed: paid ${mon(e.amount)} to ${who(e.counterparty)}` };
    case 'ApprovalRejected':
      return { ...base, tone: 'info', text: `You rejected a ${mon(e.amount)} payment to ${who(e.counterparty)}` };
    case 'TopUpRequested':
      return { ...base, tone: 'warn', text: `Agent asked for +${mon(e.amount)}${ref ? ` (${ref})` : ''}` };
    case 'TopUpApproved':
      return { ...base, tone: 'ok', text: `You added ${mon(e.amount)} to the budget` };
    case 'TopUpDeclined':
      return { ...base, tone: 'info', text: `You declined a top-up of ${mon(e.amount)}` };
    case 'Frozen':
      return { ...base, tone: 'bad', text: e.counterparty.toLowerCase() === m.owner.toLowerCase() ? 'Agent frozen by you' : 'Auto-frozen after 3 blocked attempts' };
    case 'Unfrozen':
      return { ...base, tone: 'info', text: 'Unfrozen' };
    case 'Closed':
      return { ...base, tone: 'ok', text: `Task closed. Refunded ${mon(e.amount)} to your wallet` };
    case 'Reclaimed':
      return { ...base, tone: 'ok', text: `Task expired. Refunded ${mon(e.amount)} to your wallet` };
  }
}

export function mergeTimeline(entries: Entry[], m: Pick<Mandate, 'owner' | 'agent' | 'expiry'>, steps: LocalStep[], names: Record<string, string> = {}) {
  const chain = entries.map((e) => ({ ...describeEntry(e, m, names), order: e.index }));
  const local = steps.map((s, i) => ({
    at: s.at,
    source: 'local',
    tone: s.kind === 'injection' ? 'bad' : s.kind === 'guard' ? 'warn' : 'info',
    text: s.text,
    hash: s.txHash,
    order: 1e6 + i,
  }));
  return [...chain, ...local]
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ order: _o, ...l }) => l as TimelineLine);
}

export function toCsv(lines: TimelineLine[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['time,source,tone,text,hash', ...lines.map((l) => [new Date(l.at * 1000).toISOString(), l.source, l.tone, esc(l.text), l.hash ?? ''].join(','))].join('\n');
}
