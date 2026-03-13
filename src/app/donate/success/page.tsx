'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

export default function DonateSuccessPage() {
  const router = useRouter();
  const { mode } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();

  return (
    <div ref={scrollRef} className="min-h-screen bg-background flex flex-col">
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

      {/* Centered success message */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
        <div className="hp-reveal revealed text-center max-w-md">
          <div
            className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-field-success/10 border border-field-success/20 mb-6"
            style={{ animation: 'hp-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            <CheckCircle className="h-8 w-8 text-field-success" />
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.15s', opacity: 0 }}
          >
            Thank you for your support
          </h1>

          <p
            className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-2"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.3s', opacity: 0 }}
          >
            Your contribution directly funds the continued development of BAU Suite — new tools,
            better infrastructure, and a stronger platform for the field.
          </p>

          <p
            className="text-xs text-muted-foreground mb-8 flex items-center justify-center gap-1.5"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.4s', opacity: 0 }}
          >
            <Heart className="h-3 w-3 text-field-danger" /> Every contribution makes a difference.
          </p>

          <div
            className="flex flex-col sm:flex-row gap-3 justify-center"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
          >
            {isAuthed ? (
              <Button size="lg" onClick={() => router.push('/dashboard')} className="gap-2 hp-btn-glow">
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={() => router.push('/')} className="gap-2 hp-btn-glow">
                Back to Home <ArrowRight className="h-4 w-4" />
              </Button>
            )}
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
