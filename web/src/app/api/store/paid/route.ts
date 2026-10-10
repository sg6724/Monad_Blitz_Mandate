import { NextResponse } from 'next/server';
import { pc } from '@/lib/server';

/** The store checks the payment receipt on-chain before marking an order paid. */
export async function POST(req: Request) {
  const { orderId, txHash } = await req.json();
  try {
    const r = await pc.getTransactionReceipt({ hash: txHash });
    return NextResponse.json({ orderId, paid: r.status === 'success', block: r.blockNumber.toString() });
  } catch {
    return NextResponse.json({ orderId, paid: false }, { status: 400 });
  }
}
