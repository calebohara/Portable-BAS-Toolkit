'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban, FileText, StickyNote, ClipboardList, Share2,
  Network, Database, Activity, Globe, TerminalSquare, Calculator,
  Wrench, WifiOff, ArrowRight, UserPlus, MessageSquare,
  Zap, Layers, ChevronRight, Wifi, Heart, Code,
  Gauge, BookOpen, Download, Cloud, Users, Check, Thermometer, Shield,
} from 'lucide-react';
import { isPaywallEnabled } from '@/lib/paywall';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

// ─── Data ────────────────────────────────────────────────────────────────────

const toolGroups = [
  {
    title: 'Manage & Document',
    accent: { icon: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/15' },
    desc: 'Keep every project organized and every finding documented.',
    items: [
      { icon: FolderKanban, name: 'Projects', desc: 'All your BAS project data in one place — contacts, tags, status, and a full activity history' },
      { icon: ClipboardList, name: 'Daily Reports', desc: 'Structured field reports with issue tracking and one-click Teams / Outlook / PDF export' },
      { icon: FileText, name: 'Documents', desc: 'Upload panel databases, wiring diagrams, and controller backups — attached directly to the project' },
      { icon: StickyNote, name: 'Field Notes', desc: 'Capture punch items, fixes, and observations on the fly — categorized and searchable across projects' },
      { icon: Share2, name: 'Share & Export', desc: 'Send to Teams, Outlook, or PDF with audience presets — no reformatting required' },
    ],
  },
  {
    title: 'Plan & Diagnose',
    accent: { icon: 'text-field-info', bg: 'bg-field-info/10', border: 'border-field-info/15' },
    desc: 'The full diagnostic toolkit for BAS commissioning and service.',
    items: [
      { icon: Network, name: 'IP Plan', desc: 'Never lose track of a device. Full IP addressing with VLAN, subnet, and duplicate detection' },
      { icon: Database, name: 'Device List', desc: 'Track every controller — BACnet instance, IP, MAC, firmware version, and physical location' },
      { icon: Network, name: 'Network Diagrams', desc: 'Build topology maps in minutes, not hours. Drag-and-drop with PNG / SVG export for submittals' },
      { icon: Activity, name: 'Ping Tool', desc: 'Know instantly which devices are reachable. HTTP and ICMP testing with port scanning and history' },
      { icon: Calculator, name: 'Register Tool', desc: 'Decode any BACnet, Modbus, or LonWorks value — hex, IEEE 754, byte order, and addressing' },
      { icon: Gauge, name: 'PID Tuning', desc: 'Stop guessing on loop parameters. Ziegler-Nichols and Cohen-Coon calculators with symptom diagnosis' },
      { icon: Thermometer, name: 'Psychrometric', desc: 'Calculate moist air properties for AHU commissioning — mixed air, coil loads, and comfort zones' },
    ],
  },
  {
    title: 'Collaborate',
    accent: { icon: 'text-field-success', bg: 'bg-field-success/10', border: 'border-field-success/15' },
    desc: 'Share projects and knowledge across your team in real time.',
    items: [
      { icon: Globe, name: 'Global Projects', desc: 'Multi-user shared projects with access codes, role-based permissions, and real-time activity tracking' },
      { icon: BookOpen, name: 'Knowledge Base', desc: 'A shared library of technical guides with markdown editing, threaded replies, and full-text search' },
      { icon: MessageSquare, name: 'Message Board', desc: 'Cross-project messaging with threaded replies, unread tracking, and file attachments' },
      { icon: Share2, name: 'Activity Tracking', desc: 'Every change logged with before/after diffs, timestamps, and creator attribution' },
    ],
  },
];

const workflowSteps = [
  { step: '01', title: 'Load your project offline', desc: 'Pin any project before heading to site. All files, device lists, IP plans, and notes are available without Wi-Fi or cellular.' },
  { step: '02', title: 'Locate and scan devices', desc: 'Find every controller, verify IP addresses and BACnet instances, check VLAN assignments, and detect duplicates automatically.' },
  { step: '03', title: 'Access controllers directly', desc: 'Open web panels, telnet into firmware, or decode register values — all without switching to a separate tool.' },
  { step: '04', title: 'Run diagnostics', desc: 'Tune PID loops, calculate psychrometric conditions, map network topology, and decode Modbus registers on the spot.' },
  { step: '05', title: 'Document the findings', desc: 'Attach terminal logs, screenshots, and field notes to the project. Write structured daily reports with full issue tracking.' },
  { step: '06', title: 'Export to the customer', desc: 'Send a formatted PDF report, push to Teams, or email via Outlook — all directly from inside the app.' },
];

const platformPillars = [
  { icon: Layers, title: 'Unified workspace', desc: 'Projects, files, IP plans, device lists, notes, and diagnostics — all linked and searchable. Stop switching apps mid-job.' },
  { icon: WifiOff, title: 'Offline-first, always', desc: 'Everything stored locally. Pin projects before heading to site. Works without Wi-Fi, VPN, or cellular — no excuses.' },
  { icon: Wrench, title: 'Built-in diagnostics', desc: 'Terminal, web panel viewer, ping, register decoder, PID tuner, psychrometric calculator — no extra software needed.' },
  { icon: ClipboardList, title: 'Professional documentation', desc: 'Structured daily reports, versioned file uploads, and one-click export to Teams, Outlook, and PDF with full audit trails.' },
  { icon: Globe, title: 'Team collaboration', desc: 'Global Projects with access codes, role-based permissions, real-time activity tracking, and a shared knowledge base.' },
];

const fieldBenefits = [
  { icon: Layers, title: 'One platform, not ten apps', desc: 'Stop switching between spreadsheets, file shares, note apps, terminal emulators, and IP scanners.' },
  { icon: WifiOff, title: 'Works offline in the field', desc: 'All data stored locally. Pin projects before heading to the job site. No Wi-Fi, VPN, or hotspot required.' },
  { icon: Zap, title: 'Built for field speed', desc: 'Quick upload from any page, global Cmd+K search, keyboard shortcuts, and fast navigation across all project data.' },
  { icon: Database, title: 'Your data, your control', desc: 'Local-first means device configs and project data stay private by default. Cloud sync is opt-in, never forced.' },
];

const testimonials = [
  {
    quote: 'BAU Suite replaced our SharePoint folder, Notepad, and PuTTY in one shot. We carry one tab into the field now.',
    name: 'M. Torres',
    role: 'Senior Controls Technician',
  },
  {
    quote: 'The offline-first design is exactly what we needed. No more scrambling for a hotspot in an equipment room.',
    name: 'R. Patel',
    role: 'BAS Commissioning Engineer',
  },
  {
    quote: "Daily reports used to take 30 minutes to format and send. Now it's under 5. The Teams export is seamless.",
    name: 'J. Kim',
    role: 'Field Service Engineer',
  },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { mode, user, loading: authLoading } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    if (isTauri && !authLoading && !isAuthed) {
      window.location.replace('/login');
    }
  }, [isTauri, authLoading, isAuthed]);

  const goApp = () => router.push('/dashboard');
  const goSignup = () => isTauri ? window.location.assign('/login?tab=signup') : router.push('/login?tab=signup');
  const goLogin = () => isTauri ? window.location.assign('/login') : router.push('/login');

  return (
    <div ref={scrollRef} className="min-h-screen bg-background">

      {/* ── Glass Navigation ─────────────────────────────────────────── */}
      <header className="hp-glass-nav sticky top-0 z-40 border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
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
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="hp-orb absolute -top-24 -left-24 w-80 h-80 opacity-40 dark:opacity-25"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-teal) 0%, transparent 70%)' }}
        />
        <div
          className="hp-orb absolute -bottom-32 -right-24 w-80 h-80 opacity-25 dark:opacity-15"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-petrol) 0%, transparent 70%)', animationDelay: '4s' }}
        />
        {/* Grid background */}
        <div className="hp-grid-bg absolute inset-0 opacity-0" style={{
          backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left: Copy */}
            <div>
              <div
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
                style={{ animation: 'hp-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.1s', opacity: 0 }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                v{APP_VERSION}
              </div>

              <h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
                style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.2s', opacity: 0, lineHeight: '1.1' }}
              >
                Stop carrying<br />
                <span className="text-primary">five apps</span><br />
                into the field
              </h1>

              <p
                className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg"
                style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.35s', opacity: 0 }}
              >
                One offline-first workspace for BAS technicians and controls engineers.
                Projects, diagnostics, documentation, and terminal access — on site or in the office, with or without Wi-Fi.
              </p>

              <div
                className="mt-8 flex flex-wrap gap-3"
                style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.5s', opacity: 0 }}
              >
                {isAuthed ? (
                  <Button size="lg" onClick={goApp} className="gap-2 hp-btn-glow">
                    Go to Dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button size="lg" onClick={goSignup} className="gap-2 hp-btn-glow">
                      <UserPlus className="h-4 w-4" /> Get Started Free
                    </Button>
                    <Button size="lg" variant="outline" onClick={goLogin} className="gap-2">
                      Sign In <ArrowRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Stats row */}
              <div
                className="mt-10 flex flex-wrap gap-6 sm:gap-8"
                style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.65s', opacity: 0 }}
              >
                {[
                  { value: '16+', label: 'Integrated tools' },
                  { value: '100%', label: 'Offline-capable' },
                  { value: 'Free', label: 'To get started' },
                ].map(({ value, label }) => (
                  <div key={label}>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: UI Preview Cards */}
            <div
              className="relative hidden lg:flex flex-col gap-3 max-w-sm ml-auto w-full"
              style={{ animation: 'hp-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.4s', opacity: 0 }}
            >
              {/* Project card */}
              <div className="hp-hero-card p-4" style={{ animationDelay: '0s' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Project</span>
                  <span className="rounded-full bg-field-success/15 text-field-success text-[10px] font-bold px-2 py-0.5">Active</span>
                </div>
                <p className="text-sm font-semibold">AHU Level 3 — Block A</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">44OP-349942 · Updated today</p>
                <div className="mt-2.5 flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 8 files</span>
                  <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> 4 notes</span>
                  <span className="flex items-center gap-1"><Database className="h-3 w-3" /> 14 devices</span>
                </div>
              </div>

              {/* IP Plan + Terminal row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="hp-hero-card p-3.5" style={{ animationDelay: '1.3s' }}>
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">IP Plan</span>
                  <p className="font-mono text-sm font-bold mt-1 truncate">192.168.10.45</p>
                  <p className="text-[10px] text-muted-foreground">DDC-1 · VLAN 10</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-field-success animate-pulse" />
                    <span className="text-[10px] text-field-success font-semibold">Online · 8ms</span>
                  </div>
                </div>
                <div
                  className="hp-hero-card p-3.5 overflow-hidden"
                  style={{ background: '#0d1117', borderColor: '#30363d', animationDelay: '0.7s' }}
                >
                  <p className="font-mono text-[9px] text-green-500 mb-1.5">$ telnet 192.168.10.45</p>
                  <p className="font-mono text-[10px] text-green-400">PSTATUS: ACTIVE</p>
                  <p className="font-mono text-[10px] text-green-400">AO1 = 65.3%</p>
                  <p className="font-mono text-[10px] text-green-400">SP  = 68.0°F</p>
                </div>
              </div>

              {/* Ping results card */}
              <div className="hp-hero-card p-4" style={{ animationDelay: '2s' }}>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ping Results</span>
                <div className="mt-2 space-y-1.5">
                  {[
                    { ip: '192.168.10.45', ms: '8ms', ok: true },
                    { ip: '192.168.10.46', ms: '11ms', ok: true },
                    { ip: '192.168.10.50', ms: 'timeout', ok: false },
                  ].map(({ ip, ms, ok }) => (
                    <div key={ip} className="flex items-center justify-between">
                      <span className="font-mono text-[11px]">{ip}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{ms}</span>
                        <div className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-field-success' : 'bg-field-danger'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────────────────────── */}
      <section className="bg-muted/30 dark:bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="hp-reveal text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-10">
            What field engineers are saying
          </p>
          <div className="hp-stagger grid gap-4 sm:grid-cols-3">
            {testimonials.map(({ quote, name, role }) => (
              <div key={name} className="hp-reveal hp-card-surface p-5 flex flex-col gap-3">
                <span className="text-3xl font-bold text-primary/20 leading-none select-none">&ldquo;</span>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{quote}</p>
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs font-semibold">{name}</p>
                  <p className="text-[11px] text-muted-foreground">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Workflow</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How it works in the field</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              A connected workflow built around the real rhythm of BAS commissioning, service, and troubleshooting.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map(({ step, title, desc }) => (
              <div key={step} className="hp-reveal hp-card-surface p-5 sm:p-6 group flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold border border-primary/20 bg-primary/8 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
                  {step}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold mb-1">{title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tool Ecosystem ───────────────────────────────────────────── */}
      <section className="bg-muted/30 dark:bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Ecosystem</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Every tool you need, built in</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              Purpose-built utilities for building automation fieldwork. No extra software, no tab-switching.
            </p>
          </div>

          <div className="space-y-10">
            {toolGroups.map((group) => (
              <div key={group.title} className="hp-reveal">
                <div className="mb-4">
                  <h3 className="text-base font-bold">{group.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{group.desc}</p>
                </div>
                <div className="hp-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map(({ icon: Icon, name, desc }) => (
                    <div key={name} className="hp-reveal hp-card-surface group p-4 flex items-start gap-3">
                      <div className={`hp-tool-icon rounded-lg p-2 border shrink-0 mt-0.5 ${group.accent.icon} ${group.accent.bg} ${group.accent.border}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold flex items-center gap-1">
                          {name}
                          <ChevronRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary transition-colors duration-300" />
                        </h4>
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

      {/* ── Platform Positioning ─────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal max-w-2xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              Everything a BAS technician carries — in one platform
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              BAU Suite centralizes the project data, diagnostic tools, and documentation workflows that field engineers use every day.
            </p>
          </div>

          <div className="hp-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platformPillars.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="hp-tool-icon rounded-xl bg-primary/8 p-2.5 border border-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for the Field ──────────────────────────────────────── */}
      <section className="bg-muted/30 dark:bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why it matters</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for the field</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              Designed around the real constraints of BAS commissioning, service, and troubleshooting.
            </p>
          </div>

          <div className="hp-stagger grid gap-4 sm:grid-cols-2">
            {fieldBenefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="hp-reveal hp-card-surface p-6 flex gap-4">
                <div className="hp-tool-icon rounded-xl bg-primary/8 p-3 border border-primary/10 shrink-0 self-start">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Desktop App ──────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div
              className="relative overflow-hidden rounded-2xl border border-primary/15"
              style={{ background: 'linear-gradient(135deg, var(--color-siemens-teal) 0%, var(--color-siemens-petrol) 100%)' }}
            >
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }} />
              <div className="relative px-6 sm:px-12 py-10 sm:py-14">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm mb-5">
                      <Download className="h-3.5 w-3.5" />
                      Available Now
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      Full network diagnostics<br />on Windows
                    </h2>
                    <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed max-w-lg">
                      Download the native desktop app for true ICMP ping, VPN and internal subnet access,
                      and a focused workspace without browser limitations.
                    </p>
                    <Button
                      size="lg"
                      onClick={() => window.open('/api/download', '_blank', 'noopener,noreferrer')}
                      className="mt-6 gap-2 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
                      variant="outline"
                    >
                      <Download className="h-4 w-4" /> Download for Windows <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: Activity, title: 'Native ICMP ping', desc: 'True reachability — not just HTTP' },
                      { icon: Wifi, title: 'Full network access', desc: 'VPN & internal subnets' },
                      { icon: TerminalSquare, title: 'Desktop terminal', desc: 'Native performance' },
                      { icon: Shield, title: 'Signed & auto-updating', desc: 'Trusted installer' },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="rounded-xl border border-white/10 bg-white/8 backdrop-blur-sm p-4">
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

      {/* ── Support the Platform / Pricing ───────────────────────────── */}
      <section className="bg-muted/30 dark:bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal">
            <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              {/* Left: narrative — 3 columns */}
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                  {isPaywallEnabled() ? 'Plans & Pricing' : 'Support the project'}
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
                    <span>16+ field tools</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-primary" />
                    <span>{isPaywallEnabled() ? 'Free local-first' : 'Free to use'}</span>
                  </div>
                </div>
              </div>

              {/* Right: CTA / Pricing cards — 2 columns */}
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
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> 16+ tools</span>
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
                            <p className="text-xs text-muted-foreground">Cloud Sync</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">$8<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                          <p className="text-[10px] text-primary font-medium">30-day free trial</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Multi-device sync</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Cloud backup</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Messaging</span>
                      </div>
                    </div>

                    {/* Team tier */}
                    <div className="hp-card-surface p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-field-info" />
                          <div>
                            <p className="text-sm font-bold">Team</p>
                            <p className="text-xs text-muted-foreground">Collaborate</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">$15<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                          <p className="text-[10px] text-primary font-medium">30-day free trial</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-field-info" /> Global Projects</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-field-info" /> Knowledge Base</span>
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-field-info" /> Team messaging</span>
                      </div>
                    </div>

                    <Button size="lg" onClick={() => router.push(user ? '/settings' : '/login')} className="w-full gap-2 hp-btn-glow">
                      <Zap className="h-4 w-4" /> {user ? 'View Plans' : 'Get Started Free'}
                    </Button>
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

      {/* ── Get Started CTA ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal relative rounded-2xl overflow-hidden" style={{
            background: 'linear-gradient(135deg, var(--color-siemens-teal) 0%, var(--color-siemens-petrol) 100%)',
          }}>
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }} />
            <div className="relative px-6 sm:px-12 py-12 sm:py-16 text-center">
              {isAuthed ? (
                <>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    Welcome back
                  </h2>
                  <p className="mt-3 text-sm text-white/70 max-w-md mx-auto">
                    Your workspace is ready. All data is stored locally with secure cloud sync.
                  </p>
                  <Button
                    size="lg"
                    onClick={goApp}
                    className="mt-6 gap-2 bg-white text-siemens-teal-dark hover:bg-white/90 hp-btn-glow"
                  >
                    Go to Dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    Ready to simplify your fieldwork?
                  </h2>
                  <p className="mt-3 text-sm text-white/70 max-w-md mx-auto">
                    Create a free account. All local features are free forever — upgrade when you need cloud sync or team collaboration.
                  </p>
                  <Button
                    size="lg"
                    onClick={goSignup}
                    className="mt-6 gap-2 bg-white text-siemens-teal-dark hover:bg-white/90 hp-btn-glow"
                  >
                    <UserPlus className="h-4 w-4" /> Get Started Free
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
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
                The unified platform for BAS technicians and controls engineers. Offline-first. Field-ready.
              </p>
              <p className="text-xs text-muted-foreground mt-3">v{APP_VERSION}</p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Product</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <button onClick={() => router.push('/dashboard')} className="block hover:text-foreground transition-colors">Dashboard</button>
                <button onClick={() => router.push('/projects')} className="block hover:text-foreground transition-colors">Projects</button>
                <button onClick={() => router.push('/help')} className="block hover:text-foreground transition-colors">Help & Guides</button>
                {isPaywallEnabled() && (
                  <button onClick={() => router.push('/settings')} className="block hover:text-foreground transition-colors">Pricing</button>
                )}
              </div>
            </div>

            {/* Account links */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Account</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                {!isAuthed && (
                  <button onClick={goSignup} className="block hover:text-foreground transition-colors">Create Account</button>
                )}
                {!isAuthed && (
                  <button onClick={goLogin} className="block hover:text-foreground transition-colors">Sign In</button>
                )}
                {isAuthed && (
                  <button onClick={goApp} className="block hover:text-foreground transition-colors">Go to Dashboard</button>
                )}
                <button onClick={() => router.push('/settings')} className="block hover:text-foreground transition-colors">Settings</button>
                {!isPaywallEnabled() && (
                  <button onClick={() => router.push('/donate')} className="block hover:text-foreground transition-colors">Donate</button>
                )}
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
