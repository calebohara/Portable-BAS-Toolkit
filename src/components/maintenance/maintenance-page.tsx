'use client';

import { Shield, Wrench, Activity } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export function MaintenancePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[oklch(0.10_0.015_260)]">
      {/* ── Animated grid background ── */}
      <div
        className="mt-animated pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(oklch(0.65 0.12 185 / 4%) 1px, transparent 1px), linear-gradient(90deg, oklch(0.65 0.12 185 / 4%) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'mt-grid-drift 60s ease-in-out infinite',
        }}
      />

      {/* ── Scanning beam ── */}
      <div
        className="mt-animated pointer-events-none absolute left-0 right-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, transparent, oklch(0.65 0.12 185 / 60%), oklch(0.65 0.12 185 / 80%), oklch(0.65 0.12 185 / 60%), transparent)',
          animation: 'mt-scan-line 8s linear infinite',
          position: 'absolute',
        }}
      />

      {/* ── Glow orbs ── */}
      <div
        className="mt-animated pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, oklch(0.65 0.12 185 / 12%) 0%, transparent 70%)',
          animation: 'mt-orb-drift-1 20s ease-in-out infinite, mt-pulse-glow 6s ease-in-out infinite',
        }}
      />
      <div
        className="mt-animated pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, oklch(0.55 0.10 210 / 10%) 0%, transparent 70%)',
          animation: 'mt-orb-drift-2 25s ease-in-out infinite, mt-pulse-glow 8s ease-in-out infinite',
        }}
      />
      <div
        className="mt-animated pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, oklch(0.60 0.08 170 / 8%) 0%, transparent 70%)',
          animation: 'mt-pulse-glow 4s ease-in-out infinite 2s',
        }}
      />

      {/* ── Main glassmorphism card ── */}
      <div
        className="mt-animated relative z-10 mx-4 w-full max-w-lg rounded-2xl border border-[oklch(0.65_0.12_185_/_15%)] p-8 sm:p-10"
        style={{
          background: 'oklch(0.14 0.012 260 / 60%)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          boxShadow:
            '0 0 80px oklch(0.65 0.12 185 / 6%), 0 8px 32px oklch(0 0 0 / 40%), inset 0 1px 0 oklch(1 0 0 / 5%)',
          animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Shimmer top edge */}
        <div
          className="mt-animated absolute left-0 right-0 top-0 h-[1px] rounded-t-2xl"
          style={{
            background:
              'linear-gradient(90deg, transparent, oklch(0.65 0.12 185 / 40%), oklch(0.75 0.10 185 / 60%), oklch(0.65 0.12 185 / 40%), transparent)',
            backgroundSize: '200% 100%',
            animation: 'mt-shimmer 3s linear infinite',
          }}
        />

        {/* ── Hero icon cluster ── */}
        <div
          className="mt-animated mb-6 flex items-center justify-center gap-3"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both',
          }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[oklch(0.65_0.12_185_/_20%)] bg-[oklch(0.65_0.12_185_/_8%)]">
            <Shield className="h-7 w-7 text-[oklch(0.65_0.12_185)]" />
          </div>
          <div className="text-[oklch(0.4_0.01_260)]">/</div>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[oklch(0.65_0.12_185_/_20%)] bg-[oklch(0.65_0.12_185_/_8%)]">
            <Wrench className="h-7 w-7 text-[oklch(0.65_0.12_185)]" />
          </div>
        </div>

        {/* ── Heading ── */}
        <div
          className="mt-animated mb-2 text-center"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both',
          }}
        >
          <h1 className="font-sans text-2xl font-bold tracking-tight text-[oklch(0.93_0.005_240)] sm:text-3xl">
            Scheduled Maintenance
          </h1>
          <p className="mt-1 font-mono text-xs tracking-widest text-[oklch(0.65_0.12_185)] uppercase">
            BAU Suite
          </p>
        </div>

        {/* ── Divider ── */}
        <div
          className="mt-animated my-6 h-[1px]"
          style={{
            background:
              'linear-gradient(to right, transparent, oklch(0.65 0.12 185 / 25%), transparent)',
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both',
          }}
        />

        {/* ── Status indicator ── */}
        <div
          className="mt-animated mb-5 flex items-center justify-center gap-2.5"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both',
          }}
        >
          <span
            className="mt-animated inline-block h-2.5 w-2.5 rounded-full bg-[oklch(0.65_0.12_185)]"
            style={{ animation: 'mt-status-pulse 2s ease-in-out infinite' }}
          />
          <span className="text-sm font-medium text-[oklch(0.65_0.12_185)]">
            Systems undergoing maintenance
          </span>
        </div>

        {/* ── Activity bars ── */}
        <div
          className="mt-animated mb-6 space-y-2"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both',
          }}
        >
          <div className="flex items-center gap-2.5">
            <Activity className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.01_260)]" />
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[oklch(0.2_0.01_260)]">
              <div
                className="mt-animated h-full rounded-full bg-[oklch(0.65_0.12_185)]"
                style={{ animation: 'mt-data-flow 3s ease-in-out infinite' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Activity className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.01_260)]" />
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[oklch(0.2_0.01_260)]">
              <div
                className="mt-animated h-full rounded-full bg-[oklch(0.55_0.10_210)]"
                style={{ animation: 'mt-data-flow 2.4s ease-in-out infinite 0.8s' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Activity className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.01_260)]" />
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[oklch(0.2_0.01_260)]">
              <div
                className="mt-animated h-full rounded-full bg-[oklch(0.60_0.08_170)]"
                style={{ animation: 'mt-data-flow 3.6s ease-in-out infinite 1.6s' }}
              />
            </div>
          </div>
        </div>

        {/* ── Message ── */}
        <p
          className="mt-animated mb-6 text-center text-sm leading-relaxed text-[oklch(0.6_0.01_240)]"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both',
          }}
        >
          We&apos;re performing scheduled upgrades to improve reliability and performance.
          <br />
          Service will resume shortly.
        </p>

        {/* ── Footer ── */}
        <div
          className="mt-animated border-t border-[oklch(0.25_0.01_260)] pt-4 text-center"
          style={{
            animation: 'mt-fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.7s both',
          }}
        >
          <p className="font-mono text-[10px] tracking-wider text-[oklch(0.4_0.01_260)] uppercase">
            BAU Suite v{APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
