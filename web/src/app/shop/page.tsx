import { CATALOG, type Product } from '@taskpay/sdk';
import { ProductCard } from '@/components/ProductCard';

const DEPARTMENTS: { title: string; id: string; match: (p: Product) => boolean }[] = [
  { title: 'Fashion', id: 'fashion', match: (p) => ['outerwear', 'tops', 'bottoms', 'headwear', 'bags'].includes(p.category) },
  { title: 'Groceries', id: 'groceries', match: (p) => p.category === 'grocery' },
  { title: 'Electronics', id: 'electronics', match: (p) => p.category === 'electronics' },
  { title: 'Home', id: 'home', match: (p) => p.category === 'home' },
];

export default function Shop() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:px-10">
      <div className="md:px-[6.5rem]">
        <div className="label">Shop · {CATALOG.length} products</div>
        <h1 className="display mt-3 text-[56px]">All products</h1>
        <nav className="mt-6 flex flex-wrap gap-2">
          {DEPARTMENTS.map((d) => (
            <a key={d.id} href={`#${d.id}`} className="rounded-full border border-black px-4 py-1.5 text-[12px] font-semibold hover:bg-black hover:text-white">
              {d.title}
            </a>
          ))}
        </nav>
        {DEPARTMENTS.map((d) => (
          <section key={d.id} id={d.id} className="scroll-mt-24 pt-12">
            <h2 className="label text-[13px]">{d.title}</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4">
              {CATALOG.filter(d.match).map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
