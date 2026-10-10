'use client';

import { explorerTx, mergeTimeline, toCsv, type Entry, type LocalStep, type Mandate } from '@taskpay/sdk';
import { NAMES } from '@/lib/client';

const TONE: Record<string, string> = {
  ok: 'bg-[var(--color-ok)]',
  warn: 'bg-[var(--color-warn)]',
  bad: 'bg-[var(--color-bad)]',
  info: 'bg-neutral-400',
};

export type TimelineFilter = 'all' | 'chain' | 'local';

export function Timeline({ m, entries, steps, filter = 'all', compact = false }: { m: Mandate; entries: Entry[]; steps: LocalStep[]; filter?: TimelineFilter; compact?: boolean }) {
  const names = { ...NAMES, [m.owner.toLowerCase()]: 'you' };
  const all = mergeTimeline(entries, m, steps, names);
  const lines = filter === 'all' ? all : all.filter((l) => l.source === filter);
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
      <div className={`mb-3 flex items-center justify-between ${compact ? 'hidden' : ''}`}>
        <div className="label">Timeline</div>
        <button className="label text-neutral-500 underline" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <ol className="space-y-0">
        {!lines.length && <li className="py-4 text-[12px] text-neutral-500">Nothing here yet.</li>}
        {lines.map((l, i) => (
          <li key={i} className="grid grid-cols-[64px_14px_1fr] gap-3 border-b border-[var(--color-fog)] py-2.5 text-[12.5px]">
            <span className="text-neutral-500 tabular-nums">{new Date(l.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className={`mt-1.5 h-2 w-2 rounded-full ${TONE[l.tone]}`} />
            <span>
              {filter === 'all' && (l.source === 'chain' ? <span className="label mr-2 bg-black px-1.5 py-0.5 text-[9px] text-white">on-chain</span> : <span className="label mr-2 bg-[var(--color-fog)] px-1.5 py-0.5 text-[9px] text-neutral-600">agent log</span>)}
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
      <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          {filter === 'local'
            ? 'Stored in this browser. Its hash is written on-chain when the task closes.'
            : `Hash-chained in the vault · head ${m.lastHash.slice(0, 10)}…`}
        </span>
        {compact && (
          <button className="underline" onClick={exportCsv}>
            CSV
          </button>
        )}
      </div>
    </div>
  );
}
