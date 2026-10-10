import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATALOG, productById } from '@taskpay/sdk';
import { price } from '@/components/ProductCard';
import { Inr } from '@/components/Inr';
import { ShieldIcon } from '@/components/Icons';

export function generateStaticParams() {
  return CATALOG.map((p) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = productById(id);
  if (!p) notFound();
  return (
    <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-12 md:grid-cols-2 md:px-10">
      <div className="relative aspect-[222/266] bg-[var(--color-mist)]">
        <Image src={p.image} alt={p.name} fill sizes="50vw" className="object-contain mix-blend-multiply" priority />
      </div>
      <div className="md:pr-[6.5rem]">
        <Link href="/shop" className="label text-neutral-500">
          ← Shop
        </Link>
        <h1 className="display mt-6 text-[52px]">{p.name}</h1>
        <div className="mt-4 text-[15px] font-semibold">
          {price(p.price)} <Inr mon={p.price} className="ml-1 text-[13px] font-normal text-neutral-500" />
        </div>
        <p className="mt-6 max-w-[420px] text-[14px] leading-relaxed">{p.blurb}</p>
        <div className="mt-6 flex gap-2">
          {p.colors.map((c) => (
            <span key={c} className="h-4 w-4 rounded-full border border-neutral-300" style={{ background: c }} />
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/agent?task=${encodeURIComponent(`Buy me the ${p.name}`)}`} className="btn">
            Buy with AI agent
          </Link>
          <span className="label inline-flex items-center gap-2 text-neutral-500">
            <ShieldIcon className="h-4 w-4" /> Paid through TaskPay on Monad
          </span>
        </div>
        <div className="mt-14">
          <div className="label">Reviews</div>
          <ul className="mt-4 space-y-4">
            {p.reviews.map((r, i) => (
              <li key={i} className="border-b border-[var(--color-fog)] pb-4 text-[13px]">
                <div className="flex justify-between">
                  <span className="font-semibold">{r.author}</span>
                  <span>{'★'.repeat(r.rating)}</span>
                </div>
                <p className="mt-1.5 leading-relaxed text-neutral-700">{r.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
