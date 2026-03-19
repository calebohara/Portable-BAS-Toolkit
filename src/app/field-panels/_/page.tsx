'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FieldPanelDetailPage } from './client-page';

function Inner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('_id');
  if (!id) return null;
  return <FieldPanelDetailPage panelId={id} />;
}

export default function Page() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
