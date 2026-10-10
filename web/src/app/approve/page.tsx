'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { decodeDraft, draftId as draftIdOf, findByDraft, type Draft } from '@taskpay/sdk';
import { TaskCard } from '@/components/TaskCard';
import { ConnectButton, useWallet } from '@/components/WalletPanel';
import { saveTaskMeta, useOwnerActions } from '@/lib/client';
import { pc } from '@/lib/useMandate';

/** Opened from an MCP approve_url: the draft travels in the URL fragment, no server stores it. */
export default function ApprovePage() {
  const w = useWallet();
  const a = useOwnerActions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bad, setBad] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const d = decodeDraft(window.location.hash.slice(1));
      setDraft(d);
      findByDraft(pc, draftIdOf(d)).then((id) => id > 0n && setDone(id.toString()));
    } catch {
      setBad(true);
    }
  }, []);

  async function lock() {
    if (!draft) return;
    try {
      await a.lock(draft);
      const id = (await findByDraft(pc, draftIdOf(draft))).toString();
      saveTaskMeta(id, { item: draft.item!, purpose: `${draft.task} — ${draft.item}` });
      setDone(id);
    } catch {
      /* shown */
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-6 py-14">
      <div className="label">Approve a task</div>
      <h1 className="display mt-3 text-[44px]">Your agent is asking for a budget</h1>
      <p className="mt-4 text-[13px] text-neutral-600">Check the card. Locking sends the budget to the TaskPay vault. The agent can only spend it as shown, and the rest comes back to you.</p>
      <div className="mt-8">
        {bad && <p className="text-[var(--color-bad)]">This approve link is invalid.</p>}
        {draft && (
          <TaskCard
            draft={draft}
            action={
              done ? (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">Locked as task #{done}. Your agent will continue.</span>
                  <Link className="btn" href={`/mandate/${done}`}>
                    View task
                  </Link>
                </div>
              ) : !w.isConnected || w.wrongChain ? (
                <ConnectButton className="btn w-full" />
              ) : (
                <div className="space-y-2">
                  <button className="btn w-full" disabled={!!a.pending} onClick={lock}>
                    {a.pending ? 'Confirm in MetaMask…' : `Lock ${draft.budget} MON`}
                  </button>
                  {a.error && <p className="text-[12px] text-[var(--color-bad)]">{a.error}</p>}
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
