'use client';

import { useState } from 'react';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { CHAIN } from '@/lib/wagmi';
import { short } from '@taskpay/sdk';
import { BuyWithCard } from './BuyWithCard';

export function useWallet() {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const bal = useBalance({ address, chainId: CHAIN.id, query: { enabled: !!address, refetchInterval: 6000 } });
  async function connect() {
    const c = connectors.find((x) => x.name.toLowerCase().includes('metamask')) ?? connectors[0];
    const r = await connectAsync({ connector: c, chainId: CHAIN.id });
    if (r.chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
  }
  async function ensureChain() {
    if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
  }
  const mon = bal.data ? Number(formatEther(bal.data.value)) : undefined;
  return { address, isConnected, connect, ensureChain, connecting: isPending, mon, refetch: bal.refetch, wrongChain: isConnected && chainId !== CHAIN.id };
}

export function ConnectButton({ className = 'btn' }: { className?: string }) {
  const w = useWallet();
  if (w.isConnected && !w.wrongChain) return null;
  return (
    <button className={className} onClick={() => (w.isConnected ? w.ensureChain() : w.connect())} disabled={w.connecting}>
      {w.isConnected ? 'Switch to Monad testnet' : w.connecting ? 'Connecting…' : 'Connect MetaMask'}
    </button>
  );
}

export function WalletPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = useWallet();
  const { disconnect } = useDisconnect();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function faucet() {
    if (!w.address) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address }) });
      const j = await r.json();
      setMsg(j.ok ? `Sent ${j.amount} MON to your wallet.` : j.error);
      w.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[420px] bg-white p-8 shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <div className="label">Your wallet</div>
          <button className="label" onClick={onClose}>
            Close
          </button>
        </div>
        {!w.isConnected ? (
          <div className="mt-10">
            <h3 className="display text-[34px]">Connect to pay with TaskPay</h3>
            <p className="mt-4 text-[13px] leading-relaxed text-neutral-600">
              Your MetaMask holds your MON. Each task locks a small budget in the TaskPay vault with one confirmation, and anything unspent comes back.
            </p>
            <div className="mt-8">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            <div>
              <div className="label text-neutral-500">Connected</div>
              <div className="mt-1 font-mono text-[13px]">{short(w.address!)}</div>
            </div>
            <div>
              <div className="label text-neutral-500">Balance</div>
              <div className="display mt-2 text-[44px]">{w.mon === undefined ? '…' : w.mon.toFixed(3)}<span className="ml-2 text-[16px]">MON</span></div>
              {w.wrongChain && <div className="mt-2"><ConnectButton className="btn btn-line" /></div>}
              {w.mon !== undefined && w.mon < 10 && (
                <p className="mt-3 text-[12px] leading-relaxed text-neutral-600">
                  Under 10 MON, Monad lets a wallet send one money transfer at a time. TaskPay is built for that: one confirmation per action.
                </p>
              )}
            </div>
            <div className="space-y-3">
              <div className="label">Add funds</div>
              <BuyWithCard address={w.address!} onDone={() => w.refetch()} />
              <button className="btn btn-line w-full" disabled={busy} onClick={faucet}>
                {busy ? 'Sending…' : 'Get test MON'}
              </button>
              {msg && <p className="text-[12px] text-neutral-700">{msg}</p>}
            </div>
            <button className="label text-neutral-500 underline" onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
