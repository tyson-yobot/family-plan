import { WorksheetFlow } from '@/components/WorksheetFlow';

export const dynamic = 'force-dynamic';

export default async function WorksheetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <WorksheetFlow token={token} />;
}
