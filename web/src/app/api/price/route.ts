import { NextResponse } from 'next/server';

export const revalidate = 300;

/**
 * MON → INR. Uses the live MON market price (CoinGecko), cached 5 min. Testnet MON itself has no value,
 * so INR_PER_MON can pin a demo rate instead.
 */
export async function GET() {
  const fixed = Number(process.env.INR_PER_MON);
  if (fixed > 0) return NextResponse.json({ inr: fixed, source: 'demo rate' });
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=inr', { next: { revalidate: 300 } });
    const inr = (await r.json())?.monad?.inr;
    if (inr > 0) return NextResponse.json({ inr, source: 'CoinGecko MON price' });
  } catch {
    /* fall through */
  }
  return NextResponse.json({ inr: 2.4, source: 'fallback' });
}
