import { ParentView } from '@/components/ParentView';

export const dynamic = 'force-dynamic';

export default async function ParentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ParentView token={token} />;
}
