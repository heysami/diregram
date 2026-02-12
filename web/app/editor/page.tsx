import { EditorApp } from '@/components/EditorApp';
import { Suspense } from 'react';
import { RequireAuth } from '@/components/RequireAuth';

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <RequireAuth>
        <EditorApp />
      </RequireAuth>
    </Suspense>
  );
}

