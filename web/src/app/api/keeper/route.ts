import { NextResponse } from 'next/server';
import { openExpired, vaultWrite } from '@taskpay/sdk';
import { CHAIN_ID, opsWallet, pc } from '@/lib/server';

export const maxDuration = 60;

/** Refunds expired tasks. Anyone may call reclaimExpired; money only ever goes to the owner. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.KEEPER_SECRET || key !== process.env.KEEPER_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ids = await openExpired(pc, 10, CHAIN_ID);
  const wc = opsWallet();
  const done: { id: string; tx?: string; error?: string }[] = [];
  for (const id of ids) {
    try {
      const tx = await vaultWrite(wc, pc, 'reclaimExpired', [id], { chainId: CHAIN_ID });
      done.push({ id: id.toString(), tx: tx.hash });
    } catch (e: any) {
      done.push({ id: id.toString(), error: e?.shortMessage ?? String(e) });
    }
  }
  return NextResponse.json({ checked: ids.length, reclaimed: done });
}
