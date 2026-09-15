import { FamilyBoard } from '@/components/FamilyBoard';

export const dynamic = 'force-dynamic';

/**
 * The old parent links.
 *
 * This address used to lay out every person's answers. It does not any more and
 * nothing does: it is the family board, the same one everybody else sees. The
 * route is kept rather than removed so a link already saved on a phone opens
 * something sensible instead of breaking, and the board itself sends anybody
 * who wants their own things on to their own space behind their own code. The
 * names on it link to /h/<token>/<name>, because the same token opens the board
 * either way and one implementation is better than two that can drift.
 */
export default async function OldParentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FamilyBoard token={token} />;
}
