'use client';

import { useQuery } from '@tanstack/react-query';

export function useInrRate() {
  const q = useQuery({
    queryKey: ['inr-rate'],
    staleTime: 300_000,
    queryFn: async () => (await fetch('/api/price').then((r) => r.json())) as { inr: number; source: string },
  });
  return q.data;
}

/** ₹ amount for a MON amount, rounded the way people read money. */
export function formatInr(monAmount: number, rate: number) {
  const v = monAmount * rate;
  if (v === 0) return '₹0';
  if (v < 0.01) return '<₹0.01';
  if (v < 1) return `₹${v.toFixed(2)}`;
  if (v < 100) return `₹${v.toFixed(1).replace(/\.0$/, '')}`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}
