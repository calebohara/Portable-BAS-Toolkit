'use client';

import { useRouter } from 'next/navigation';
import {
  Monitor, Wifi, WifiOff, TerminalSquare, Activity,
  Shield, ArrowLeft, ArrowRight, Clock,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useDeviceClass } from '@/hooks/use-device-class';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

// ─── Desktop Benefits ────────────────────────────────────────────────────────

const desktopBenefits = [
  {
    icon: Activity,
    title: 'Native ICMP ping',
    desc: 'True ICMP reachability testing without browser restrictions. Accurate latency and packet loss for real BAS diagnostics.',
  },
  {
    icon: Wifi,
    title: 'Full network access',
    desc: 'Connect to BAS controllers on VPN, internal subnets, and restricted networks that browsers cannot reach.',
  },
  {
    icon: TerminalSquare,
    title: 'Desktop-grade terminal',
    desc: 'Full terminal capabilities for controller access, BACnet commands, and Modbus diagnostics with native performance.',
  },
  {
    icon: WifiOff,
    title: 'Offline-first, always',
    desc: 'All data stored locally via IndexedDB. The desktop app opens instantly — no server, no loading, no dependencies.',
  },
  {
    icon: Monitor,
    title: 'Focused workspace',
    desc: 'Dedicated window with full-screen project sessions. No browser tabs, no distractions, no accidental tab closures.',
  },
  {
    icon: Shield,
    title: 'Secure and private',
    desc: 'Your data stays on your machine. No cloud dependency required. Signed builds with automatic updates.',
  },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function DesktopAppPage() {
  const router = useRouter();
  const { mode } = useAuth();
  const { isTauriRuntime } = useDeviceClass();
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
        {/* Gradient orb */}
        <div
          className="hp-orb absolute -top-32 -left-32 w-96 h-96 opacity-20 dark:opacity-15"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-petrol) 0%, transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center" style={{ paddingTop: 'clamp(3rem, 8vw, 6rem)', paddingBottom: 'clamp(2rem, 4vw, 3rem)' }}>
          <div
            className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 border border-primary/15 mb-6"
            style={{ animation: 'hp-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.1s', opacity: 0 }}
          >
            <Monitor className="h-7 w-7 text-primary" />
          </div>

          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.2s', opacity: 0, lineHeight: '1.1' }}
          >
            Desktop App
          </h1>

          <p
            className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto"
            style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.35s', opacity: 0 }}
          >
            A dedicated desktop experience for BAS field and engineering workflows.
            Full network access, native diagnostics, and a focused workspace — built with Tauri.
          </p>

          {isTauriRuntime && (
            <div
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary"
              style={{ animation: 'hp-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
            >
              <Monitor className="h-3.5 w-3.5" />
              You&apos;re using the desktop app
            </div>
          )}
        </div>

        <div className="hp-divider" />
      </section>

      {/* ── Why Desktop ───────────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="hp-reveal mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why desktop</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Built for serious fieldwork
            </h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              The desktop app removes browser limitations and gives you a purpose-built environment
              for BAS diagnostics, documentation, and project management.
            </p>
          </div>

          <div className="hp-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {desktopBenefits.map(({ icon: Icon, title, desc }) => (
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

      {/* ── Platform Availability ─────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(2.5rem, 5vw, 4rem)', paddingBottom: 'clamp(2.5rem, 5vw, 4rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Platform</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Available for Windows</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              The desktop app is being built for Windows first.
              Additional platform support may follow based on demand.
            </p>
          </div>

          <div className="hp-reveal flex justify-center">
            <div className="hp-card-surface px-8 py-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                {/* Windows icon inline */}
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" fill="currentColor">
                  <path d="M3 12V6.75l7-1.02V12H3zm8-1.25V5.5l10-1.5V12H11V10.75zM3 13h7v6.27l-7-1.02V13zm8 0h10v6.5l-10-1.5V13z" />
                </svg>
                <span className="text-base font-semibold">Windows</span>
              </div>
              <p className="text-xs text-muted-foreground">Windows 10 / 11 — x64</p>
            </div>
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Coming Soon Card ──────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(2.5rem, 6vw, 5rem)', paddingBottom: 'clamp(2.5rem, 6vw, 5rem)' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div className="hp-card-surface relative overflow-hidden p-8 sm:p-10 text-center">
              {/* Gradient accent bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1 opacity-60"
                style={{ background: 'linear-gradient(to right, var(--color-siemens-teal), var(--color-siemens-petrol))' }}
              />

              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-primary/10 border border-primary/15 mb-5">
                <Clock className="h-6 w-6 text-primary" />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
                Coming soon
              </h2>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-6">
                We&apos;re preparing the desktop distribution experience and finalizing the Windows installer.
                The download will be available here once the build pipeline is ready.
              </p>

              {/* Disabled future CTA — clearly inactive */}
              <Button
                size="lg"
                disabled
                className="gap-2 opacity-50 cursor-not-allowed"
              >
                <Monitor className="h-4 w-4" /> Download for Windows
              </Button>

              <p className="mt-4 text-xs text-muted-foreground">
                Signed installer with automatic updates
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Back ──────────────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(2rem, 4vw, 3rem)', paddingBottom: 'clamp(2rem, 4vw, 3rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="hp-reveal">
            <p className="text-sm text-muted-foreground mb-4">
              In the meantime, BAU Suite works great in your browser as a PWA.
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
              <button onClick={() => router.push('/settings')} className="hover:text-foreground transition-colors">Settings</button>
              <button onClick={() => router.push('/donate')} className="hover:text-foreground transition-colors">Donate</button>
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
