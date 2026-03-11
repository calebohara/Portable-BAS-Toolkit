'use client';

import { useRouter } from 'next/navigation';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/layout/top-bar';

export default function NotFound() {
  const router = useRouter();

  return (
    <>
      <TopBar title="Page Not Found" />
      <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Page Not Found</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
          <Button onClick={() => router.push('/')}>Dashboard</Button>
        </div>
      </div>
    </>
  );
}
