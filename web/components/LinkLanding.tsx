'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchLink } from '@/lib/api';

/**
 * What an old per-person link does now.
 *
 * Every one of the five was handed out, scanned from a QR code and in at least
 * one case saved to a phone home screen, so it has to keep opening something
 * sensible. It asks the server whose link it is and replaces itself with that
 * person's own sign-in screen, which is where the same link used to go except
 * that the code now stands in the way.
 *
 * `replace` rather than `push`, so the back button goes where the person came
 * from rather than bouncing them through this screen again.
 */
export function LinkLanding({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<'looking' | 'invalid'>('looking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const link = await fetchLink(token);
        if (cancelled) return;
        if (!link) {
          setState('invalid');
          return;
        }
        if (link.kind === 'person' && link.slug) {
          router.replace(`/h/${encodeURIComponent(token)}/${encodeURIComponent(link.slug)}`);
        } else {
          router.replace(`/h/${encodeURIComponent(token)}`);
        }
      } catch {
        if (!cancelled) setState('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  if (state === 'invalid') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">This link isn&apos;t valid.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
          Ask Tyson for the one for the house.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <p className="text-[15px] text-[var(--ink-soft)]">One moment.</p>
    </main>
  );
}
