import { FamilyBoard } from '@/components/FamilyBoard';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FamilyBoard token={token} />;
}
