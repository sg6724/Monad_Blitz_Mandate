'use client';

import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'loading' | 'open' | 'verifying' | 'done' | 'error';

/**
 * Card → MON through Transak (test mode). The widget runs in an iframe; when Transak reports a
 * successful order, our server re-checks it with Transak's API before crediting test MON.
 */
export function BuyWithCard({ address, onDone }: { address: string; onDone: () => void }) {
  const [state, setState] = useState<State>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState(10);
  const [manual, setManual] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const orderRef = useRef<string | null>(null);

  async function start() {
    setState('loading');
    setMsg(null);
    try {
      const r = await fetch('/api/onramp/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, fiatAmount: amount }) }).then((x) => x.json());
      if (!r.widgetUrl) throw new Error(r.error ?? 'Could not open Transak');
      setUrl(r.widgetUrl);
      setState('open');
    } catch (e: any) {
      setState('error');
      setMsg(e.message);
    }
  }

  async function verify(orderId: string) {
    setState('verifying');
    setMsg('Transak says the payment went through. Checking the order with Transak…');
    for (let i = 0; i < 10; i++) {
      const r = await fetch('/api/onramp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, address }) }).then((x) => x.json());
      if (r.ok) {
        setState('done');
        setUrl(null);
        setMsg(r.already ? 'This order was already credited.' : `Order verified with Transak (${r.status}). ${r.amount} test MON sent to your wallet.`);
        onDone();
        return;
      }
      if (!r.pending) {
        setState('error');
        setMsg(r.error ?? 'Verification failed');
        return;
      }
      setMsg(`Order status: ${r.status}. Waiting for Transak…`);
      await new Promise((res) => setTimeout(res, 3000));
    }
    setState('error');
    setMsg('Transak has not completed the order yet. Try "Check order" again in a minute.');
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const id = e.data?.event_id as string | undefined;
      const d = e.data?.data ?? {};
      const orderId = d?.status?.id ?? d?.id ?? d?.orderId ?? d?.status?.orderId;
      if (orderId) orderRef.current = orderId;
      if (id === 'TRANSAK_ORDER_SUCCESSFUL' && orderRef.current) verify(orderRef.current);
      if (id === 'TRANSAK_WIDGET_CLOSE') setUrl(null);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className="field w-24" value={amount} onChange={(e) => setAmount(Number(e.target.value))}>
          {[10, 20, 30].map((n) => (
            <option key={n} value={n}>
              £{n}
            </option>
          ))}
        </select>
        <button className="btn flex-1" onClick={start} disabled={state === 'loading' || state === 'verifying'}>
          {state === 'loading' ? 'Opening Transak…' : 'Buy MON with card'}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Transak test mode. Card 4242 4242 4242 4242 · 10/33 · CVV 100 · 3DS password Checkout1! · use a UK address.
      </p>
      {msg && <p className={`text-[12px] ${state === 'error' ? 'text-[var(--color-bad)]' : 'text-neutral-700'}`}>{msg}</p>}
      {(state === 'error' || state === 'open') && (
        <div className="flex gap-2">
          <input className="field h-9 text-[12px]" placeholder="Transak order ID" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn btn-line h-9 px-3" onClick={() => manual && verify(manual.trim())}>
            Check order
          </button>
        </div>
      )}
      {url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="relative h-[88dvh] w-full max-w-[460px] overflow-hidden bg-white">
            <button className="label absolute right-3 top-3 z-10 bg-white px-2 py-1" onClick={() => setUrl(null)}>
              Close
            </button>
            <iframe ref={frame} src={url} allow="camera;microphone;payment" className="h-full w-full border-0" title="Transak" />
          </div>
        </div>
      )}
    </div>
  );
}
