import { EditorRouter } from '@/components/EditorRouter';
import { Suspense } from 'react';
import { RequireAuth } from '@/components/RequireAuth';

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <RequireAuth>
        <EditorRouter />
      </RequireAuth>
    </Suspense>
  );
}

