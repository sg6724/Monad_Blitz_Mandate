import { NextResponse } from 'next/server';
import { addressesFor, getHistory, ref32 } from '@taskpay/sdk';
import { parseEther, type Hex } from 'viem';
import { CHAIN_ID, PRICECHECK_FEE, PRICECHECK_PAYTO, pc } from '@/lib/server';
import { PRICECHECK_SOURCES, priceData, type PriceSource } from '@/lib/pricecheck';

const used = new Set<string>(); // each payment buys exactly one answer (per server instance)

/**
 * PriceCheck: pay-per-request price comparison. Without a payment it answers 402 Payment Required with its terms
 * (x402 style). With one, it checks on Monad that this task's vault really paid PriceCheck 0.001 MON under that
 * reference, then answers.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const item = u.searchParams.get('item') ?? '';
  const source = (u.searchParams.get('source') ?? 'blockmart') as PriceSource;
  const paidTx = u.searchParams.get('paid_tx') as Hex | null;
  const mandate = u.searchParams.get('mandate');
  const ref = u.searchParams.get('ref');
  if (!PRICECHECK_SOURCES.includes(source)) return NextResponse.json({ error: 'unknown source' }, { status: 400 });
  if (!paidTx || !mandate || !ref) {
    return NextResponse.json(
      {
        error: 'payment required',
        price: `${PRICECHECK_FEE} MON per request`,
        accepts: [{ scheme: 'taskpay-mandate', network: `eip155:${CHAIN_ID}`, amount: PRICECHECK_FEE, asset: 'MON', payTo: PRICECHECK_PAYTO }],
        how: 'Pay from a TaskPay task (vault.pay to payTo with a ref), then call again with paid_tx, mandate and ref.',
      },
      { status: 402 },
    );
  }
  const key = `${mandate}:${ref}`;
  if (used.has(key)) return NextResponse.json({ error: 'payment already used' }, { status: 409 });
  try {
    const [rcpt, hist] = await Promise.all([pc.getTransactionReceipt({ hash: paidTx }), getHistory(pc, BigInt(mandate), CHAIN_ID)]);
    const okTx = rcpt.status === 'success' && rcpt.to?.toLowerCase() === addressesFor(CHAIN_ID).vault!.toLowerCase();
    const paid = hist.some((e) => e.kind === 'Paid' && e.counterparty.toLowerCase() === PRICECHECK_PAYTO.toLowerCase() && e.ref === ref32(ref) && e.amount >= parseEther(PRICECHECK_FEE));
    if (!okTx || !paid) return NextResponse.json({ error: 'payment not found on Monad' }, { status: 402 });
  } catch {
    return NextResponse.json({ error: 'could not verify payment' }, { status: 402 });
  }
  used.add(key);
  return NextResponse.json({ ...priceData(item, source, u.searchParams.get('surge') === '1'), paidWith: paidTx, checkedAt: new Date().toISOString() });
}
