import { NextResponse } from 'next/server';
import { run } from '@/lib/agent';
import { siteUrl } from '@/lib/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    return NextResponse.json(await run({ ...(await req.json()), baseUrl: siteUrl(req) }));
  } catch (e: any) {
    return NextResponse.json({ events: [{ at: Math.floor(Date.now() / 1000), kind: 'note', text: `Error: ${e?.shortMessage ?? e?.message ?? e}` }], outcome: 'error' }, { status: 500 });
  }
}
