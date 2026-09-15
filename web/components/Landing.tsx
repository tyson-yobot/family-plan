'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { lastLink } from '@/lib/link';

/**
 * Where somebody lands with no link.
 *
 * This used to be four paragraphs explaining the whole tool to a stranger who
 * cannot get into it anyway. There is one link for the house now, so anybody
 * who belongs here has it and anybody who does not has nothing to read.
 *
 * The one useful thing it does is remember. The app installs to a home screen
 * with a start address of "/", so the icon opens this page rather than the
 * board; if this phone has been in before, the way back is offered rather than
 * making somebody dig the link back out of a message. It offers rather than
 * redirects, because a redirect on a page somebody may have opened on purpose
 * is a page they cannot stay on.
 */
export function Landing() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(lastLink());
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="kicker steel text-[13px]">To a bigger life</p>
      <h1 className="display mt-3 text-[34px] leading-none">FAMILY PLAN</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-[var(--ink-soft)]">
        Ours, and private. Open the link for the house, or ask Tyson for it again.
      </p>

      {token ? (
        <Link
          href={`/h/${encodeURIComponent(token)}`}
          className="mt-7 w-full rounded-xl px-5 py-3.5 text-center text-[15px] font-bold"
          style={{ background: 'var(--silver)', color: 'var(--on-accent)' }}
        >
          Open the family board
        </Link>
      ) : null}
    </main>
  );
}
