'use client';

/** Placeholder until Phase 4 wires the Transak widget. */
export function BuyWithCard({ address, onDone }: { address: string; onDone: () => void }) {
  void address;
  void onDone;
  return (
    <button className="btn w-full" disabled>
      Buy MON with card
    </button>
  );
}
