'use client';

import { useCallback } from 'react';
import {
  Shield, Wrench, RefreshCw, CheckCircle2, Clock, Radio,
  ArrowUpCircle, Lock, Gauge, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';

/* ─── Status data structure ─────────────────────────────────────
 * Swap these values for live status when wiring to an API or
 * Supabase status table. Each card reads from this array.
 * ────────────────────────────────────────────────────────────── */
interface StatusEntry {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;  // Tailwind-compatible oklch color token
}

const STATUS_DATA: StatusEntry[] = [
  { label: 'Platform Status', value: 'Under Maintenance', icon: Radio, accent: 'oklch(0.75 0.15 65)' },
  { label: 'Impact', value: 'Limited Availability', icon: Gauge },
  { label: 'Stage', value: 'Validation in Progress', icon: CheckCircle2 },
  { label: 'Service Resumes', value: 'After Verification', icon: Clock },
];

/* ─── Shared animation helper ───────────────────────────────── */
const stagger = (i: number) => ({
  animation: `mt-fade-in-up 0.7s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.08}s both`,
});

/* ═══════════════════════════════════════════════════════════════
   MaintenancePage
   ═══════════════════════════════════════════════════════════════ */
export function MaintenancePage() {
  const handleRefresh = useCallback(() => window.location.reload(), []);

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[oklch(0.10_0.015_260)]"
      role="main"
      aria-label="Maintenance mode"
    >
      {/* ── Atmospheric layers ─────────────────────────────────── */}
      <AtmosphericBackground />

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-16 sm:px-8 sm:py-20">

        {/* ── 1. Hero ──────────────────────────────────────────── */}
        <header className="mt-animated mb-10 text-center" style={stagger(0)}>
          {/* Icon cluster */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <IconBox icon={Shield} delay={0.15} />
            <div className="text-[oklch(0.35_0.01_260)] select-none">/</div>
            <IconBox icon={Wrench} delay={0.25} />
          </div>

          <p className="mb-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-[oklch(0.65_0.12_185)] uppercase">
            BAU Suite
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[oklch(0.93_0.005_240)] sm:text-4xl">
            Scheduled Maintenance
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[oklch(0.55_0.01_240)]">
            We&apos;re performing planned upgrades to strengthen platform reliability, security,
            and performance. All data is safe &mdash; service will resume after verification completes.
          </p>

          {/* Live status indicator */}
          <div className="mt-5 flex items-center justify-center gap-2.5">
            <span
              className="mt-animated inline-block h-2 w-2 rounded-full bg-[oklch(0.75_0.15_65)]"
              style={{ animation: 'mt-status-pulse 2s ease-in-out infinite' }}
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-[oklch(0.75_0.15_65)]" role="status">
              Maintenance in progress
            </span>
          </div>
        </header>

        {/* ── Divider ──────────────────────────────────────────── */}
        <div
          className="mt-animated mx-auto mb-10 h-[1px] w-full max-w-sm"
          style={{
            background: 'linear-gradient(to right, transparent, oklch(0.65 0.12 185 / 25%), transparent)',
            ...stagger(1),
          }}
        />

        {/* ── 2. Status cards ──────────────────────────────────── */}
        <section aria-label="System status" className="mb-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUS_DATA.map((item, i) => (
              <StatusCard key={item.label} entry={item} index={i} />
            ))}
          </div>
        </section>

        {/* ── 3. Activity bars (visual heartbeat) ──────────────── */}
        <div className="mt-animated mb-10 space-y-2 px-2" style={stagger(6)}>
          <ActivityBar color="oklch(0.65 0.12 185)" duration="3s" delay="0s" />
          <ActivityBar color="oklch(0.55 0.10 210)" duration="2.4s" delay="0.8s" />
          <ActivityBar color="oklch(0.60 0.08 170)" duration="3.6s" delay="1.6s" />
        </div>

        {/* ── 4. Trust strip ───────────────────────────────────── */}
        <section aria-label="Service assurances" className="mt-animated mb-10" style={stagger(7)}>
          <div
            className="rounded-xl border border-[oklch(0.65_0.12_185_/_10%)] px-5 py-4 sm:px-7 sm:py-5"
            style={{
              background: 'oklch(0.13 0.01 260 / 50%)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <TrustItem
                icon={ArrowUpCircle}
                title="Platform Upgrades"
                text="Enhancements to improve stability and feature delivery."
              />
              <TrustItem
                icon={Lock}
                title="Security Validation"
                text="Security policies and access controls are being verified."
              />
              <TrustItem
                icon={Gauge}
                title="Performance Checks"
                text="System performance is validated before service resumes."
              />
            </div>
          </div>
        </section>

        {/* ── 5. Action area ───────────────────────────────────── */}
        <div className="mt-animated mb-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center" style={stagger(8)}>
          <Button
            onClick={handleRefresh}
            className="gap-2 rounded-lg border border-[oklch(0.65_0.12_185_/_30%)] bg-[oklch(0.65_0.12_185_/_12%)] px-6 py-2.5 text-sm font-medium text-[oklch(0.65_0.12_185)] hover:bg-[oklch(0.65_0.12_185_/_20%)] transition-colors"
            aria-label="Refresh page to check if maintenance is complete"
          >
            <RefreshCw className="h-4 w-4" />
            Check Again
          </Button>
          <a
            href="https://github.com/calebohara/Portable-BAS-Toolkit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-[oklch(0.5_0.01_240)] hover:text-[oklch(0.65_0.01_240)] transition-colors"
            aria-label="View project status on GitHub (opens in new tab)"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Status &amp; Updates
          </a>
        </div>

        {/* ── 6. Footer ────────────────────────────────────────── */}
        <footer className="mt-animated text-center" style={stagger(9)}>
          <div className="mx-auto h-[1px] w-24 bg-[oklch(0.25_0.01_260)] mb-5" />
          <p className="font-mono text-[10px] tracking-[0.15em] text-[oklch(0.35_0.01_260)] uppercase">
            BAU Suite &middot; v{APP_VERSION}
          </p>
          <p className="mt-1 text-[10px] text-[oklch(0.30_0.01_260)]">
            &copy; {new Date().getFullYear()} BAU Suite. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

/** Glowing icon box used in the hero cluster */
function IconBox({ icon: Icon, delay }: { icon: React.ComponentType<{ className?: string }>; delay: number }) {
  return (
    <div
      className="mt-animated flex h-14 w-14 items-center justify-center rounded-xl border border-[oklch(0.65_0.12_185_/_20%)] bg-[oklch(0.65_0.12_185_/_8%)] sm:h-16 sm:w-16"
      style={{
        boxShadow: '0 0 24px oklch(0.65 0.12 185 / 8%)',
        animation: `mt-fade-in-up 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s both`,
      }}
    >
      <Icon className="h-7 w-7 text-[oklch(0.65_0.12_185)] sm:h-8 sm:w-8" />
    </div>
  );
}

/** Individual status card */
function StatusCard({ entry, index }: { entry: StatusEntry; index: number }) {
  const { label, value, icon: Icon, accent } = entry;
  const valueColor = accent ?? 'oklch(0.75 0.005 240)';

  return (
    <div
      className="mt-animated rounded-xl border border-[oklch(0.25_0.01_260)] p-4"
      style={{
        background: 'oklch(0.13 0.01 260 / 50%)',
        backdropFilter: 'blur(8px)',
        ...stagger(index + 2),
      }}
    >
      <Icon className="mb-2 h-4 w-4 text-[oklch(0.45_0.01_260)]" aria-hidden="true" />
      <p className="mb-0.5 text-[10px] font-semibold tracking-[0.08em] text-[oklch(0.45_0.01_260)] uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  );
}

/** Trust / assurance row item */
function TrustItem({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.65_0.12_185_/_8%)]">
        <Icon className="h-4 w-4 text-[oklch(0.65_0.12_185)]" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold text-[oklch(0.75_0.005_240)]">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[oklch(0.45_0.01_240)]">{text}</p>
      </div>
    </div>
  );
}

/** Animated data-flow bar (visual heartbeat indicator) */
function ActivityBar({ color, duration, delay }: { color: string; duration: string; delay: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: color, opacity: 0.5 }}
        aria-hidden="true"
      />
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[oklch(0.18_0.01_260)]">
        <div
          className="mt-animated h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            animation: `mt-data-flow ${duration} ease-in-out infinite ${delay}`,
          }}
        />
      </div>
    </div>
  );
}

/** Full-screen atmospheric background (grid + scan beam + glow orbs) */
function AtmosphericBackground() {
  return (
    <>
      {/* Grid */}
      <div
        className="mt-animated pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(oklch(0.65 0.12 185 / 3%) 1px, transparent 1px), linear-gradient(90deg, oklch(0.65 0.12 185 / 3%) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          animation: 'mt-grid-drift 60s ease-in-out infinite',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)',
        }}
      />

      {/* Glow orbs */}
      <div
        className="mt-animated pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(circle, oklch(0.65 0.12 185 / 10%) 0%, transparent 70%)',
          animation: 'mt-orb-drift-1 20s ease-in-out infinite, mt-pulse-glow 6s ease-in-out infinite',
        }}
      />
      <div
        className="mt-animated pointer-events-none absolute -bottom-48 -right-48 h-[600px] w-[600px] rounded-full"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(circle, oklch(0.55 0.10 210 / 8%) 0%, transparent 70%)',
          animation: 'mt-orb-drift-2 25s ease-in-out infinite, mt-pulse-glow 8s ease-in-out infinite',
        }}
      />
      <div
        className="mt-animated pointer-events-none absolute left-1/2 top-1/4 h-[350px] w-[350px] -translate-x-1/2 rounded-full"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(circle, oklch(0.60 0.08 170 / 6%) 0%, transparent 70%)',
          animation: 'mt-pulse-glow 4s ease-in-out infinite 2s',
        }}
      />
    </>
  );
}
