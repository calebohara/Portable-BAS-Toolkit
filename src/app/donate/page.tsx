'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Heart, ArrowLeft, ArrowRight, Shield, Wrench, Zap, Cloud,
  Monitor, Code, ChevronDown, Lock, CreditCard, RefreshCw,
  Rocket, Users, Server,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import {
  isStripeConfigured,
  ONE_TIME_TIERS,
  MONTHLY_TIERS,
  type DonationMode,
  type DonationTier,
} from '@/lib/stripe-config';

// ─── Data ────────────────────────────────────────────────────────────────────

const whySupport = [
  {
    icon: Code,
    title: 'Independently built',
    desc: 'BAU Suite is designed, built, and maintained by one developer. Every contribution directly funds focused development time.',
  },
  {
    icon: Rocket,
    title: 'Active development',
    desc: 'New features, tools, and refinements ship regularly. Support keeps momentum going and the roadmap moving forward.',
  },
  {
    icon: Users,
    title: 'Built for the field',
    desc: 'This platform exists for BAS technicians and engineers. Support helps deliver the tools the field actually needs.',
  },
];

const impactItems = [
  { icon: Monitor, title: 'Desktop app', desc: 'Native Windows app with ICMP, full network access, and Tauri runtime' },
  { icon: Wrench, title: 'New field tools', desc: 'Diagnostic utilities, protocol tools, and engineering calculators' },
  { icon: Cloud, title: 'Cloud infrastructure', desc: 'Hosting, authentication, sync, and database services' },
  { icon: Server, title: 'Platform reliability', desc: 'Performance optimization, bug fixes, and stability improvements' },
  { icon: Shield, title: 'Security & auth', desc: 'Supabase auth, RLS, encrypted sync, and secure updates' },
  { icon: Zap, title: 'UX & design', desc: 'Interface refinement, accessibility, and responsive design' },
];

const faqItems = [
  {
    q: 'Is a donation required to use BAU Suite?',
    a: 'No. BAU Suite is free to use. Donations are entirely optional and help fund continued development and infrastructure.',
  },
  {
    q: 'How will my contribution be used?',
    a: 'Contributions go directly toward hosting costs, development time, new tools, desktop app improvements, and platform infrastructure.',
  },
  {
    q: 'Is my payment secure?',
    a: 'All payments are processed through Stripe, the industry standard for secure online payments. BAU Suite never sees or stores your card details.',
  },
  {
    q: 'Can I support on a monthly basis?',
    a: 'Yes. Both one-time and recurring monthly options are available. You can cancel a recurring contribution at any time through Stripe.',
  },
  {
    q: 'Will more payment options be added?',
    a: 'Additional payment methods and support tiers may be added in the future based on community interest.',
  },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function DonatePage() {
  const router = useRouter();
  const { mode } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();
  const [donationMode, setDonationMode] = useState<DonationMode>('one_time');
  const [loading, setLoading] = useState<number | null>(null);
  const stripeReady = isStripeConfigured();

  const tiers = donationMode === 'one_time' ? ONE_TIME_TIERS : MONTHLY_TIERS;

  const handleDonate = async (tier: DonationTier) => {
    if (!stripeReady) return;

    setLoading(tier.amount);
    try {
      const res = await fetch('/api/donate/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: tier.amount, mode: donationMode }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fail silently — the button will re-enable
    } finally {
      setLoading(null);
    }
  };

  return (
    <div ref={scrollRef} className="min-h-screen bg-background">

      {/* ── Glass Navigation ─────────────────────────────────────── */}
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

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
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
            BAU Suite is independently built for the BAS field. Your support helps fund
            ongoing development, new tools, and the infrastructure that keeps the platform running.
          </p>

          <div
            className="mt-6"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
          >
            <Button size="lg" onClick={() => document.getElementById('support-options')?.scrollIntoView({ behavior: 'smooth' })} className="gap-2 hp-btn-glow">
              <Heart className="h-4 w-4" /> Support the Project
            </Button>
          </div>
        </div>

        <div className="hp-divider" />
      </section>

      {/* ── Why Support ──────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="hp-reveal mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why support</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Behind the platform
            </h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              BAU Suite is a serious engineering tool built from real field experience.
              Your support keeps it growing.
            </p>
          </div>

          <div className="hp-stagger grid gap-4 sm:grid-cols-3">
            {whySupport.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-6">
                <div className="hp-tool-icon rounded-xl bg-primary/8 p-2.5 border border-primary/10 w-fit mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── What Support Funds ───────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
          <div className="hp-reveal mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Impact</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              What your support helps fund
            </h2>
          </div>

          <div className="hp-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {impactItems.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-5 flex items-start gap-3">
                <div className="hp-tool-icon rounded-lg bg-primary/8 p-2 border border-primary/10 shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-0.5">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Support Options ──────────────────────────────────────── */}
      <section
        id="support-options"
        style={{ paddingTop: 'clamp(2.5rem, 6vw, 5rem)', paddingBottom: 'clamp(2.5rem, 6vw, 5rem)' }}
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="hp-reveal mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Support options</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Choose how you&apos;d like to contribute
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Every contribution, large or small, helps keep BAU Suite growing.
            </p>
          </div>

          {/* Mode toggle */}
          <div className="hp-reveal flex justify-center mb-8">
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
              <button
                onClick={() => setDonationMode('one_time')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  donationMode === 'one_time'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                One-Time
              </button>
              <button
                onClick={() => setDonationMode('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                  donationMode === 'monthly'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <RefreshCw className="h-3 w-3" /> Monthly
              </button>
            </div>
          </div>

          {/* Tier cards */}
          <div className="hp-reveal">
            <div className={`grid gap-4 ${tiers.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {tiers.map((tier) => (
                <div
                  key={tier.amount}
                  className={`hp-card-surface relative p-6 text-center transition-all ${
                    tier.featured
                      ? 'border-primary/40 ring-1 ring-primary/20'
                      : ''
                  }`}
                >
                  {tier.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wider">
                      Popular
                    </div>
                  )}

                  <p className="text-2xl font-bold tracking-tight mb-1">{tier.label}</p>
                  <p className="text-sm font-medium text-foreground mb-1">{tier.name}</p>
                  <p className="text-xs text-muted-foreground mb-5">{tier.description}</p>

                  {stripeReady ? (
                    <Button
                      className={`w-full ${tier.featured ? 'hp-btn-glow' : ''}`}
                      variant={tier.featured ? 'default' : 'outline'}
                      disabled={loading === tier.amount}
                      onClick={() => handleDonate(tier)}
                    >
                      {loading === tier.amount ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Redirecting…
                        </>
                      ) : (
                        'Support'
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled
                    >
                      Coming Soon
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stripe status notice */}
          {!stripeReady && (
            <div className="hp-reveal mt-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Secure payment processing via Stripe is being configured. Support options will be available soon.
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Trust & Security ─────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(2rem, 4vw, 3rem)', paddingBottom: 'clamp(2rem, 4vw, 3rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal text-center">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span>Secure checkout</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span>Powered by Stripe</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>PCI compliant</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground max-w-md mx-auto">
              All payments are processed securely through Stripe. BAU Suite never sees or stores your payment information.
            </p>
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="hp-reveal mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">FAQ</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>

          <div className="hp-reveal space-y-2">
            {faqItems.map(({ q, a }) => (
              <details key={q} className="group hp-card-surface overflow-hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5 -mt-1">
                  <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Closing CTA ──────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 6vw, 5rem)', paddingBottom: 'clamp(2.5rem, 6vw, 5rem)' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{ background: 'linear-gradient(135deg, var(--color-siemens-teal) 0%, var(--color-siemens-petrol) 100%)' }}
            >
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }} />

              <div className="relative px-6 sm:px-12 py-10 sm:py-14 text-center">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-3">
                  Help build the future of BAS fieldwork
                </h2>
                <p className="text-sm text-white/70 max-w-md mx-auto mb-6">
                  Every contribution helps deliver better tools, faster development,
                  and a more reliable platform for technicians and engineers in the field.
                </p>
                <Button
                  size="lg"
                  onClick={() => document.getElementById('support-options')?.scrollIntoView({ behavior: 'smooth' })}
                  className="gap-2 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
                  variant="outline"
                >
                  <Heart className="h-4 w-4" /> Support BAU Suite
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Footer ────────────────────────────────────────────────── */}
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
