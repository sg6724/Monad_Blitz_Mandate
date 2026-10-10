'use client';

import { useCallback, useState } from 'react';
import { useConfig } from 'wagmi';
import { writeContract, waitForTransactionReceipt, switchChain, getChainId } from 'wagmi/actions';
import { keccak256, toHex, type Address, type Hex } from 'viem';
import { addressesFor, vaultAbi, mandateArgs, type Draft, type LocalStep } from '@taskpay/sdk';
import { CHAIN } from './wagmi';

export const VAULT = addressesFor(10143).vault as Address;
export const STORE_PAYTO = (process.env.NEXT_PUBLIC_STORE_PAYTO ?? '0x27dd67D92c1754D3F30b9D7965D8Cf6cf2B3D0be').toLowerCase();
export const PRICECHECK_PAYTO = (process.env.NEXT_PUBLIC_PRICECHECK_PAYTO ?? '0x1344fb00634e7141e8Ed551aB00893b710245bce').toLowerCase();
export const NAMES: Record<string, string> = { [STORE_PAYTO]: 'BlockMart', [PRICECHECK_PAYTO]: 'PriceCheck API' };

// ------------------------------------------------------------ local step log

const key = (id: string) => `taskpay:log:10143:${id}`;

export function readSteps(id: string): LocalStep[] {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? '[]');
  } catch {
    return [];
  }
}

export function appendSteps(id: string, steps: LocalStep[]) {
  try {
    localStorage.setItem(key(id), JSON.stringify([...readSteps(id), ...steps]));
  } catch {
    /* storage unavailable */
  }
}

export function moveSteps(from: string, to: string) {
  const s = readSteps(from);
  if (!s.length) return;
  appendSteps(to, s);
  try {
    localStorage.removeItem(key(from));
  } catch {
    /* ignore */
  }
}

export function stepsHash(id: string): Hex {
  return keccak256(toHex(JSON.stringify(readSteps(id))));
}

/** Context the agent needs between calls (approved item and purpose), kept per mandate. */
export function saveTaskMeta(id: string, meta: { item: string; purpose: string; draftId?: string }) {
  try {
    localStorage.setItem(`taskpay:meta:${id}`, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}
export function readTaskMeta(id: string): { item: string; purpose: string; draftId?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(`taskpay:meta:${id}`) ?? 'null');
  } catch {
    return null;
  }
}

// --------------------------------------------------------- owner actions

export function useOwnerActions() {
  const config = useConfig();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (label: string, functionName: string, args: readonly unknown[], value?: bigint) => {
      setPending(label);
      setError(null);
      try {
        if (getChainId(config) !== CHAIN.id) await switchChain(config, { chainId: CHAIN.id });
        const t0 = Date.now();
        const hash = await writeContract(config, { address: VAULT, abi: vaultAbi, functionName: functionName as any, args: args as any, value, chainId: CHAIN.id } as any);
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN.id });
        if (receipt.status !== 'success') throw new Error('Transaction reverted');
        return { hash, receipt, ms: Date.now() - t0 };
      } catch (e: any) {
        const msg = e?.shortMessage ?? e?.message ?? String(e);
        setError(/User rejected|denied/i.test(msg) ? 'You cancelled in MetaMask.' : msg);
        throw e;
      } finally {
        setPending(null);
      }
    },
    [config],
  );

  return {
    pending,
    error,
    lock: (d: Draft) => {
      const { args, value } = mandateArgs(d);
      return send('lock', 'createMandate', args, value);
    },
    approveTopUp: (id: bigint, amount: bigint) => send('topup', 'increaseBudget', [id], amount),
    declineTopUp: (id: bigint) => send('decline', 'declineTopUp', [id]),
    confirm: (id: bigint) => send('confirm', 'confirmPayment', [id]),
    reject: (id: bigint) => send('reject', 'rejectPayment', [id]),
    cancel: (id: bigint, logHash: Hex) => send('cancel', 'close', [id, logHash]),
    reclaim: (id: bigint) => send('reclaim', 'reclaimExpired', [id]),
    freeze: (agent: Address) => send('freeze', 'freezeAndRefund', [agent]),
    unfreeze: (id: bigint) => send('unfreeze', 'unfreezeMandate', [id]),
  };
}
