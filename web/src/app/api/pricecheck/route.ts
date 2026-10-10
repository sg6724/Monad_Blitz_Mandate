import { NextResponse } from 'next/server';
import { CATALOG } from '@taskpay/sdk';

/** Pay-per-call API (0.001 MON per call). Responds 402 with x402-style terms when no payment ref is given. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.get('paid_tx')) {
    return NextResponse.json(
      { error: 'payment required', accepts: [{ scheme: 'taskpay-mandate', network: 'eip155:10143', amount: '0.001', asset: 'MON', payTo: process.env.NEXT_PUBLIC_PRICECHECK_PAYTO }] },
      { status: 402 },
    );
  }
  const item = url.searchParams.get('item') ?? '';
  const p = CATALOG.find((x) => x.name.toLowerCase() === item.toLowerCase());
  return NextResponse.json({ item, best: p ? { store: 'BlockMart', price: p.price } : null, checkedAt: new Date().toISOString() });
}
