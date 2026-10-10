'use client';

import { formatInr, useInrRate } from '@/lib/inr';

/** Shows "≈ ₹12" next to a MON amount. Accepts a number of MON or a "0.4 MON" string. */
export function Inr({ mon, className = 'text-neutral-500', prefix = '≈ ' }: { mon: number | string; className?: string; prefix?: string }) {
  const rate = useInrRate();
  const n = typeof mon === 'number' ? mon : Number(String(mon).replace(/[^0-9.]/g, ''));
  if (!rate || !Number.isFinite(n)) return null;
  return (
    <span className={className} title={`At ${rate.inr} ₹/MON (${rate.source})`}>
      {(() => {
        const t = formatInr(n, rate.inr);
        return t.startsWith('<') ? t : `${prefix}${t}`;
      })()}
    </span>
  );
}
