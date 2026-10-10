import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { userIp, widgetUrl } from '@/lib/transak';

/**
 * Creates a one-time Transak widget link for buying MON on Monad, to the user's own wallet.
 * The link is single-use and valid for 5 minutes; the client prefetches one when the wallet
 * menu opens so the checkout appears instantly.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { address, fiatAmount = 25 } = await req.json();
    if (!isAddress(address)) return NextResponse.json({ error: 'Bad address' }, { status: 400 });
    const host = new URL(req.url).host;
    const partnerOrderId = `tp-${address.slice(2, 8)}-${Date.now().toString(36)}`;
    const amount = Math.min(Math.max(Number(fiatAmount) || 25, 23), 100);
    const url = await widgetUrl({ address, fiatAmount: amount, partnerOrderId, referrerDomain: host.split(':')[0], ip: userIp(req) });
    return NextResponse.json(
      { widgetUrl: url, partnerOrderId, fiatAmount: amount, createdAt: Date.now() },
      { headers: { 'cache-control': 'no-store', 'server-timing': `transak;dur=${Date.now() - t0}` } },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
