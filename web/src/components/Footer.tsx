import Link from 'next/link';
import { ArrowRight } from './Icons';

const COLS = [
  { title: 'Shop', links: [['All Products', '/shop'], ['New Arrivals', '/shop'], ['Best Sellers', '/shop'], ['Accessories', '/shop']] },
  { title: 'Brand', links: [['About Us', '/#journal'], ['Lookbook', '/#lookbook'], ['Journal', '/#journal'], ['TaskPay', '/agent']] },
  { title: 'Customer Care', links: [['Shipping & Returns', '/#'], ['Your Tasks', '/tasks'], ['FAQ', '/agent'], ['Contact Us', '/#']] },
];

export function Footer() {
  return (
    <footer className="bg-[var(--color-mist)]">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.5fr] md:px-10">
        <div>
          <div className="font-[family-name:var(--font-archivo)] text-[22px] font-black">NEXUS</div>
          <p className="mt-4 max-w-[220px] text-[12px] leading-relaxed text-neutral-600">
            Minimal design and maximum impact. Shoppable by people, and by AI agents on a budget they can&apos;t break.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="label mb-4">{c.title}</div>
            <ul className="space-y-2.5 text-[12px] text-neutral-700">
              {c.links.map(([t, h]) => (
                <li key={t}>
                  <Link href={h} className="hover:underline">
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <div className="label mb-4">Newsletter</div>
          <p className="text-[12px] leading-relaxed text-neutral-700">Subscribe to get updates on new collections and exclusive offers.</p>
          <form className="mt-4 flex" action="#">
            <input className="field h-10 text-[12px]" placeholder="Enter your email" />
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center bg-black text-white" aria-label="Subscribe">
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-8 flex gap-6 text-[11px] text-neutral-600">
            <span>Privacy Policy</span>
            <span>Terms &amp; Conditions</span>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1280px] px-6 pb-8 text-[11px] text-neutral-500 md:px-10">
        Demo store on Monad testnet. Payments are made in testnet MON through TaskPay.
      </div>
    </footer>
  );
}
