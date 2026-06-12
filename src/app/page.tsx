'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, StickyNote, Database, ArrowRight, UserPlus,
  Zap, Wifi, Heart, Code, Wrench, WifiOff,
  Download, Cloud, Users, Check, Shield, Star, Activity, TerminalSquare,
} from 'lucide-react';
import { isPaywallEnabled } from '@/lib/paywall';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PRO_TIER, TEAM_TIER, TRIAL_DAYS, yearlySavingsPct } from '@/lib/pricing';
import { toolGroups, fieldHighlights, toolCount } from './landing-content';
import { CursorGlow } from './cursor-glow';

// ─── Page Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { mode, user, loading: authLoading } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [reviews, setReviews] = useState<{ display_name: string; rating: number; comment: string; created_at: string }[]>([]);

  useEffect(() => {
    if (isTauri && !authLoading && !isAuthed) {
      window.location.replace('/login');
    }
  }, [isTauri, authLoading, isAuthed]);

  // Fetch published reviews from Supabase
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    sb.from('user_reviews')
      .select('display_name, rating, comment, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (data?.length) setReviews(data);
      });
  }, []);

  const goApp = () => router.push('/dashboard');
  const goSignup = () => isTauri ? window.location.assign('/login?tab=signup') : router.push('/login?tab=signup');
  const goLogin = () => isTauri ? window.location.assign('/login') : router.push('/login');
  const scrollToTools = () => document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
  const scrollToPricing = () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });

  // Short-circuit on Tauri: this landing page is the web marketing surface only.
  // Without this guard the desktop app paints the full DOM, runs every
  // animation, and only then redirects to /login. Skip all of it.
  if (isTauri) {
    return null;
  }

  return (
    <div ref={scrollRef} className="min-h-screen bg-background">

      {/* Cursor-following glow. Mounted first so every positioned section
          below paints above it — cards occlude it, text floats over it. */}
      <CursorGlow />

      {/* ── Glass Navigation ─────────────────────────────────────────── */}
      <header className="hp-glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
              <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-8 w-8" />
            </div>
            <span className="text-sm font-semibold tracking-tight">BAU Suite</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <>
                <span className="text-xs text-muted-foreground hidden sm:inline mr-1 max-w-32 truncate">{user?.email}</span>
                <Button size="sm" onClick={goApp} className="gap-1.5 hp-btn-glow">
                  Open App <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={goLogin} className="text-muted-foreground hidden sm:inline-flex">
                  Sign In
                </Button>
                <Button size="sm" onClick={goSignup} className="gap-1.5 hp-btn-glow">
                  Open BAU Suite <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* Calm hero: one soft orb (not two animated), no grid background, and a
          single quiet product glimpse rather than three competing cards. */}
      <section className="relative overflow-hidden">
        <div
          className="hp-orb absolute -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-80 opacity-25 dark:opacity-15 pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-teal) 0%, transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
            style={{ animation: 'hp-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.1s', opacity: 0 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Portable BAS field toolkit</span>
            <span className="text-muted-foreground/50" aria-hidden="true">·</span>
            <span className="font-mono text-[11px] tabular-nums">v{APP_VERSION}</span>
          </div>

          <h1
            className="mx-auto max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance leading-[1.05]"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.2s', opacity: 0 }}
          >
            The offline-first toolkit for <span className="text-primary">BAS field techs</span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed text-balance"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.35s', opacity: 0 }}
          >
            BAU Suite puts your projects, controller diagnostics, terminal access, and
            documentation in one portable workspace — on site or in the office, with or without Wi-Fi.
          </p>

          <div
            className="mt-8 flex flex-wrap justify-center gap-3"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
          >
            {isAuthed ? (
              <Button size="lg" onClick={goApp} className="gap-2 hp-btn-glow">
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={goSignup} className="gap-2 hp-btn-glow">
                Open BAU Suite <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={scrollToTools} className="gap-1.5 text-muted-foreground hover:text-foreground">
              See what&apos;s inside
            </Button>
          </div>

          {/* Compact stats row — informative, not loud */}
          <div
            className="mt-10 flex flex-wrap justify-center gap-8 sm:gap-12"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.65s', opacity: 0 }}
          >
            {[
              { value: String(toolCount), label: 'Integrated tools' },
              { value: '100%', label: 'Offline-capable' },
              { value: 'Free', label: 'To get started' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Single quiet product glimpse */}
          <div
            className="mx-auto mt-12 max-w-md text-left hp-hero-card p-4"
            style={{ animation: 'hp-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Project</span>
              <span className="rounded-full bg-field-success/15 text-field-success text-[10px] font-bold px-2 py-0.5">Active</span>
            </div>
            <p className="text-sm font-semibold">AHU Level 3 — Block A</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">44OP-349942 · Updated today</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground border-t border-border/50 pt-2">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 8 files</span>
              <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> 4 notes</span>
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> 14 devices</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-field-success" /> 13 online
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────────────────────── */}
      {/* Hidden for unauthed visitors when no reviews exist — an empty social
          proof section signals "no one uses this". Authed users still see the
          soft prompt to seed the first review. */}
      {(reviews.length > 0 || isAuthed) && (
      <section className="relative border-t border-border/50 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          {reviews.length > 0 ? (
            <>
              <p className="hp-reveal text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-10">
                What field engineers are saying
              </p>
              <div key={reviews.length} className="hp-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reviews.map((r) => (
                  <div key={r.created_at} className="hp-reveal hp-card-surface p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-4 w-4 ${s <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/20'}`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">{r.comment}</p>
                    <div className="border-t border-border/50 pt-3">
                      <p className="text-xs font-semibold">{r.display_name || 'Anonymous'}</p>
                    </div>
                  </div>
                ))}
              </div>
              {isAuthed && (
                <div className="text-center mt-8">
                  <Button
                    variant="outline"
                    className="hp-reveal gap-2"
                    onClick={() => router.push('/dashboard')}
                  >
                    <Star className="h-4 w-4" />
                    Leave a Review
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <div className="hp-reveal mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Star className="h-6 w-6 text-primary" />
              </div>
              <p className="hp-reveal text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Used BAU Suite on a job? Share what worked — and what didn&apos;t.
              </p>
              {isAuthed && (
                <Button
                  variant="outline"
                  className="hp-reveal gap-2"
                  onClick={() => router.push('/dashboard')}
                >
                  <Star className="h-4 w-4" />
                  Leave a Review
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
      )}

      {/* ── What's inside / the tools ────────────────────────────────── */}
      {/* Merges the old Workflow + Tool Ecosystem + Platform sections into one
          information-rich tool catalogue. The tool list is the substance. */}
      <section id="tools" className="relative bg-muted/30 dark:bg-muted/10 py-16 sm:py-20 scroll-mt-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="hp-reveal max-w-2xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What&apos;s inside</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Every tool the job needs, built in</h2>
            <p className="mt-3 text-base text-muted-foreground leading-relaxed">
              BAU Suite replaces the stack of spreadsheets, file shares, note apps, terminal emulators,
              and IP scanners techs juggle on a job — with one connected workspace. No tab-switching, no extra software.
            </p>
          </div>

          <div className="space-y-8">
            {toolGroups.map((group) => (
              <div key={group.title} className="hp-reveal">
                <div className="mb-3">
                  <h3 className="text-base font-bold">{group.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{group.desc}</p>
                </div>
                <div className="hp-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map(({ icon: Icon, name, desc }) => (
                    <div key={name} className="hp-reveal hp-card-surface p-4 flex items-start gap-3">
                      <div className={`rounded-lg p-2 border shrink-0 mt-0.5 ${group.accent.icon} ${group.accent.bg} ${group.accent.border}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold">{name}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for the field (differentiators strip) ──────────────── */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="hp-reveal max-w-xl mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Built for the field</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Designed around real site constraints</h2>
          </div>
          <div className="hp-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fieldHighlights.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-5">
                <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/15 w-fit mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Desktop App ──────────────────────────────────────────────── */}
      <section className="relative bg-muted/30 dark:bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div
              className="relative overflow-hidden rounded-2xl border border-primary/15"
              style={{ background: 'var(--gradient-brand)' }}
            >
              <div className="relative px-6 sm:px-12 py-10 sm:py-12">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm mb-5">
                      <Download className="h-3.5 w-3.5" />
                      Windows desktop app
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      Full network diagnostics<br />on Windows
                    </h2>
                    <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed max-w-lg">
                      The native desktop app adds true ICMP ping, VPN and internal subnet access,
                      and a focused workspace without browser limitations.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => window.open('/api/download?format=msi', '_blank', 'noopener,noreferrer')}
                      className="mt-6 gap-2 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
                      variant="outline"
                    >
                      <Download className="h-4 w-4" /> Download for Windows <ArrowRight className="h-4 w-4" />
                    </Button>
                    {/* Acknowledge Mac/Linux users so they don't bounce on a Windows-only CTA */}
                    <p className="mt-3 text-xs text-white/60">
                      Mac &amp; Linux users: the full web app works in any modern browser.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: Activity, title: 'Native ICMP ping', desc: 'True reachability — not just HTTP' },
                      { icon: Wifi, title: 'Full network access', desc: 'VPN & internal subnets' },
                      { icon: TerminalSquare, title: 'Desktop terminal', desc: 'Native performance' },
                      { icon: Shield, title: 'Signed & auto-updating', desc: 'Trusted installer' },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm p-4">
                        <Icon className="h-5 w-5 text-white/80 mb-2" />
                        <p className="text-sm font-semibold text-white">{title}</p>
                        <p className="text-xs text-white/60">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing / Support ────────────────────────────────────────── */}
      <section id="pricing" className="relative py-16 sm:py-20 scroll-mt-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              {/* Left: narrative */}
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                  {isPaywallEnabled() ? 'Plans & pricing' : 'Support the project'}
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-4">
                  {isPaywallEnabled() ? (
                    <>Free to use.<br />Pro to sync.</>
                  ) : (
                    <>Independently built.<br />Community supported.</>
                  )}
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed max-w-lg mb-5">
                  {isPaywallEnabled()
                    ? 'All local features are free, forever. Upgrade to Pro for cloud sync and backup, or Team for real-time collaboration.'
                    : 'BAU Suite is designed and maintained by one developer for BAS technicians and controls engineers. Your support funds new tools, infrastructure, and continued development.'
                  }
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <span>Active development</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    <span>{toolCount} field tools</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-primary" />
                    <span>{isPaywallEnabled() ? 'Free local-first' : 'Free to use'}</span>
                  </div>
                </div>
              </div>

              {/* Right: pricing tiers / support card */}
              <div className="lg:col-span-2">
                {isPaywallEnabled() ? (
                  <div className="space-y-4">
                    {/* Free tier */}
                    <div className="hp-card-surface p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-bold">Free</p>
                          <p className="text-xs text-muted-foreground">All local features, forever</p>
                        </div>
                        <p className="text-xl font-bold">$0</p>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> {toolCount} tools</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Offline-first</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Desktop app</span>
                      </div>
                    </div>

                    {/* Pro tier */}
                    <div className="hp-card-surface p-5 border border-primary/30 relative overflow-visible">
                      <div className="absolute -top-2.5 right-4 z-10 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">POPULAR</div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Cloud className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-bold">Pro</p>
                            <p className="text-xs text-muted-foreground">Sync across devices</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">${PRO_TIER.monthly}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                          <p className="text-[10px] text-muted-foreground">or ${PRO_TIER.yearly}/yr — save {yearlySavingsPct(PRO_TIER)}%</p>
                          <p className="text-[10px] text-primary font-medium">{TRIAL_DAYS}-day free trial on monthly</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {PRO_TIER.highlights.map((h) => (
                          <span key={h} className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> {h}</span>
                        ))}
                      </div>
                    </div>

                    {/* Team tier */}
                    <div className="hp-card-surface p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-field-info" />
                          <div>
                            <p className="text-sm font-bold">Team</p>
                            <p className="text-xs text-muted-foreground">Collaborate in real time</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">${TEAM_TIER.monthly}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                          <p className="text-[10px] text-muted-foreground">or ${TEAM_TIER.yearly}/yr — save {yearlySavingsPct(TEAM_TIER)}%</p>
                          <p className="text-[10px] text-primary font-medium">{TRIAL_DAYS}-day free trial on monthly</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {TEAM_TIER.highlights.map((h) => (
                          <span key={h} className="flex items-center gap-1"><Check className="h-3 w-3 text-field-info" /> {h}</span>
                        ))}
                      </div>
                    </div>

                    {/* Authed: manage subscription. Unauthed: signup tab so the CTA
                        matches its label — the trial itself starts at Stripe
                        checkout (in settings), not at signup. */}
                    <Button size="lg" onClick={user ? () => router.push('/settings') : goSignup} className="w-full gap-2 hp-btn-glow">
                      {user ? (
                        <><Zap className="h-4 w-4" /> Manage Subscription</>
                      ) : (
                        <><UserPlus className="h-4 w-4" /> Get Started Free</>
                      )}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Cancel anytime — your local data stays on your device.
                    </p>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Prefer to just support the project?{' '}
                      <button
                        onClick={() => router.push('/donate')}
                        className="underline underline-offset-2 hover:text-foreground transition-colors"
                      >
                        Donate
                      </button>
                      {' '}— no account needed.
                    </p>
                  </div>
                ) : (
                  <div className="hp-card-surface p-6 sm:p-8 text-center">
                    <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-primary/10 border border-primary/15 mb-4">
                      <Heart className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold tracking-tight mb-2">Back the project</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                      Help keep BAU Suite growing. Every contribution funds development, hosting, and new features.
                    </p>
                    <Button size="lg" onClick={() => router.push('/donate')} className="w-full gap-2 hp-btn-glow">
                      <Heart className="h-4 w-4" /> Support BAU Suite
                    </Button>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      One-time and monthly options available
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      {/* One calm, low-pressure close — informative, not a hard sell. */}
      <section className="relative border-t border-border/50 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          {isAuthed ? (
            <>
              <h2 className="hp-reveal text-2xl sm:text-3xl font-bold tracking-tight">Welcome back</h2>
              <p className="hp-reveal mt-3 text-sm text-muted-foreground max-w-md mx-auto">
                Your workspace is ready. Data stays on your device — cloud sync is there when you need it.
              </p>
              <Button size="lg" onClick={goApp} className="hp-reveal mt-6 gap-2 hp-btn-glow">
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="hp-reveal text-2xl sm:text-3xl font-bold tracking-tight">Take a look around</h2>
              <p className="hp-reveal mt-3 text-sm text-muted-foreground max-w-md mx-auto">
                Open BAU Suite and start with the local tools — they&apos;re free, no credit card required.
                Add cloud sync or team collaboration later, only if you need them.
              </p>
              <div className="hp-reveal mt-6 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={goSignup} className="gap-2 hp-btn-glow">
                  Open BAU Suite <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="ghost" onClick={goLogin} className="gap-1.5 text-muted-foreground hover:text-foreground">
                  Sign In
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="relative border-t border-border/50 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-5 w-5 items-center justify-center rounded overflow-hidden">
                  <img src="/icons/icon-small.svg" alt="" className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold">BAU Suite</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The portable, offline-first workspace for BAS technicians and controls engineers.
              </p>
              <p className="text-xs text-muted-foreground mt-3">v{APP_VERSION}</p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Product</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <button onClick={() => router.push('/dashboard')} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Dashboard</button>
                <button onClick={() => router.push('/projects')} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Projects</button>
                <button onClick={() => router.push('/help')} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Help & Guides</button>
                {isPaywallEnabled() && (
                  <button onClick={scrollToPricing} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Pricing</button>
                )}
              </div>
            </div>

            {/* Account links */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Account</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                {!isAuthed && (
                  <button onClick={goSignup} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Create Account</button>
                )}
                {!isAuthed && (
                  <button onClick={goLogin} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Sign In</button>
                )}
                {isAuthed && (
                  <button onClick={goApp} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Go to Dashboard</button>
                )}
                <button onClick={() => router.push('/settings')} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Settings</button>
                <button onClick={() => router.push('/donate')} className="hp-link-btn block py-1.5 -my-1.5 hover:text-foreground transition-colors">Donate</button>
              </div>
            </div>
          </div>

          <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Built for the field.</span>
            <span>
              Designed &amp; developed by{' '}
              <a
                href="https://www.calebblaze.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
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
