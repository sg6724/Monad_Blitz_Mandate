import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@taskpay/sdk';
import { Inr } from './Inr';

export function price(n: number) {
  // Two decimals for most prices, three for cheap groceries (0.034 MON, not 0.03).
  return `${n < 0.1 ? Number(n.toFixed(3)) : n.toFixed(2)} MON`;
}

export function ProductCard({ p, size = 'lg' }: { p: Product; size?: 'lg' | 'sm' }) {
  return (
    <Link href={`/product/${p.id}`} className="group block">
      <div className={`relative flex items-center justify-center overflow-hidden bg-[var(--color-mist)] ${size === 'lg' ? 'aspect-[222/266]' : 'aspect-[144/172]'}`}>
        <Image
          src={p.image}
          alt={p.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 label text-[12px]">{p.name}</div>
      <div className="mt-1 text-[12px] text-neutral-700">
        {price(p.price)} <Inr mon={p.price} className="ml-1 text-neutral-400" />
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {p.colors.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-full border border-neutral-300" style={{ background: c }} />
        ))}
      </div>
    </Link>
  );
}
