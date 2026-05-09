'use client';

import Link from 'next/link';
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
        <img src="/icons/icon-small.svg" alt="BAU Suite" width={32} height={32} className="mb-4" />
        <div className="rounded-full bg-muted p-4">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Page Not Found</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>

        <nav className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link href="/dashboard" className="text-primary hover:underline underline-offset-4">
            Dashboard
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/projects" className="text-primary hover:underline underline-offset-4">
            Projects
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/help" className="text-primary hover:underline underline-offset-4">
            Help
          </Link>
        </nav>

        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
          <Button onClick={() => router.push('/dashboard')}>Dashboard</Button>
        </div>
      </div>
    </>
  );
}
