import Image from 'next/image';
import Link from 'next/link';
import { CATALOG, productById } from '@taskpay/sdk';
import { HeroSlider } from '@/components/HeroSlider';
import { ProductCard, price } from '@/components/ProductCard';
import { ArrowRight, DropIcon, FitIcon, PocketIcon } from '@/components/Icons';

export default function Home() {
  const featured = ['utility-hoodie', 'oversized-tshirt', 'cargo-pants', 'tech-cap'].map((id) => productById(id)!);
  const more = ['cargo-pants', 'oversized-tshirt', 'bucket-hat', 'shoulder-bag'].map((id) => productById(id)!);
  const hoodie = productById('utility-hoodie')!;
  return (
    <>
      <HeroSlider />

      {/* Featured products */}
      <section className="mx-auto max-w-[1280px] px-6 pt-14 md:px-10">
        <div className="flex items-center justify-between md:px-[6.5rem]">
          <h2 className="label text-[13px]">Featured Products</h2>
          <Link href="/shop" className="label text-[12px]">
            View all
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4 md:px-[6.5rem]">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      {/* Product showcase */}
      <section className="mt-16 bg-[var(--color-mist)]">
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-6 py-14 md:grid-cols-[1fr_1.1fr_0.7fr] md:px-10">
          <div className="md:pl-[6.5rem]">
            <div className="label">Product Showcase</div>
            <h2 className="display mt-6 text-[44px]">
              Utility
              <br />
              Hoodie
            </h2>
            <div className="mt-5 text-[13px] font-semibold">{price(hoodie.price)}</div>
            <p className="mt-5 max-w-[260px] text-[13px] leading-relaxed">{hoodie.blurb}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/product/${hoodie.id}`} className="btn">
                View product
              </Link>
              <Link href={`/agent?task=${encodeURIComponent('Buy me the Utility Hoodie')}`} className="btn btn-line">
                Ask the agent
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[300/316] w-full max-w-[340px]">
            <Image src="/nexus/showcase.png" alt="Utility Hoodie" fill sizes="340px" className="object-contain mix-blend-multiply" />
          </div>
          <ul className="space-y-10">
            {[
              [DropIcon, 'Water', 'Resistant'],
              [PocketIcon, 'Multi', 'Pockets'],
              [FitIcon, 'Adjustable', 'Fit'],
            ].map(([Icon, a, b]) => {
              const I = Icon as typeof DropIcon;
              return (
                <li key={a as string} className="flex items-center gap-4">
                  <I className="h-8 w-8" />
                  <span className="label leading-tight">
                    {a as string}
                    <br />
                    {b as string}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Lookbook */}
      <section id="lookbook" className="mx-auto max-w-[1280px] px-6 py-14 md:px-10">
        <div className="flex items-center justify-between md:px-[6.5rem]">
          <h2 className="label text-[13px]">Lookbook SS26</h2>
          <Link href="/shop" className="label text-[12px]">
            View all
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-3 gap-4 md:px-[6.5rem]">
          {['look1', 'look2', 'look3'].map((l) => (
            <div key={l} className="relative aspect-[184/218] overflow-hidden bg-[var(--color-mist)]">
              <Image src={`/nexus/${l}.png`} alt="Lookbook" fill sizes="33vw" className="object-cover grayscale" />
            </div>
          ))}
        </div>
      </section>

      {/* Black banner */}
      <section className="bg-black text-white">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-10">
          <div className="md:pl-[6.5rem]">
            <div className="display text-[26px] md:text-[30px]">Let an AI agent shop for you</div>
            <div className="mt-2 text-[12px] text-neutral-400">With a budget it can&apos;t break. Locked on Monad, unspent MON comes straight back.</div>
          </div>
          <Link href="/agent" className="label inline-flex items-center gap-6 text-[12px] text-[var(--color-volt)] md:pr-[6.5rem]">
            Try TaskPay
            <ArrowRight className="h-5 w-10" />
          </Link>
        </div>
      </section>

      {/* More products */}
      <section id="journal" className="mx-auto max-w-[1280px] px-6 py-14 md:px-10">
        <div className="flex items-center justify-between md:px-[6.5rem]">
          <h2 className="label text-[13px]">New Arrivals</h2>
          <Link href="/shop" className="label text-[12px]">
            View all
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4 md:px-[6.5rem]">
          {more.map((p, idx) => (
            <ProductCard key={p.id + idx} p={p} size="sm" />
          ))}
        </div>
        <p className="mt-10 text-[11px] text-neutral-500 md:px-[6.5rem]">{CATALOG.length} products · prices in testnet MON</p>
      </section>
    </>
  );
}
