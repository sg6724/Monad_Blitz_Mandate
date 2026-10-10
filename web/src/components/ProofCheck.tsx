'use client';

import { useState } from 'react';
import { verifyHistory, verifyLogHash, type Entry, type Mandate } from '@taskpay/sdk';
import { readSteps } from '@/lib/client';

/**
 * Re-checks, in the browser, that the vault's record is intact: each step's seal must match the one before it,
 * and the agent's notes must match the fingerprint stored on Monad when the task closed.
 */
export function ProofCheck({ m, entries }: { m: Mandate; entries: Entry[] }) {
  const [res, setRes] = useState<{ chain: boolean; notes: 'match' | 'mismatch' | 'none' | 'open'; first: number | null } | null>(null);

  function check() {
    const chain = verifyHistory(entries, m);
    let notes: 'match' | 'mismatch' | 'none' | 'open' = 'open';
    if (m.status !== 'Open') {
      const steps = readSteps(m.id.toString());
      if (/^0x0+$/.test(m.logHash)) notes = 'none';
      else if (!steps.length) notes = 'none';
      else {
        // The fingerprint is taken when the task closes, so later notes (the refund line) aren't part of it.
        notes = 'mismatch';
        for (let k = steps.length; k > 0; k--) if (verifyLogHash(steps.slice(0, k), m).ok) notes = 'match';
      }
    }
    setRes({ chain: chain.ok, notes, first: chain.firstMismatch });
  }

  return (
    <div className="rounded-xl border border-[var(--color-fog)] p-4 text-[12.5px]">
      <div className="font-semibold">Is this record genuine?</div>
      <p className="mt-1 text-neutral-600">
        Every step is sealed to the one before it on Monad, so nobody (including us) can change or delete one later without it showing.
      </p>
      <button className="btn btn-line mt-3 h-9 px-4" onClick={check}>
        Check the record now
      </button>
      {res && (
        <ul className="mt-3 space-y-1.5">
          <li className={res.chain ? 'text-emerald-800' : 'text-red-700'}>
            {res.chain ? '✓' : '✗'} {entries.length} recorded steps, all seals match
            {!res.chain && res.first !== null ? ` (broken at step ${res.first + 1})` : ''}
          </li>
          <li className={res.notes === 'match' ? 'text-emerald-800' : res.notes === 'mismatch' ? 'text-red-700' : 'text-neutral-500'}>
            {res.notes === 'match'
              ? '✓ The agent’s notes in this browser match the fingerprint saved on Monad'
              : res.notes === 'mismatch'
                ? '✗ The agent’s notes here don’t match the fingerprint on Monad'
                : res.notes === 'open'
                  ? '• The agent’s notes get fingerprinted on Monad when the task ends'
                  : '• No agent notes in this browser to compare (the task ran elsewhere)'}
          </li>
        </ul>
      )}
    </div>
  );
}
