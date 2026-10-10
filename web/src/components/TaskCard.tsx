'use client';

import Image from 'next/image';
import { CATALOG, short, type Draft } from '@taskpay/sdk';
import { ShieldIcon } from './Icons';

export function TaskCard({ draft, action }: { draft: Draft; action?: React.ReactNode }) {
  const product = CATALOG.find((p) => p.name === draft.item);
  const payees = [draft.store!, ...(draft.extraPayees ?? [])];
  return (
    <div className="rise border border-black bg-white">
      <div className="flex items-center justify-between bg-black px-5 py-3 text-white">
        <span className="label">Task card</span>
        <span className="label inline-flex items-center gap-2 text-[var(--color-volt)]">
          <ShieldIcon className="h-4 w-4" /> Enforced on Monad
        </span>
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-5 p-5">
        <div className="relative aspect-[222/266] bg-[var(--color-mist)]">
          {product && <Image src={product.image} alt={product.name} fill sizes="96px" className="object-contain mix-blend-multiply" />}
        </div>
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="label text-neutral-500">Task</div>
            <div className="mt-0.5">&ldquo;{draft.task}&rdquo;</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label text-neutral-500">Item</div>
              <div className="mt-0.5 font-semibold">{draft.item}</div>
            </div>
            <div>
              <div className="label text-neutral-500">Budget</div>
              <div className="display mt-0.5 text-[22px]">{draft.budget} MON</div>
            </div>
            <div>
              <div className="label text-neutral-500">Max per payment</div>
              <div className="mt-0.5">{draft.perPaymentCap ?? draft.budget} MON</div>
            </div>
            <div>
              <div className="label text-neutral-500">Expires</div>
              <div className="mt-0.5">in {draft.expiryMins ?? 1440} min</div>
            </div>
          </div>
          <div>
            <div className="label text-neutral-500">Only these can be paid</div>
            <ul className="mt-1 space-y-0.5">
              {payees.map((p) => (
                <li key={p.payTo} className="flex justify-between gap-3">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-mono text-[11px] text-neutral-500">{short(p.payTo)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-[11px] text-neutral-500">
            Agent {short(draft.agent)}
            {draft.agentId ? ` · ERC-8004 #${draft.agentId}` : ''} · leftover MON returns to you
          </div>
        </div>
      </div>
      {action && <div className="border-t border-black p-4">{action}</div>}
    </div>
  );
}
