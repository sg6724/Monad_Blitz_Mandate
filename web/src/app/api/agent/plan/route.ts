import { NextResponse } from 'next/server';
import { plan } from '@/lib/agent';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    return NextResponse.json(await plan(await req.json()));
  } catch (e: any) {
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? String(e) }, { status: 500 });
  }
}
