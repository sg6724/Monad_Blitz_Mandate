/** Transak staging (test mode) helpers. Server-only. */
const API = process.env.TRANSAK_API_BASE ?? 'https://api-stg.transak.com';
const GATEWAY = process.env.TRANSAK_GATEWAY_BASE ?? 'https://api-gateway-stg.transak.com';

let cached: { token: string; exp: number } | null = null;

/** One retry: the staging gateway occasionally drops a connection. */
async function fetchRetry(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, 600));
    return fetch(url, init);
  }
}

function keys() {
  const apiKey = process.env.TRANSAK_API_KEY;
  const secret = process.env.TRANSAK_API_SECRET;
  if (!apiKey || !secret) throw new Error('Transak keys are not configured');
  return { apiKey, secret };
}

export async function accessToken(): Promise<string> {
  if (cached && cached.exp * 1000 > Date.now() + 60_000) return cached.token;
  const { apiKey, secret } = keys();
  const r = await fetchRetry(`${API}/partners/api/v2/refresh-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-secret': secret },
    body: JSON.stringify({ apiKey }),
  });
  const j = await r.json();
  if (!j?.data?.accessToken) throw new Error(`Transak token failed: ${JSON.stringify(j).slice(0, 200)}`);
  cached = { token: j.data.accessToken, exp: j.data.expiresAt };
  return cached.token;
}

export function userIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd && !fwd.startsWith('::') && !fwd.startsWith('127.')) return fwd;
  return '81.2.69.142'; // local dev: a placeholder public IP so the session call has one
}

export async function widgetUrl(opts: { address: string; fiatAmount: number; partnerOrderId: string; referrerDomain: string; ip: string }) {
  const { apiKey } = keys();
  const token = await accessToken();
  const r = await fetchRetry(`${GATEWAY}/api/v2/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'access-token': token, 'x-api-key': apiKey, 'x-user-ip': opts.ip },
    body: JSON.stringify({
      widgetParams: {
        apiKey,
        referrerDomain: opts.referrerDomain,
        network: 'monad',
        cryptoCurrencyCode: 'MON',
        walletAddress: opts.address,
        disableWalletAddressForm: true,
        fiatCurrency: 'GBP',
        fiatAmount: opts.fiatAmount,
        partnerOrderId: opts.partnerOrderId,
        productsAvailed: 'BUY',
        themeColor: '000000',
      },
    }),
  });
  const j = await r.json();
  if (!j?.data?.widgetUrl) throw new Error(`Transak session failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data.widgetUrl as string;
}

export type TransakOrder = {
  id: string;
  status: string;
  walletAddress: string;
  cryptoCurrency: string;
  network: string;
  cryptoAmount?: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  partnerOrderId?: string;
};

export async function getOrder(orderId: string): Promise<TransakOrder> {
  const { apiKey } = keys();
  const token = await accessToken();
  const r = await fetchRetry(`${API}/partners/api/v2/order/${encodeURIComponent(orderId)}`, { headers: { 'x-api-key': apiKey, 'access-token': token } });
  const j = await r.json();
  if (!j?.data) throw new Error(`Order lookup failed: ${JSON.stringify(j).slice(0, 200)}`);
  return { ...j.data, id: j.data.id ?? j.data._id ?? orderId };
}
