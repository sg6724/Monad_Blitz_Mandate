'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { BagIcon, SearchIcon, UserIcon } from './Icons';
import { WalletPanel } from './WalletPanel';

const NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/#lookbook', label: 'Lookbook' },
  { href: '/agent', label: 'AI Shopper', accent: true },
  { href: '/tasks', label: 'Tasks' },
  { href: '/#journal', label: 'Journal' },
];

export function Header() {
  const path = usePathname();
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[78px] max-w-[1280px] items-center justify-between px-6 md:px-10">
          <Link href="/" className="font-[family-name:var(--font-archivo)] text-[22px] font-black tracking-tight">
            BLOCKMART
          </Link>
          <nav className="hidden items-center gap-14 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`label relative ${path === n.href ? 'after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:bg-black' : ''}`}
              >
                {n.accent ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-volt)] ring-1 ring-black" />
                    {n.label}
                  </span>
                ) : (
                  n.label
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <Link href="/shop" aria-label="Search">
              <SearchIcon className="h-[22px] w-[22px]" />
            </Link>
            <button aria-label="Wallet" onClick={() => setOpen(true)} className="relative">
              <UserIcon className="h-[22px] w-[22px]" />
              {address && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--color-ok)]" />}
            </button>
            <Link href="/tasks" aria-label="Tasks">
              <BagIcon className="h-[22px] w-[22px]" />
            </Link>
          </div>
        </div>
      </header>
      <WalletPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
