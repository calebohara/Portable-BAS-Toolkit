'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';

export default function DonateCancelPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Glass nav */}
      <header className="hp-glass-nav sticky top-0 z-40 border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => router.push('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
              <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-8 w-8" />
            </div>
            <span className="text-sm font-semibold tracking-tight">BAU Suite</span>
          </button>
        </div>
      </header>

      {/* Centered cancel message */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
        <div className="text-center max-w-md">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-muted mb-6">
            <Heart className="h-8 w-8 text-muted-foreground" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            No worries
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">
            You can support BAU Suite anytime. The platform is free to use regardless.
            Thanks for checking it out.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" size="lg" onClick={() => router.push('/donate')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Support
            </Button>
            <Button size="lg" onClick={() => router.push('/')} className="gap-2 hp-btn-glow">
              Back to Home
            </Button>
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <footer className="border-t border-border/50 py-6 px-4 text-center">
        <p className="text-xs text-muted-foreground">BAU Suite v{APP_VERSION}</p>
      </footer>
    </div>
  );
}
