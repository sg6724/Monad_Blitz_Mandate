'use client';

import Link from 'next/link';
import { mon } from '@taskpay/sdk';
import { ConnectButton, useWallet } from '@/components/WalletPanel';
import { statusOf } from '@/components/MandatePanel';
import { readTaskMeta } from '@/lib/client';
import { useMyMandates } from '@/lib/useMandate';

export default function TasksPage() {
  const w = useWallet();
  const { data, isLoading } = useMyMandates(w.address);
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12 md:px-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="label">Your tasks</div>
          <h1 className="display mt-3 text-[48px]">Budgets you gave your agent</h1>
        </div>
        <Link href="/agent" className="btn">
          New task
        </Link>
      </div>
      {!w.isConnected ? (
        <div className="mt-10">
          <ConnectButton />
        </div>
      ) : isLoading ? (
        <p className="mt-10 text-[13px]">Loading from Monad…</p>
      ) : !data?.length ? (
        <p className="mt-10 text-[13px]">No tasks yet. Ask the AI shopper for something.</p>
      ) : (
        <table className="mt-10 w-full text-[13px]">
          <thead>
            <tr className="label border-b border-black text-left">
              <th className="py-3">Task</th>
              <th>Item</th>
              <th>Status</th>
              <th className="text-right">Spent</th>
              <th className="text-right">Budget</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((m) => {
              const st = statusOf(m);
              return (
                <tr key={m.id.toString()} className="border-b border-[var(--color-fog)]">
                  <td className="py-3 font-semibold">#{m.id.toString()}</td>
                  <td>{readTaskMeta(m.id.toString())?.item ?? '—'}</td>
                  <td>
                    <span className={`label px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="text-right tabular-nums">{mon(m.spent)}</td>
                  <td className="text-right tabular-nums">{mon(m.budget)}</td>
                  <td className="text-right">
                    <Link href={`/mandate/${m.id}`} className="label underline">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
