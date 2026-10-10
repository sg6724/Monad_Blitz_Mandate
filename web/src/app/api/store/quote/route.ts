import { NextResponse } from 'next/server';
import { SURGE_MULTIPLIER, productById } from '@taskpay/sdk';
import { STORE_PAYTO } from '@/lib/server';

/** x402-style checkout quote: who to pay, how much, for which order. */
export async function POST(req: Request) {
  const { productId, qty = 1, surge = false } = await req.json();
  const p = productById(productId);
  if (!p) return NextResponse.json({ error: 'unknown product' }, { status: 404 });
  const unit = surge ? Math.round(p.price * SURGE_MULTIPLIER * 1000) / 1000 : p.price;
  return NextResponse.json({
    orderId: `BM-${Date.now().toString(36).toUpperCase()}`,
    productId,
    name: p.name,
    qty,
    amount: (unit * qty).toFixed(4),
    payTo: STORE_PAYTO,
    network: 'eip155:10143',
  });
}
