import { LinkLanding } from '@/components/LinkLanding';

export const dynamic = 'force-dynamic';

/**
 * A person's own old link, which is what is on everybody's home screen already.
 *
 * It no longer opens a worksheet by itself. It works out whose link it is and
 * lands on that person's own sign-in screen, which is one tap from where it
 * used to go and is now behind their own code.
 */
export default async function PersonLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LinkLanding token={token} />;
}
