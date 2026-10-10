import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { publicClientFor, walletClientFor, DEFAULT_CHAIN_ID } from '@taskpay/sdk';

/** Server-only configuration. Never import this from a client component. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const CHAIN_ID = DEFAULT_CHAIN_ID;
export const pc = publicClientFor(CHAIN_ID);

export function agentWallet() {
  return walletClientFor(privateKeyToAccount(need('AGENT_PRIVATE_KEY') as Hex), CHAIN_ID);
}
export function opsWallet() {
  return walletClientFor(privateKeyToAccount(need('OPS_PRIVATE_KEY') as Hex), CHAIN_ID);
}

export const AGENT_ID = process.env.AGENT_ID; // ERC-8004 id of the web agent key
export const STORE_PAYTO = (process.env.NEXT_PUBLIC_STORE_PAYTO ?? '0x27dd67D92c1754D3F30b9D7965D8Cf6cf2B3D0be') as Address;
export const PRICECHECK_PAYTO = (process.env.NEXT_PUBLIC_PRICECHECK_PAYTO ?? '0x1344fb00634e7141e8Ed551aB00893b710245bce') as Address;
export const PRICECHECK_FEE = '0.001';

export function siteUrl(req: Request) {
  const u = new URL(req.url);
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${u.protocol}//${u.host}`;
}
