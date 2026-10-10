import { NextResponse } from 'next/server';
import { isAddress, parseEther } from 'viem';
import { getOrder } from '@/lib/transak';
import { opsWallet, pc } from '@/lib/server';

const credited = new Map<string, string>(); // orderId -> tx (per server instance)
const MAX_CREDIT = Number(process.env.ONRAMP_MAX_MON ?? 1);
const PAID = ['COMPLETED', 'PENDING_DELIVERY_FROM_TRANSAK', 'ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK'];

/**
 * Transak test mode completes the card payment but never delivers native tokens.
 * After checking the order with Transak's API (not trusting the browser), our OPS
 * wallet sends the equivalent test MON, capped and once per order.
 */
export async function POST(req: Request) {
  try {
    const { orderId, address } = await req.json();
    if (!orderId || !isAddress(address)) return NextResponse.json({ ok: false, error: 'Missing order or address' }, { status: 400 });
    if (credited.has(orderId)) return NextResponse.json({ ok: true, already: true, hash: credited.get(orderId) });

    const o = await getOrder(orderId);
    if (o.walletAddress?.toLowerCase() !== address.toLowerCase()) return NextResponse.json({ ok: false, error: 'Order is for a different wallet' }, { status: 400 });
    if (!/^MON$/i.test(o.cryptoCurrency ?? '') || !/monad/i.test(o.network ?? '')) return NextResponse.json({ ok: false, error: 'Order is not MON on Monad' }, { status: 400 });
    if (!PAID.includes(o.status)) return NextResponse.json({ ok: false, pending: true, status: o.status });

    const amount = Math.min(Number(o.cryptoAmount ?? MAX_CREDIT) || MAX_CREDIT, MAX_CREDIT);
    const wc = opsWallet();
    const hash = await wc.sendTransaction({ to: address, value: parseEther(amount.toFixed(6)), chain: wc.chain, account: wc.account! });
    credited.set(orderId, hash);
    await pc.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, amount, hash, status: o.status, fiat: `${o.fiatAmount ?? ''} ${o.fiatCurrency ?? ''}`.trim() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
