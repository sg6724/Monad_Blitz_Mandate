'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { CHAIN } from '@/lib/wagmi';
import { explorerAddress, short } from '@taskpay/sdk';
import { BuyWithCard } from './BuyWithCard';
import { Identicon } from './Identicon';
import { Inr } from './Inr';

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useWallet() {
  const { address, chainId, isConnected, isReconnecting } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const bal = useBalance({ address, chainId: CHAIN.id, query: { enabled: !!address, refetchInterval: 6000 } });

  async function connect() {
    setError(null);
    if (typeof window !== 'undefined' && !(window as any).ethereum) {
      window.open('https://metamask.io/download/', '_blank');
      setError('MetaMask is not installed. Install it, then refresh this page.');
      return;
    }
    try {
      const c = connectors.find((x) => x.id === 'metaMaskSDK' || x.name.toLowerCase().includes('metamask')) ?? connectors[0];
      const r = await connectAsync({ connector: c });
      // Adds Monad testnet to MetaMask if it's missing, then switches to it.
      if (r.chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setError(/rejected|denied/i.test(msg) ? 'Request cancelled in MetaMask.' : /already pending/i.test(msg) ? 'Open MetaMask: a request is already waiting.' : msg);
    }
  }
  async function ensureChain() {
    setError(null);
    try {
      if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }
  const mon = bal.data ? Number(formatEther(bal.data.value)) : undefined;
  return {
    address,
    isConnected,
    connect,
    ensureChain,
    connecting: isPending || switching || isReconnecting,
    error,
    mon,
    refetch: bal.refetch,
    wrongChain: isConnected && chainId !== CHAIN.id,
  };
}

export function ConnectButton({ className = 'btn' }: { className?: string }) {
  const w = useWallet();
  const mounted = useMounted();
  if (mounted && w.isConnected && !w.wrongChain) return null;
  return (
    <div className="space-y-2">
      <button className={className} onClick={() => (w.isConnected ? w.ensureChain() : w.connect())} disabled={w.connecting}>
        <MetaMaskLogo className="mr-2 h-4 w-4" />
        {w.isConnected ? 'Switch to Monad testnet' : w.connecting ? 'Check MetaMask…' : 'Connect MetaMask'}
      </button>
      {w.error && <p className="text-[12px] text-[var(--color-bad)]">{w.error}</p>}
    </div>
  );
}

export function MetaMaskLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 35 33" className={className} aria-hidden>
      <path fill="#E17726" d="M32.96 1 19.4 11.03l2.52-5.92z" />
      <path fill="#E27625" d="m2.66 1 13.44 10.12-2.4-6.01zm25.39 23.27-3.61 5.52 7.73 2.13 2.21-7.53zM1.27 24.39l2.2 7.53 7.71-2.13-3.6-5.52z" />
      <path fill="#E27625" d="m10.77 14.95-2.15 3.24 7.66.35-.25-8.25zm14.08 0-5.33-4.75-.17 8.34 7.65-.35zM11.18 29.79l4.63-2.24-3.98-3.1zm8.63-2.24 4.6 2.24-.64-5.34z" />
      <path fill="#D5BFB2" d="m24.41 29.79-4.6-2.24.37 3 -.04 1.27zm-13.23 0 4.28 2.03-.03-1.27.35-3z" />
      <path fill="#233447" d="m15.54 22.47-3.83-1.12 2.7-1.24zm4.53 0 1.13-2.36 2.72 1.24z" />
      <path fill="#CC6228" d="m11.18 29.79.67-5.52-4.27.12zm12.6-5.52.63 5.52 3.61-5.4zm3.28-6.08-7.65.35.71 3.93 1.13-2.36 2.72 1.24zm-15.35 3.16 2.72-1.24 1.11 2.36.73-3.93-7.66-.35z" />
      <path fill="#E27525" d="m8.62 18.19 3.21 6.26-.11-3.1zm15.11 3.16-.13 3.1 3.21-6.26zm-7.45-2.81-.73 3.93.92 4.68.2-6.17zm4.15 0-.38 2.43.18 6.18.92-4.68z" />
      <path fill="#F5841F" d="m20.84 22.47-.92 4.68.66.46 3.98-3.1.13-3.1zm-9.13-1.24.11 3.1 3.98 3.1.66-.46-.92-4.68z" />
      <path fill="#C0AC9D" d="m20.92 31.82.04-1.27-.35-.3h-5.6l-.34.3.03 1.27-4.28-2.03 1.5 1.23 3.03 2.1h5.71l3.04-2.1 1.48-1.23z" />
      <path fill="#161616" d="m19.81 27.55-.66-.46h-3.68l-.66.46-.35 3 .34-.3h5.6l.35.3z" />
      <path fill="#763E1A" d="m33.53 11.69 1.14-5.51L32.96 1 19.81 10.75l5.04 4.2 7.13 2.08 1.57-1.84-.69-.5 1.09-.99-.83-.64 1.08-.83zM.94 6.18l1.16 5.51-.74.55 1.1.83-.83.64 1.09.99-.69.5 1.57 1.84 7.13-2.08 5.04-4.2L2.66 1z" />
      <path fill="#F5841F" d="m31.98 17.03-7.13-2.08 2.15 3.24-3.21 6.26 4.24-.06h6.33zm-21.21-2.08-7.13 2.08-2.37 7.36h6.31l4.24.06-3.21-6.26zm9.68 3.59.46-7.79 2.06-5.62h-9.2l2.04 5.62.47 7.79.17 2.46.01 6.06h3.68l.02-6.06z" />
    </svg>
  );
}

/** The header wallet control: a connect button, or an avatar pill with a dropdown like other web3 apps. */
export function WalletButton() {
  const w = useWallet();
  const mounted = useMounted();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-transak]')) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function faucet() {
    if (!w.address) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch('/api/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address }) }).then((r) => r.json());
      setMsg(j.ok ? `Sent ${j.amount} MON to your wallet.` : j.error);
      w.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !w.isConnected) {
    return (
      <div className="relative">
        <button
          onClick={() => w.connect()}
          disabled={w.connecting}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-[13px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
        >
          <MetaMaskLogo className="h-4 w-4" />
          {w.connecting ? 'Check MetaMask…' : 'Connect wallet'}
        </button>
        {w.error && <div className="absolute right-0 top-12 w-64 rounded-xl border border-[var(--color-fog)] bg-white p-3 text-[12px] text-[var(--color-bad)] shadow-lg">{w.error}</div>}
      </div>
    );
  }

  if (w.wrongChain) {
    return (
      <button onClick={() => w.ensureChain()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--color-bad)] px-4 text-[13px] font-semibold text-white">
        <span className="h-2 w-2 rounded-full bg-white" /> Switch to Monad
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2.5 rounded-xl bg-[var(--color-mist)] py-1.5 pl-1.5 pr-3 text-[13px] font-medium transition hover:bg-[var(--color-fog)]"
      >
        <Identicon address={w.address!} size={28} />
        <span className="hidden font-mono sm:inline">{short(w.address!)}</span>
        <span className="hidden rounded-md bg-white px-2 py-0.5 text-[12px] font-semibold tabular-nums md:inline">{w.mon === undefined ? '…' : w.mon.toFixed(2)} MON</span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="rise absolute right-0 top-12 z-50 w-[340px] rounded-2xl border border-[var(--color-fog)] bg-white p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <Identicon address={w.address!} size={44} />
            <div className="min-w-0">
              <div className="font-mono text-[14px] font-semibold">{short(w.address!)}</div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" /> MetaMask · Monad testnet
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-[var(--color-mist)] p-4">
            <div className="label text-neutral-500">Balance</div>
            <div className="display mt-1 text-[32px]">
              {w.mon === undefined ? '…' : w.mon.toFixed(3)}
              <span className="ml-1.5 text-[14px]">MON</span>
            </div>
            {w.mon !== undefined && <Inr mon={w.mon} className="text-[12px] text-neutral-500" />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <button
              className="rounded-lg border border-[var(--color-fog)] py-2 hover:bg-[var(--color-mist)]"
              onClick={() => {
                navigator.clipboard.writeText(w.address!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy address'}
            </button>
            <a className="rounded-lg border border-[var(--color-fog)] py-2 text-center hover:bg-[var(--color-mist)]" href={explorerAddress(w.address!)} target="_blank" rel="noreferrer">
              View on Monadscan
            </a>
          </div>
          <div className="mt-4 space-y-2">
            <div className="label">Add funds</div>
            <button className="btn btn-line w-full" disabled={busy} onClick={faucet}>
              {busy ? 'Sending…' : 'Get 1 test MON (free)'}
            </button>
            <div data-transak>
              <BuyWithCard address={w.address!} onDone={() => w.refetch()} />
            </div>
            {msg && <p className="text-[12px] text-neutral-700">{msg}</p>}
          </div>
          <button
            className="mt-4 w-full rounded-lg py-2 text-[12px] font-semibold text-[var(--color-bad)] hover:bg-red-50"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
