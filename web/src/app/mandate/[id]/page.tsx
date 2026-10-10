'use client';

import { use, useState } from 'react';
import { MandatePanel } from '@/components/MandatePanel';
import { Timeline } from '@/components/Timeline';
import { appendSteps, readSteps } from '@/lib/client';
import { useMandate } from '@/lib/useMandate';

export default function MandatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useMandate(BigInt(id));
  const [, force] = useState(0);
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <div className="label">TaskPay task</div>
      {isLoading && <p className="mt-6 text-[13px]">Loading from Monad…</p>}
      {data && !data.m && <p className="mt-6 text-[13px]">Task #{id} not found.</p>}
      {data?.m && (
        <div className="mt-6 space-y-10">
          <MandatePanel
            m={data.m}
            onAction={(what) => {
              appendSteps(id, [{ at: Math.floor(Date.now() / 1000), kind: 'note', text: `Owner action: ${what}` }]);
              force((n) => n + 1);
            }}
          />
          <Timeline m={data.m} entries={data.h} steps={readSteps(id)} />
        </div>
      )}
    </div>
  );
}
