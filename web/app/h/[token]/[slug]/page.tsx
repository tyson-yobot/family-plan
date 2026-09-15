import { PersonSpace } from '@/components/PersonSpace';

export const dynamic = 'force-dynamic';

export default async function SpacePage({
  params,
}: {
  params: Promise<{ token: string; slug: string }>;
}) {
  const { token, slug } = await params;
  return <PersonSpace token={token} slug={slug} />;
}
