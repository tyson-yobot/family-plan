import { Icon } from '@/components/icons';

/**
 * The address people land on if they open the site without their own link.
 *
 * It used to be four sentences of housekeeping and nothing else, which told a
 * first-time reader how to get in but never what they were getting into. The
 * practical instructions are still here and unchanged in meaning; they now sit
 * under a line that says why any of this exists.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}
        aria-hidden="true"
      >
        <Icon name="compass" size={26} />
      </span>

      <h1 className="mt-5 text-[26px] font-semibold leading-tight tracking-tight">Family plan</h1>
      <p className="mt-3 text-[16px] leading-relaxed">
        Once a month, each of us stops for a few minutes and says honestly how things are
        actually going, and what we want to be different. It is kept, so next month you can look
        back at what you wrote and see what changed.
      </p>

      <p className="mt-5 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Each person has their own private link to their own check-in. Open the link you were
        given, or scan your own QR code. There is nothing to sign in to.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        If you have lost your link, ask Tyson for it again.
      </p>
    </main>
  );
}
