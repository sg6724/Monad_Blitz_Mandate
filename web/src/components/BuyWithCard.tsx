'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, preconnect } from 'react-dom';

type Phase = 'idle' | 'verifying' | 'done' | 'error';
type Session = { url: string; address: string; amount: number; at: number };

const WIDGET_ORIGIN = 'https://global-stg.transak.com';
/** A widget link is single-use and valid 5 minutes; use it well inside that. */
const LINK_TTL = 4 * 60_000;
/** A checkout that already loaded in the background is reused for a while before we swap it. */
const BOOTED_TTL = 15 * 60_000;
const AMOUNTS = [25, 30, 50];

// Module-level so a prefetched link survives the wallet menu closing and reopening.
let spare: Session | null = null;
let pending: { key: string; p: Promise<Session> } | null = null;
const keyOf = (address: string, amount: number) => `${address.toLowerCase()}:${amount}`;

/** Returns an unused, fresh widget link for this wallet and amount, fetching one only if needed. */
function getLink(address: string, amount: number): Promise<Session> {
  const key = keyOf(address, amount);
  if (spare && keyOf(spare.address, spare.amount) === key && Date.now() - spare.at < LINK_TTL) {
    const s = spare;
    spare = null; // single-use: whoever takes it owns it
    return Promise.resolve(s);
  }
  if (pending?.key === key) return pending.p;
  const p = fetch('/api/onramp/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, fiatAmount: amount }) })
    .then((x) => x.json())
    .then((r) => {
      if (!r.widgetUrl) throw new Error(r.error ?? 'Could not open Transak');
      return { url: r.widgetUrl as string, address, amount, at: Date.now() };
    })
    .finally(() => {
      if (pending?.p === p) pending = null;
    });
  pending = { key, p };
  return p;
}

/**
 * Card → MON through Transak (test mode). As soon as this mounts (inside the open wallet menu) it
 * fetches a widget link and boots the checkout in a hidden iframe, so pressing Buy just reveals it.
 * When Transak reports a successful order, our server re-checks it with Transak's API before
 * crediting test MON.
 */
export function BuyWithCard({ address, onDone }: { address: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState(25);
  const [manual, setManual] = useState('');
  const [session, setSession] = useState<Session | null>(null); // the link bound to the iframe
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const orderRef = useRef<string | null>(null);
  const want = useRef(keyOf(address, amount));
  want.current = keyOf(address, amount);
  const alive = useRef(true);

  /** Binds a fresh link for the current wallet + amount to the iframe (which starts loading it). */
  async function load(show: boolean) {
    const key = keyOf(address, amount);
    try {
      const s = await getLink(address, amount);
      if (!alive.current || want.current !== key) {
        spare = s; // menu closed or amount changed meanwhile: keep the unused link for next time
        return;
      }
      setLoaded(false);
      setSession(s);
    } catch (e: any) {
      if (!show) return; // a failed background prefetch stays silent; Buy will retry
      setVisible(false);
      setPhase('error');
      setMsg(e.message);
    }
  }

  useEffect(() => {
    alive.current = true;
    setMounted(true);
    preconnect(WIDGET_ORIGIN);
    return () => {
      alive.current = false;
    };
  }, []);

  // Prefetch + background boot whenever the wallet or amount changes (not while the checkout is open).
  useEffect(() => {
    if (visible) return;
    if (session && keyOf(session.address, session.amount) === keyOf(address, amount)) return;
    setSession(null);
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, amount]);

  function open() {
    setPhase('idle');
    setMsg(null);
    setVisible(true);
    const ok = session && keyOf(session.address, session.amount) === keyOf(address, amount) && Date.now() - session.at < (loaded ? BOOTED_TTL : LINK_TTL);
    if (!ok) {
      setSession(null);
      load(true);
    }
  }

  /** Starts a brand-new Transak checkout (new session) and shows it, e.g. when the old one is stuck on a KYC step. */
  function startOver() {
    setSession(null);
    setLoaded(false);
    orderRef.current = null;
    setMsg(null);
    setVisible(true);
    load(true);
  }

  /** Throws away the current checkout (it can't be reopened) and prepares the next one. */
  function discard() {
    setVisible(false);
    setSession(null);
    setLoaded(false);
    orderRef.current = null;
    load(false);
  }

  async function verify(orderId: string) {
    setPhase('verifying');
    setMsg('Transak says the payment went through. Checking the order with Transak…');
    for (let i = 0; i < 10; i++) {
      const r = await fetch('/api/onramp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, address }) }).then((x) => x.json());
      if (r.ok) {
        setPhase('done');
        discard();
        setMsg(r.already ? 'This order was already credited.' : `Order verified with Transak (${r.status}). ${r.amount} test MON sent to your wallet.`);
        onDone();
        return;
      }
      if (!r.pending) {
        setPhase('error');
        setMsg(r.error ?? 'Verification failed');
        return;
      }
      setMsg(`Order status: ${r.status}. Waiting for Transak…`);
      await new Promise((res) => setTimeout(res, 3000));
    }
    setPhase('error');
    setMsg('Transak has not completed the order yet. Try "Check order" again in a minute.');
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const id = e.data?.event_id as string | undefined;
      const d = e.data?.data ?? {};
      const orderId = d?.status?.id ?? d?.id ?? d?.orderId ?? d?.status?.orderId;
      if (orderId) orderRef.current = orderId;
      if (id === 'TRANSAK_WIDGET_INITIALISED' || id === 'TRANSAK_WIDGET_OPEN') setLoaded(true);
      if (id === 'TRANSAK_ORDER_SUCCESSFUL' && orderRef.current) verify(orderRef.current);
      if (id === 'TRANSAK_WIDGET_CLOSE') discard();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, amount]);

  const busy = phase === 'verifying';

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className="field w-24" value={amount} disabled={busy} onChange={(e) => setAmount(Number(e.target.value))}>
          {AMOUNTS.map((n) => (
            <option key={n} value={n}>
              £{n}
            </option>
          ))}
        </select>
        <button className="btn flex-1" onClick={open} disabled={busy}>
          {busy ? 'Checking order…' : 'Buy MON with card'}
        </button>
      </div>
      <div className="text-[11px] leading-relaxed text-neutral-500">
        <p>Test mode, no real money. In the Transak window:</p>
        <ol className="list-decimal pl-4">
          <li>
            Email: your own address with <b>+seamless</b> added (e.g. you+seamless@gmail.com). Enter the code Transak emails you.
          </li>
          <li>Your details are pre-filled with a UK test person. Just confirm them. If asked for a phone code, enter 000000.</li>
          <li>
            Card <b>4242 4242 4242 4242</b>, expiry 10/33, CVV 100. If a bank page asks for a password, type <b>Checkout1!</b>
          </li>
        </ol>
        <p>
          Stuck on an ID photo or selfie step? Test mode always approves, so any photo works. Or press <b>Start over</b> and use a new email (you+seamless2@gmail.com). If Transak
          signs you back in automatically, log out from its menu (☰) first. Its progress is saved per email, not in this site.
        </p>
      </div>
      {msg && <p className={`text-[12px] ${phase === 'error' ? 'text-[var(--color-bad)]' : 'text-neutral-700'}`}>{msg}</p>}
      {(phase === 'error' || visible) && (
        <div className="flex gap-2">
          <input className="field h-9 text-[12px]" placeholder="Transak order ID" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn btn-line h-9 px-3" onClick={() => manual && verify(manual.trim())}>
            Check order
          </button>
        </div>
      )}
      {mounted &&
        createPortal(
          // Always mounted so the checkout can boot hidden; `inert` + no pointer events while hidden.
          <div
            data-transak
            aria-hidden={!visible}
            inert={!visible}
            className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-150 ${visible ? 'bg-black/60 opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <div className="relative h-[88dvh] w-full max-w-[460px] overflow-hidden bg-white">
              <div className="absolute right-3 top-3 z-20 flex gap-1.5">
                <button className="label bg-white px-2 py-1" title="Open a fresh Transak checkout" onClick={startOver}>
                  Start over
                </button>
                <button className="label bg-white px-2 py-1" onClick={() => setVisible(false)}>
                  Close
                </button>
              </div>
              {(!session || !loaded) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-[12px] text-neutral-500">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
                  Opening Transak test checkout…
                </div>
              )}
              {session && (
                <iframe
                  key={session.url}
                  ref={frame}
                  src={session.url}
                  onLoad={() => setLoaded(true)}
                  allow="camera;microphone;payment"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="h-full w-full border-0"
                  title="Transak"
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
