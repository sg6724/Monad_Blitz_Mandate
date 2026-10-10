'use client';

import { useQuery } from '@tanstack/react-query';
import { getHistory, getMandate, mandatesOf, publicClientFor } from '@taskpay/sdk';
import type { Address } from 'viem';

const pc = publicClientFor(10143);

export function useMandate(id: bigint | undefined) {
  return useQuery({
    queryKey: ['mandate', id?.toString()],
    enabled: id !== undefined,
    refetchInterval: 3000,
    queryFn: async () => {
      const [m, h] = await Promise.all([getMandate(pc, id!), getHistory(pc, id!)]);
      return { m, h };
    },
  });
}

export function useMyMandates(owner: Address | undefined) {
  return useQuery({
    queryKey: ['mandates', owner],
    enabled: !!owner,
    refetchInterval: 6000,
    queryFn: async () => {
      const ids = await mandatesOf(pc, owner!);
      const list = await Promise.all(ids.slice(-20).reverse().map((id) => getMandate(pc, id)));
      return list.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getMandate>>>[];
    },
  });
}

export { pc };
