/** Blockies-style avatar: a symmetric 8×8 grid seeded by the address, like most wallets show. */
function seeded(addr: string) {
  const s = [0, 0, 0, 0];
  const a = addr.toLowerCase();
  for (let i = 0; i < a.length; i++) s[i % 4] = (s[i % 4] << 5) - s[i % 4] + a.charCodeAt(i);
  return () => {
    const t = s[0] ^ (s[0] << 11);
    s[0] = s[1];
    s[1] = s[2];
    s[2] = s[3];
    s[3] = s[3] ^ (s[3] >> 19) ^ t ^ (t >> 8);
    return (s[3] >>> 0) / 2 ** 32;
  };
}

function color(r: () => number) {
  return `hsl(${Math.floor(r() * 360)} ${40 + r() * 60}% ${(r() + r() + r() + r()) * 25}%)`;
}

export function Identicon({ address, size = 24, className = '' }: { address: string; size?: number; className?: string }) {
  const r = seeded(address);
  const fg = color(r);
  const bg = color(r);
  const spot = color(r);
  const cells: number[] = [];
  for (let y = 0; y < 8; y++) {
    const row = Array.from({ length: 4 }, () => Math.floor(r() * 2.3));
    cells.push(...row, ...[...row].reverse());
  }
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" className={`shrink-0 rounded-md ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect width="8" height="8" fill={bg} />
      {cells.map((v, i) => (v ? <rect key={i} x={i % 8} y={Math.floor(i / 8)} width="1" height="1" fill={v === 1 ? fg : spot} /> : null))}
    </svg>
  );
}
