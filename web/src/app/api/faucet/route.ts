import { NextResponse } from 'next/server';
import { isAddress, parseEther, formatEther } from 'viem';
import { opsWallet, pc } from '@/lib/server';

const AMOUNT = process.env.FAUCET_AMOUNT ?? '1';

/** Backup funding: OPS sends 1 test MON to wallets that hold less than 1 MON. */
export async function POST(req: Request) {
  const { address } = await req.json();
  if (!isAddress(address)) return NextResponse.json({ ok: false, error: 'Bad address' }, { status: 400 });
  const bal = await pc.getBalance({ address });
  if (bal >= parseEther('1')) return NextResponse.json({ ok: false, error: `You already have ${Number(formatEther(bal)).toFixed(2)} MON. The faucet is for empty wallets.` });
  const wc = opsWallet();
  const hash = await wc.sendTransaction({ to: address, value: parseEther(AMOUNT), chain: wc.chain, account: wc.account! });
  await pc.waitForTransactionReceipt({ hash });
  return NextResponse.json({ ok: true, amount: AMOUNT, hash });
}
