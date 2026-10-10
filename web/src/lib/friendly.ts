/**
 * Plain-language versions of the agent's log lines, for people who don't speak crypto.
 * The raw lines stay available under "Proof on Monad".
 */
export type Friendly = { icon: string; text: string; tone?: 'ok' | 'warn' | 'bad' | 'safe'; group?: string; amount?: number };

const OWNER: Record<string, string> = {
  topup: 'You added more to the budget',
  decline: 'You said no to adding more',
  confirm: 'You approved the payment',
  reject: 'You turned down the payment',
  cancel: 'You stopped the task. Your money is on its way back',
  freeze: 'You froze the agent. All its budgets went back to you',
  reclaim: 'The task expired. Your money went back to you',
  unfreeze: 'You unfroze the task',
};

export function friendly(text: string, kind?: string): Friendly | null {
  let m: RegExpMatchArray | null;
  if (/^Drafted /.test(text)) return null;
  if ((m = text.match(/^Task #(\d+) created/))) return { icon: '🔒', text: 'Budget set aside for this task', tone: 'ok' };
  if ((m = text.match(/^Browsing BlockMart for "(.+)"/))) return { icon: '🔎', text: `Looked for the ${m[1]} at BlockMart` };
  if (kind === 'injection' || /flagged a .* review/.test(text)) {
    const p = text.match(/review on (.+?) by/);
    return { icon: '⚠️', text: `Spotted a fake review${p ? ` on the ${p[1]}` : ''} telling AI agents to send money elsewhere. Ignored it.`, tone: 'warn' };
  }
  if (/^Compromised mode/.test(text)) return { icon: '🎭', text: 'Demo: the agent was tricked and tried to send your money to an unknown address', tone: 'bad' };
  if (/blocked it on-chain/i.test(text)) return { icon: '🛡️', text: 'Stopped a payment to an unknown address. It isn’t the shop for this task. Your money is safe.', tone: 'safe' };
  if ((m = text.match(/^Paid ([\d.]+) MON for price check/))) return { icon: '🏷️', text: 'Checked prices', group: 'pricecheck', amount: Number(m[1]) };
  if ((m = text.match(/^Price checks done: (.+) at BlockMart is the best price/))) return { icon: '✅', text: `Best price for the ${m[1]}: BlockMart` };
  if ((m = text.match(/^BlockMart quoted ([\d.]+) MON for (.+?) \(order/))) return { icon: '🧾', text: `BlockMart’s price: ${m[1]} MON${/surge/.test(text) ? ' (went up 15% just now)' : ''}` };
  if ((m = text.match(/only ([\d.]+ MON) is left in this task\. Asked you for \+([\d.]+ MON)/))) return { icon: '✋', text: `The price is more than what’s left (${m[1]}). Asked you to add ${m[2]}.`, tone: 'warn' };
  if ((m = text.match(/^Waiting for you to approve the top-up of (.+)\./))) return { icon: '✋', text: `Waiting for you to add ${m[1]}`, tone: 'warn' };
  if ((m = text.match(/^TaskGuard risk (\d+)\/100 → (pay|ask you first|block)/))) {
    if (m[2] === 'pay') return { icon: '✅', text: 'Safety check passed' };
    if (m[2] === 'ask you first') return { icon: '✋', text: 'This payment looks unusual, so it needs your OK first', tone: 'warn' };
    return { icon: '⛔', text: 'Safety check failed, so the payment was stopped', tone: 'bad' };
  }
  if (/^Parked /.test(text)) return { icon: '⏸️', text: 'Payment is on hold until you confirm it', tone: 'warn' };
  if ((m = text.match(/^Paid ([\d.]+) MON to BlockMart for (.+?) ·/))) return { icon: '🛍️', text: `Bought the ${m[2]} for ${m[1]} MON`, tone: 'ok' };
  if ((m = text.match(/^Closed the task\. (.+) went back to your wallet/))) return { icon: '↩️', text: `${m[1]} returned to your wallet`, tone: 'ok' };
  if ((m = text.match(/^Owner action recorded: (\w+)/))) return { icon: '👤', text: OWNER[m[1]] ?? 'You updated the task' };
  if (/^Owner: /.test(text)) return null;
  return { icon: '•', text };
}

/** Rolls repeated price checks into one line. */
export function rollUp(items: (Friendly & { at?: number; txHash?: string })[]) {
  const out: (Friendly & { at?: number; count?: number })[] = [];
  for (const f of items) {
    const last = out[out.length - 1];
    if (f.group && last?.group === f.group) {
      last.count = (last.count ?? 1) + 1;
      last.amount = (last.amount ?? 0) + (f.amount ?? 0);
      last.at = f.at ?? last.at;
      continue;
    }
    out.push({ ...f });
  }
  return out.map((f) =>
    f.group === 'pricecheck' ? { ...f, text: `Checked prices at ${f.count ?? 1} places · ${Number((f.amount ?? 0).toFixed(4))} MON in small fees` } : f,
  );
}

export function ago(at?: number) {
  if (!at) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - at));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
