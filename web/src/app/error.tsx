'use client';

import { useEffect } from 'react';

/** Shown when a page crashes. A stale build (we redeployed while the tab was open) is fixed by one reload. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    if (stale && !sessionStorage.getItem('taskpay:reloaded')) {
      sessionStorage.setItem('taskpay:reloaded', '1');
      window.location.reload();
    }
    console.error(error);
  }, [error, stale]);
  return (
    <div className="mx-auto max-w-[640px] px-6 py-24 text-center">
      <div className="label">Something broke</div>
      <h1 className="display mt-3 text-[40px]">{stale ? 'A new version is live' : 'This page hit an error'}</h1>
      <p className="mt-4 text-[13px] text-neutral-600">{stale ? 'Reload to get the latest version.' : error?.message}</p>
      <div className="mt-8 flex justify-center gap-3">
        <button className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
        {!stale && (
          <button className="btn btn-line" onClick={reset}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
