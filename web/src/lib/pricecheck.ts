import { CATALOG, SURGE_MULTIPLIER } from '@taskpay/sdk';

/**
 * PriceCheck: a separate (demo) price-comparison service that charges 0.001 MON per request.
 * Each request answers one question about an item: BlockMart's live price, what other shops charge,
 * or the 30-day price history. The numbers are simulated but stable per item.
 */
export const PRICECHECK_SOURCES = ['blockmart', 'market', 'history'] as const;
export type PriceSource = (typeof PRICECHECK_SOURCES)[number];

const SHOPS = ['QuickKart', 'CityBazaar', 'ShopNow'];

function seed(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function priceData(item: string, source: PriceSource, surge = false) {
  const p = CATALOG.find((x) => x.name.toLowerCase() === item.toLowerCase());
  if (!p) return { item, error: 'unknown item' };
  const rnd = seed(p.id);
  if (source === 'blockmart') return { item: p.name, source, shop: 'BlockMart', price: r3(surge ? p.price * SURGE_MULTIPLIER : p.price) };
  if (source === 'market') {
    const others = SHOPS.map((shop) => ({ shop, price: r3(p.price * (1.04 + rnd() * 0.12)) }));
    return { item: p.name, source, others, average: r3(others.reduce((s, o) => s + o.price, 0) / others.length) };
  }
  return { item: p.name, source, low30d: r3(p.price * (0.94 + rnd() * 0.04)), avg30d: r3(p.price * (1.0 + rnd() * 0.05)) };
}
