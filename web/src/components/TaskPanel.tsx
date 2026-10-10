'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { addressesFor, explorerAddress, mon, type Entry, type LocalStep, type Mandate } from '@taskpay/sdk';
import { PRICECHECK_PAYTO, STORE_PAYTO, readTaskMeta, stepsHash, useOwnerActions } from '@/lib/client';
import { Inr } from './Inr';
import { Timeline, type TimelineFilter } from './Timeline';
import { ProofCheck } from './ProofCheck';

type StepState = 'waiting' | 'running' | 'done' | 'needs' | 'stopped';
const n = (w: bigint) => Number(formatEther(w));
const fmt = (w: bigint, d = 4) => `${Number(n(w).toFixed(d))} MON`;

/** Plain-language view of a task: stepper, what needs you, a receipt, and the proof one click away. */
export function TaskPanel({ m, entries, steps, busy, onAction }: { m: Mandate; entries: Entry[]; steps: LocalStep[]; busy?: boolean; onAction?: (what: string, hash: string) => void }) {
  const { address } = useAccount();
  const a = useOwnerActions();
  const [proof, setProof] = useState(false);
  const [tab, setTab] = useState<TimelineFilter>('chain');
  const isOwner = address?.toLowerCase() === m.owner.toLowerCase();
  const id = m.id.toString();
  const item = readTaskMeta(id)?.item ?? 'your item';
  const open = m.status === 'Open';
  const expired = open && m.expiry * 1000 < Date.now();
  const run = async (what: string, p: Promise<{ hash: string }>) => {
    try {
      onAction?.(what, (await p).hash);
    } catch {
      /* error shown below */
    }
  };

  // Money, straight from the vault's record.
  const paid = (to: string) => entries.filter((e) => (e.kind === 'Paid' || e.kind === 'ApprovalConfirmed') && e.counterparty.toLowerCase() === to);
  const itemPaid = paid(STORE_PAYTO).reduce((s, e) => s + e.amount, 0n);
  const checks = paid(PRICECHECK_PAYTO);
  const checksPaid = checks.reduce((s, e) => s + e.amount, 0n);
  const fees = m.spent > itemPaid + checksPaid ? m.spent - itemPaid - checksPaid : 0n;
  const returned = entries.filter((e) => e.kind === 'Closed' || e.kind === 'Reclaimed').reduce((s, e) => s + e.amount, 0n);
  const attacks = entries.filter((e) => e.kind === 'Blocked').length;
  const needsYou = open && (m.pendingTopUp > 0n || !!m.pendingPayment || m.frozen);

  const st = (cond: { done: boolean; running?: boolean; needs?: boolean; stopped?: boolean }): StepState =>
    cond.done ? 'done' : cond.needs ? 'needs' : cond.stopped ? 'stopped' : cond.running ? 'running' : 'waiting';
  const stages: { label: string; state: StepState; line: string }[] = [
    { label: 'Budget set aside', state: 'done', line: `${fmt(m.originalBudget)} set aside. Only this task can use it.` },
    {
      label: 'Comparing prices',
      state: st({ done: checks.length > 0 || itemPaid > 0n, running: open && busy, stopped: !open && checks.length === 0 }),
      line: checks.length ? `Asked PriceCheck ${checks.length} questions · ${fmt(checksPaid)} in pay-per-check fees` : open ? 'Asking PriceCheck if this is a fair price…' : 'Skipped',
    },
    {
      label: 'Buying',
      state: st({ done: itemPaid > 0n, needs: needsYou, running: open && busy && checks.length > 0, stopped: !open && itemPaid === 0n }),
      line: itemPaid > 0n ? `Bought the ${item} for ${fmt(itemPaid)}` : needsYou ? 'Waiting for you (see below)' : open ? `Buying the ${item}…` : 'Not bought',
    },
    {
      label: 'Done',
      state: st({ done: !open, running: open && itemPaid > 0n }),
      line: !open ? `${fmt(returned)} returned to you` : itemPaid > 0n ? 'Sending back what wasn’t spent…' : 'Unspent money comes back to you',
    },
  ];
  const chip = !open
    ? { t: itemPaid > 0n ? 'Done' : 'Stopped', c: 'bg-neutral-200 text-neutral-700' }
    : needsYou
      ? { t: 'Needs you', c: 'bg-[var(--color-warn)] text-white' }
      : expired
        ? { t: 'Expired', c: 'bg-[var(--color-warn)] text-white' }
        : { t: 'In progress', c: 'bg-[var(--color-volt)] text-black' };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label text-neutral-500">Task #{id}</div>
          <div className="mt-1 text-[20px] font-bold leading-tight">{item}</div>
        </div>
        <span className={`label shrink-0 rounded px-2.5 py-1 ${chip.c}`}>{chip.t}</span>
      </div>

      {/* Stepper */}
      <ol className="relative space-y-4 pl-8">
        <span className="absolute bottom-2 left-[11px] top-2 w-px bg-[var(--color-fog)]" />
        {stages.map((s) => (
          <li key={s.label} className="relative">
            <span
              className={`absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                s.state === 'done'
                  ? 'bg-black text-[var(--color-volt)]'
                  : s.state === 'needs'
                    ? 'bg-[var(--color-warn)] text-white'
                    : s.state === 'running'
                      ? 'animate-pulse bg-[var(--color-volt)] text-black'
                      : s.state === 'stopped'
                        ? 'bg-neutral-200 text-neutral-500'
                        : 'border border-[var(--color-fog)] bg-white text-neutral-400'
              }`}
            >
              {s.state === 'done' ? '✓' : s.state === 'needs' ? '!' : s.state === 'stopped' ? '–' : '•'}
            </span>
            <div className={`text-[13px] font-semibold ${s.state === 'waiting' || s.state === 'stopped' ? 'text-neutral-400' : ''}`}>{s.label}</div>
            <div className="text-[12px] text-neutral-600">{s.line}</div>
          </li>
        ))}
      </ol>

      {attacks > 0 && (
        <div className="rounded-xl border border-[var(--color-ok)]/40 bg-emerald-50 p-4 text-[13px]">
          <div className="font-semibold">🛡️ We stopped {attacks === 1 ? 'a payment' : `${attacks} payments`} to an unknown address</div>
          <p className="mt-1 text-neutral-700">It wasn’t the shop for this task, so the budget refused it. Your money is safe.</p>
        </div>
      )}

      {/* Needs you */}
      {open && m.pendingTopUp > 0n && (
        <div className="rise rounded-xl border border-[var(--color-warn)] bg-amber-50 p-4">
          <div className="text-[14px] font-bold">✋ The price went up</div>
          <p className="mt-1 text-[13px] leading-relaxed">
            There’s {fmt(m.remaining)} left, and buying now costs about {fmt(m.remaining + m.pendingTopUp)} (incl. a small 0.5% fee). Add {fmt(m.pendingTopUp)}{' '}
            <Inr mon={n(m.pendingTopUp)} /> and buy it?
          </p>
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn" disabled={!!a.pending} onClick={() => run('topup', a.approveTopUp(m.id, m.pendingTopUp))}>
                {a.pending === 'topup' ? 'Confirm in MetaMask…' : `Add ${fmt(m.pendingTopUp)} & buy`}
              </button>
              <button className="text-[12px] font-semibold underline" disabled={!!a.pending} onClick={() => run('decline', a.declineTopUp(m.id))}>
                No, don’t add more
              </button>
            </div>
          )}
        </div>
      )}
      {open && m.pendingPayment && (
        <div className="rise rounded-xl border border-[var(--color-warn)] bg-amber-50 p-4">
          <div className="text-[14px] font-bold">✋ Is this you?</div>
          <p className="mt-1 text-[13px] leading-relaxed">
            The agent wants to pay {fmt(m.pendingPayment.amount)} <Inr mon={n(m.pendingPayment.amount)} />, but something looked unusual (for example a suspicious review on the product). Only approve
            if this is what you asked for.
          </p>
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn" disabled={!!a.pending} onClick={() => run('reject', a.reject(m.id))}>
                {a.pending === 'reject' ? 'Confirm…' : 'Don’t pay'}
              </button>
              <button className="text-[12px] font-semibold underline" disabled={!!a.pending} onClick={() => run('confirm', a.confirm(m.id))}>
                {a.pending === 'confirm' ? 'Confirm in MetaMask…' : `Yes, pay ${fmt(m.pendingPayment.amount)}`}
              </button>
            </div>
          )}
        </div>
      )}
      {open && m.frozen && isOwner && (
        <div className="rounded-xl border border-[var(--color-bad)] bg-red-50 p-4 text-[13px]">
          <div className="font-bold">This task is paused</div>
          <p className="mt-1">It was paused after {m.blocked} refused payments. Get your money back, or let it continue.</p>
          <div className="mt-3 flex gap-3">
            <button className="btn" disabled={!!a.pending} onClick={() => run('cancel', a.cancel(m.id, stepsHash(id)))}>
              Return my money
            </button>
            <button className="text-[12px] font-semibold underline" disabled={!!a.pending} onClick={() => run('unfreeze', a.unfreeze(m.id))}>
              Let it continue
            </button>
          </div>
        </div>
      )}

      {/* Money */}
      {open ? (
        <div className="rounded-xl bg-[var(--color-mist)] p-4">
          <div className="flex items-baseline justify-between text-[13px]">
            <span>
              Spent <b>{fmt(m.spent)}</b> of {fmt(m.budget)}
            </span>
            <Inr mon={n(m.spent)} className="text-[12px] text-neutral-500" />
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white">
            <div className="h-1.5 rounded-full bg-black transition-all" style={{ width: `${m.budget > 0n ? Math.min(100, Number((m.spent * 1000n) / m.budget) / 10) : 0}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-neutral-500">
            Most it can pay at once: {fmt(m.perPaymentCap)} · ends {new Date(m.expiry * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-fog)] p-4 text-[13px]">
          <div className="label mb-3 text-neutral-500">Receipt</div>
          {[
            ['Budget set aside', m.budget, ''],
            [item, itemPaid, '−'],
            [`PriceCheck lookups (${checks.length} × 0.001)`, checksPaid, '−'],
            ['TaskPay fee (0.5%)', fees, '−'],
          ]
            .filter(([, v]) => (v as bigint) > 0n)
            .map(([label, v, sign]) => (
              <div key={label as string} className="flex justify-between py-1">
                <span className="text-neutral-600">{label as string}</span>
                <span className="tabular-nums">
                  {sign as string}
                  {fmt(v as bigint)} <Inr mon={n(v as bigint)} className="ml-1 text-[11px] text-neutral-400" />
                </span>
              </div>
            ))}
          {checks.length > 0 && (
            <details className="mt-1 text-[11.5px] text-neutral-500">
              <summary className="cursor-pointer select-none">What’s PriceCheck?</summary>
              <p className="mt-1 leading-relaxed">
                A separate price-comparison service that charges per question instead of a subscription. Before buying, the agent asks it for BlockMart’s live price, what 3 other
                shops charge and the 30-day price history, so it doesn’t overpay. Each answer costs 0.001 MON, paid from this task’s budget, and the service checks that payment on
                Monad before it replies. That only works because Monad payments cost almost nothing and settle instantly.
              </p>
            </details>
          )}
          <div className="mt-2 flex justify-between border-t border-[var(--color-fog)] pt-2 font-bold">
            <span>Returned to you</span>
            <span className="tabular-nums">
              {fmt(returned)} <Inr mon={n(returned)} className="ml-1 text-[11px] font-normal text-neutral-400" />
            </span>
          </div>
        </div>
      )}

      {/* Quiet actions */}
      {open && isOwner && (
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          {expired ? (
            <button className="btn" disabled={!!a.pending} onClick={() => run('reclaim', a.reclaim(m.id))}>
              {a.pending === 'reclaim' ? 'Confirm…' : 'Get my money back'}
            </button>
          ) : (
            <button className="font-semibold underline" disabled={!!a.pending} onClick={() => run('cancel', a.cancel(m.id, stepsHash(id)))}>
              {a.pending === 'cancel' ? 'Confirm in MetaMask…' : 'Stop & return my money'}
            </button>
          )}
          <button className="font-semibold text-[var(--color-bad)] underline" disabled={!!a.pending} onClick={() => run('freeze', a.freeze(m.agent))}>
            {a.pending === 'freeze' ? 'Confirm…' : 'Emergency: freeze the agent'}
          </button>
        </div>
      )}
      {a.error && <p className="text-[12px] text-[var(--color-bad)]">{a.error}</p>}

      {/* Proof, one click away */}
      <div className="border-t border-[var(--color-fog)] pt-4">
        <button className="flex w-full items-center justify-between text-[13px] font-semibold" onClick={() => setProof((p) => !p)}>
          <span>🔐 Proof on Monad · {entries.length} recorded steps</span>
          <span className="text-neutral-400">{proof ? 'Hide' : 'Show'}</span>
        </button>
        {proof && (
          <div className="mt-4 space-y-4">
            <ProofCheck m={m} entries={entries} />
            <div className="flex rounded-xl bg-[var(--color-mist)] p-1 text-[11px] font-semibold">
              {(
                [
                  ['chain', `Recorded on Monad (${entries.length})`],
                  ['local', `Agent notes (${steps.length})`],
                  ['all', 'Both'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`flex-1 rounded-lg py-1.5 ${tab === k ? 'bg-white shadow-sm' : 'text-neutral-500'}`} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <Timeline m={m} entries={entries} steps={steps} filter={tab} compact />
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <a className="rounded-lg border border-[var(--color-fog)] px-3 py-2 hover:bg-[var(--color-mist)]" href={explorerAddress(addressesFor(10143).vault!)} target="_blank" rel="noreferrer">
                TaskPay vault contract ↗
              </a>
              <a className="rounded-lg border border-[var(--color-fog)] px-3 py-2 hover:bg-[var(--color-mist)]" href={explorerAddress(m.agent)} target="_blank" rel="noreferrer">
                Agent’s transactions ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
