import { NextResponse } from 'next/server';
import { CATALOG } from '@taskpay/sdk';
import { STORE_PAYTO, siteUrl } from '@/lib/server';

/** NEXUS merchant identity, served at /.well-known/taskpay.json (see next.config rewrites). */
export async function GET(req: Request) {
  const base = siteUrl(req);
  const prices = CATALOG.map((p) => p.price);
  return NextResponse.json({
    name: 'NEXUS',
    domain: new URL(base).host,
    category: 'apparel',
    payTo: STORE_PAYTO,
    network: 'eip155:10143',
    catalogUrl: `${base}/api/store/products`,
    quoteUrl: `${base}/api/store/quote`,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
  });
}
