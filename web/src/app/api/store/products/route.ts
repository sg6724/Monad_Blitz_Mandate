import { NextResponse } from 'next/server';
import { findProducts } from '@taskpay/sdk';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return NextResponse.json({ products: findProducts(q) });
}
