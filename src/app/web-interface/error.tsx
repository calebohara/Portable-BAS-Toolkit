'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/layout/top-bar';

export default function WebInterfaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Web interface error:', error);
  }, [error]);

  return (
    <>
      <TopBar title="Web Interface" />
      <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
        <div className="rounded-full bg-field-danger/10 p-4">
          <AlertTriangle className="h-8 w-8 text-field-danger" />
        </div>
        <h2 className="text-lg font-semibold">Web interface encountered an error</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong loading the web interface panel. Your saved endpoints are safe.
        </p>
        {error.message && (
          <p className="rounded-lg bg-muted p-2 text-xs font-mono text-muted-foreground max-w-md truncate">
            {error.message}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Go Back
          </Button>
          <Button onClick={reset}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Try Again
          </Button>
        </div>
      </div>
    </>
  );
}
