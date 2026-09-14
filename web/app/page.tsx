export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Family plan</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Each person has their own private link to their own check-in. Open the link you were
        given, or scan your own QR code. There is nothing to sign in to.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        If you have lost your link, ask Tyson for it again.
      </p>
    </main>
  );
}
