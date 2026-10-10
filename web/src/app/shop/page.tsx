import { CATALOG } from '@taskpay/sdk';
import { ProductCard } from '@/components/ProductCard';

export default function Shop() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:px-10">
      <div className="md:px-[6.5rem]">
        <div className="label">Shop · SS26</div>
        <h1 className="display mt-3 text-[56px]">All products</h1>
        <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4">
          {CATALOG.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
