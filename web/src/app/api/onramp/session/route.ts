import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { userIp, widgetUrl } from '@/lib/transak';

/** Creates a one-time Transak widget link for buying MON on Monad, to the user's own wallet. */
export async function POST(req: Request) {
  try {
    const { address, fiatAmount = 10 } = await req.json();
    if (!isAddress(address)) return NextResponse.json({ error: 'Bad address' }, { status: 400 });
    const host = new URL(req.url).host;
    const partnerOrderId = `tp-${address.slice(2, 8)}-${Date.now().toString(36)}`;
    const url = await widgetUrl({ address, fiatAmount: Math.min(Math.max(Number(fiatAmount) || 10, 5), 50), partnerOrderId, referrerDomain: host.split(':')[0], ip: userIp(req) });
    return NextResponse.json({ widgetUrl: url, partnerOrderId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
