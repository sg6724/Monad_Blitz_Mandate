'use client';

import { useAccount } from 'wagmi';
import { explorerAddress, mon, short, type Mandate } from '@taskpay/sdk';
import { stepsHash, useOwnerActions } from '@/lib/client';
import { Inr } from './Inr';

export function statusOf(m: Mandate) {
  if (m.status === 'Closed') return { label: 'Closed', cls: 'bg-neutral-200 text-neutral-700' };
  if (m.frozen) return { label: 'Frozen', cls: 'bg-[var(--color-bad)] text-white' };
  if (m.expiry * 1000 < Date.now()) return { label: 'Expired', cls: 'bg-[var(--color-warn)] text-white' };
  return { label: 'Open', cls: 'bg-[var(--color-volt)] text-black' };
}

/** Budget bar plus every owner action, each a single MetaMask confirmation. */
export function MandatePanel({ m, onAction }: { m: Mandate; onAction?: (what: string, hash: string) => void }) {
  const { address } = useAccount();
  const a = useOwnerActions();
  const isOwner = address?.toLowerCase() === m.owner.toLowerCase();
  const pct = m.budget > 0n ? Number((m.spent * 1000n) / m.budget) / 10 : 0;
  const st = statusOf(m);
  const open = m.status === 'Open';
  const expired = m.expiry * 1000 < Date.now();
  const run = async (what: string, p: Promise<{ hash: string }>) => {
    try {
      const r = await p;
      onAction?.(what, r.hash);
    } catch {
      /* error shown below */
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="display text-[28px]">Task #{m.id.toString()}</div>
        <span className={`label px-2.5 py-1 ${st.cls}`}>{st.label}</span>
      </div>
      <div>
        <div className="flex justify-between text-[12px]">
          <span>
            Spent {mon(m.spent)} <Inr mon={mon(m.spent)} />
          </span>
          <span className="font-semibold">
            Left {mon(m.remaining)} <Inr mon={mon(m.remaining)} className="font-normal text-neutral-500" />
          </span>
        </div>
        <div className="mt-2 h-2 w-full bg-[var(--color-fog)]">
          <div className="h-2 bg-black transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
          <span>Budget {mon(m.budget)}{m.toppedUp > 0n ? ` (incl. +${mon(m.toppedUp)} top-up)` : ''}</span>
          <span>Cap {mon(m.perPaymentCap)} / payment</span>
        </div>
      </div>

      {open && m.pendingTopUp > 0n && (
        <div className="rise border border-[var(--color-warn)] bg-amber-50 p-4">
          <div className="label text-[var(--color-warn)]">Agent asks for more</div>
          <p className="mt-1 text-[13px]">
            The price is now higher than what&apos;s left. This task has {mon(m.remaining)} left (after price checks), and the purchase needs about{' '}
            {mon(m.remaining + m.pendingTopUp)} including the 0.5% TaskPay fee. The agent wants +{mon(m.pendingTopUp)} to finish. Only you can add it.
          </p>
          {isOwner && (
            <div className="mt-3 flex gap-2">
              <button className="btn" disabled={!!a.pending} onClick={() => run('topup', a.approveTopUp(m.id, m.pendingTopUp))}>
                {a.pending === 'topup' ? 'Confirm in MetaMask…' : `Add ${mon(m.pendingTopUp)}`}
              </button>
              <button className="btn btn-line" disabled={!!a.pending} onClick={() => run('decline', a.declineTopUp(m.id))}>
                Decline
              </button>
            </div>
          )}
        </div>
      )}

      {open && m.pendingPayment && (
        <div className="rise border border-[var(--color-warn)] bg-amber-50 p-4">
          <div className="label text-[var(--color-warn)]">TaskGuard step-up</div>
          <p className="mt-1 text-[13px]">
            The agent wants to pay {mon(m.pendingPayment.amount)} to {short(m.pendingPayment.payee)}, but TaskGuard flagged a risk. Confirm only if this is what you asked for.
          </p>
          {isOwner && (
            <div className="mt-3 flex gap-2">
              <button className="btn" disabled={!!a.pending} onClick={() => run('confirm', a.confirm(m.id))}>
                {a.pending === 'confirm' ? 'Confirm in MetaMask…' : 'Confirm payment'}
              </button>
              <button className="btn btn-line" disabled={!!a.pending} onClick={() => run('reject', a.reject(m.id))}>
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {m.frozen && open && isOwner && (
        <div className="border border-[var(--color-bad)] bg-red-50 p-4 text-[13px]">
          Frozen after {m.blocked} blocked attempts. Review the timeline, then refund or unfreeze.
          <div className="mt-3 flex gap-2">
            <button className="btn btn-line" disabled={!!a.pending} onClick={() => run('unfreeze', a.unfreeze(m.id))}>
              Unfreeze
            </button>
          </div>
        </div>
      )}

      {open && isOwner && (
        <div className="flex flex-wrap gap-2">
          {expired ? (
            <button className="btn" disabled={!!a.pending} onClick={() => run('reclaim', a.reclaim(m.id))}>
              {a.pending === 'reclaim' ? 'Confirm…' : 'Reclaim refund'}
            </button>
          ) : (
            <button className="btn btn-line" disabled={!!a.pending} onClick={() => run('cancel', a.cancel(m.id, stepsHash(m.id.toString())))}>
              {a.pending === 'cancel' ? 'Confirm…' : 'Cancel & refund'}
            </button>
          )}
          <button className="btn bg-[var(--color-bad)]" disabled={!!a.pending} onClick={() => run('freeze', a.freeze(m.agent))}>
            {a.pending === 'freeze' ? 'Confirm…' : 'Freeze agent & refund all'}
          </button>
        </div>
      )}
      {a.error && <p className="text-[12px] text-[var(--color-bad)]">{a.error}</p>}

      <div className="grid grid-cols-2 gap-3 text-[11px] text-neutral-500">
        <div>
          Agent{' '}
          <a className="underline" href={explorerAddress(m.agent)} target="_blank" rel="noreferrer">
            {short(m.agent)}
          </a>
        </div>
        <div className="text-right">Expires {new Date(m.expiry * 1000).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}
