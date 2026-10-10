'use client';

import { explorerTx, mergeTimeline, toCsv, type Entry, type LocalStep, type Mandate } from '@taskpay/sdk';
import { NAMES } from '@/lib/client';

const TONE: Record<string, string> = {
  ok: 'bg-[var(--color-ok)]',
  warn: 'bg-[var(--color-warn)]',
  bad: 'bg-[var(--color-bad)]',
  info: 'bg-neutral-400',
};

export function Timeline({ m, entries, steps }: { m: Mandate; entries: Entry[]; steps: LocalStep[] }) {
  const names = { ...NAMES, [m.owner.toLowerCase()]: 'you' };
  const lines = mergeTimeline(entries, m, steps, names);
  const txOf = (l: (typeof lines)[number]) => (l.source === 'local' && l.hash && l.hash.length === 66 ? l.hash : undefined);

  function exportCsv() {
    const blob = new Blob([toCsv(lines)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taskpay-${m.id}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="label">Timeline</div>
        <button className="label text-neutral-500 underline" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <ol className="space-y-0">
        {lines.map((l, i) => (
          <li key={i} className="grid grid-cols-[64px_14px_1fr] gap-3 border-b border-[var(--color-fog)] py-2.5 text-[12.5px]">
            <span className="text-neutral-500 tabular-nums">{new Date(l.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className={`mt-1.5 h-2 w-2 rounded-full ${TONE[l.tone]}`} />
            <span>
              {l.source === 'chain' && <span className="label mr-2 bg-black px-1.5 py-0.5 text-[9px] text-white">on-chain</span>}
              {l.text}
              {txOf(l) && (
                <a className="ml-2 text-neutral-500 underline" href={explorerTx(txOf(l)!)} target="_blank" rel="noreferrer">
                  tx
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-neutral-500">
        On-chain lines come from the vault&apos;s hash-chained history (last hash {m.lastHash.slice(0, 10)}…). Agent notes are stored in this browser.
      </p>
    </div>
  );
}
