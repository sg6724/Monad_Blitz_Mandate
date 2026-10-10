/** Transak staging (test mode) helpers. Server-only. */
const API = process.env.TRANSAK_API_BASE ?? 'https://api-stg.transak.com';
const GATEWAY = process.env.TRANSAK_GATEWAY_BASE ?? 'https://api-gateway-stg.transak.com';
const STAGING = /-stg\./.test(API) && /-stg\./.test(GATEWAY);

/**
 * Partner access token, valid 7 days. Cached per server instance and shared by concurrent
 * requests (one refresh in flight at a time). Transak's docs say not to refresh on every request.
 */
let cached: { token: string; exp: number } | null = null;
let refreshing: Promise<string> | null = null;

/** One retry: the staging gateway occasionally drops a connection. */
async function fetchRetry(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return fetch(url, init);
  }
}

function keys() {
  const apiKey = process.env.TRANSAK_API_KEY;
  const secret = process.env.TRANSAK_API_SECRET;
  if (!apiKey || !secret) throw new Error('Transak keys are not configured');
  return { apiKey, secret };
}

export async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.exp * 1000 > Date.now() + 60_000) return cached.token;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const { apiKey, secret } = keys();
    const r = await fetchRetry(`${API}/partners/api/v2/refresh-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-secret': secret, 'x-api-key': apiKey },
      body: JSON.stringify({ apiKey }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.data?.accessToken) throw new Error(`Transak token failed: ${JSON.stringify(j).slice(0, 200)}`);
    cached = { token: j.data.accessToken, exp: j.data.expiresAt };
    return cached.token;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

const rejected = (status: number, j: any) => status === 401 || j?.error?.statusCode === 401 || j?.error?.errorCode === 1002;

/**
 * Calls Transak with the cached token. Each serverless instance keeps its own token, and a refresh
 * elsewhere can invalidate it, so a 401 triggers exactly one refresh and retry.
 */
async function withToken(call: (token: string) => Promise<Response>): Promise<any> {
  let token = await accessToken();
  let r = await call(token);
  let j = await r.json().catch(() => null);
  if (rejected(r.status, j)) {
    cached = null;
    token = await accessToken(true);
    r = await call(token);
    j = await r.json().catch(() => null);
  }
  return j;
}

export function userIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd && !fwd.startsWith('::') && !fwd.startsWith('127.')) return fwd;
  return '81.2.69.142'; // local dev: a placeholder public IP so the session call has one
}

/**
 * Staging only: a fictional UK identity so the tester lands on Transak's Light KYC path
 * (name, phone, DOB, address; no ID document or selfie). Staging KYC checks are dummy and
 * always approved, and the UK allows Light KYC (MON is not offered in the US or Canada).
 * The phone number is from Ofcom's range reserved for fiction.
 */
const TEST_USER = {
  firstName: 'Test',
  lastName: 'User',
  mobileNumber: '+447700900123',
  dob: '1990-01-01',
  address: { addressLine1: '221B Baker Street', addressLine2: '', city: 'London', state: 'London', postCode: 'NW1 6XE', countryCode: 'GB' },
};

export async function widgetUrl(opts: { address: string; fiatAmount: number; partnerOrderId: string; referrerDomain: string; ip: string }) {
  const { apiKey } = keys();
  const widgetParams: Record<string, unknown> = {
    apiKey,
    referrerDomain: opts.referrerDomain,
    network: 'monad',
    cryptoCurrencyCode: 'MON',
    walletAddress: opts.address,
    disableWalletAddressForm: true,
    fiatCurrency: 'GBP',
    fiatAmount: opts.fiatAmount,
    paymentMethod: 'credit_debit_card',
    hideExchangeScreen: true,
    partnerOrderId: opts.partnerOrderId,
    productsAvailed: 'BUY',
    themeColor: '000000',
  };
  if (STAGING) widgetParams.userData = TEST_USER;
  const j = await withToken((token) =>
    fetchRetry(`${GATEWAY}/api/v2/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'access-token': token, 'x-api-key': apiKey, 'x-user-ip': opts.ip },
      body: JSON.stringify({ widgetParams }),
    }),
  );
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
  const j = await withToken((token) =>
    fetchRetry(`${API}/partners/api/v2/order/${encodeURIComponent(orderId)}`, { headers: { 'x-api-key': apiKey, 'access-token': token } }),
  );
  if (!j?.data) throw new Error(`Order lookup failed: ${JSON.stringify(j).slice(0, 200)}`);
  return { ...j.data, id: j.data.id ?? j.data._id ?? orderId };
}
