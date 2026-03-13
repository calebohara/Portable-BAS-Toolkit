'use client';

import { useRouter } from 'next/navigation';
import { Heart, Shield, ArrowLeft, ArrowRight, Wrench, Zap, Clock } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

// ─── What support helps fund ─────────────────────────────────────────────────

const supportAreas = [
  { icon: Wrench, title: 'New tools & features', desc: 'More field-ready utilities, protocol support, and diagnostic capabilities.' },
  { icon: Zap, title: 'Performance & reliability', desc: 'Faster sync, better offline resilience, and smoother desktop integration.' },
  { icon: Shield, title: 'Security & infrastructure', desc: 'Cloud hosting, secure authentication, and ongoing maintenance.' },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function DonatePage() {
  const router = useRouter();
  const { mode } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();

  return (
    <div ref={scrollRef} className="min-h-screen bg-background">

      {/* ── Glass Navigation ─────────────────────────────────────────── */}
      <header className="hp-glass-nav sticky top-0 z-40 border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <button onClick={() => router.push('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-8 w-8" />
              </div>
              <span className="text-sm font-semibold tracking-tight">BAU Suite</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Button>
            {isAuthed && (
              <Button size="sm" onClick={() => router.push('/dashboard')} className="gap-1.5 hp-btn-glow">
                Open App <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="hp-orb absolute -top-32 -right-32 w-96 h-96 opacity-20 dark:opacity-15"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-teal) 0%, transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center" style={{ paddingTop: 'clamp(3rem, 8vw, 6rem)', paddingBottom: 'clamp(2rem, 4vw, 3rem)' }}>
          <div
            className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 border border-primary/15 mb-6"
            style={{ animation: 'hp-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.1s', opacity: 0 }}
          >
            <Heart className="h-7 w-7 text-primary" />
          </div>

          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.2s', opacity: 0, lineHeight: '1.1' }}
          >
            Support BAU Suite
          </h1>

          <p
            className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.35s', opacity: 0 }}
          >
            BAU Suite is built independently by one developer. Your support helps keep
            the platform growing, maintained, and free for the field.
          </p>
        </div>

        <div className="hp-divider" />
      </section>

      {/* ── What Support Helps ────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What your support funds</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Help build better tools for the field
            </h2>
          </div>

          <div className="hp-stagger grid gap-4 sm:grid-cols-3">
            {supportAreas.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-5">
                <div className="hp-tool-icon rounded-xl bg-primary/8 p-2.5 border border-primary/10 w-fit mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Coming Soon Card ──────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 6vw, 5rem)', paddingBottom: 'clamp(2.5rem, 6vw, 5rem)' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div className="hp-card-surface relative overflow-hidden p-8 sm:p-10 text-center">
              {/* Subtle gradient accent at top */}
              <div
                className="absolute top-0 left-0 right-0 h-1 opacity-60"
                style={{ background: 'linear-gradient(to right, var(--color-siemens-teal), var(--color-siemens-petrol))' }}
              />

              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-primary/10 border border-primary/15 mb-5">
                <Clock className="h-6 w-6 text-primary" />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
                Secure donations coming soon
              </h2>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-6">
                Stripe integration and secure payment support will be added once payment details are finalized.
                One-time and recurring support options are planned.
              </p>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>Payments will be processed securely via Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Appreciation ──────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="hp-reveal">
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto mb-6">
              Thank you for using BAU Suite and for considering supporting its development.
              Every contribution helps keep the project moving forward.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/')} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col gap-4 text-xs text-muted-foreground">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded overflow-hidden">
                <img src="/icons/icon-small.svg" alt="" className="h-5 w-5" />
              </div>
              <span>BAU Suite v{APP_VERSION}</span>
            </div>
            <div className="flex items-center gap-5">
              <button onClick={() => router.push('/')} className="hover:text-foreground transition-colors">Home</button>
              <button onClick={() => router.push('/help')} className="hover:text-foreground transition-colors">Help</button>
              <button onClick={() => router.push('/settings')} className="hover:text-foreground transition-colors">Settings</button>
            </div>
          </div>
          <div className="flex justify-center sm:justify-start">
            <span>
              Built by{' '}
              <a
                href="https://www.calebblaze.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Caleb O&apos;Hara
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
