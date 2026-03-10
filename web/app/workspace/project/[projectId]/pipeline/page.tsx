import { RequireAuth } from '@/components/RequireAuth';
import PipelineClient from './PipelineClient';

export const dynamic = 'force-dynamic';

export default async function ProjectPipelinePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = decodeURIComponent(String(resolved.projectId || '').trim());
  return (
    <RequireAuth>
      <PipelineClient projectId={projectId} />
    </RequireAuth>
  );
}
