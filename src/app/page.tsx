'use client';

import { useRouter } from 'next/navigation';
import {
  FolderKanban, FileText, StickyNote, ClipboardList, Share2,
  Network, Database, Activity, Globe, TerminalSquare, Calculator,
  Wrench, Shield, WifiOff, ArrowRight, UserPlus,
  Zap, Layers, Monitor, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

// ─── Data ────────────────────────────────────────────────────────────────────

const toolGroups = [
  {
    title: 'Project & Documentation',
    description: 'Organize every aspect of your BAS projects in one place.',
    gradient: 'from-primary/10 to-primary/5',
    items: [
      { icon: FolderKanban, name: 'Projects', desc: 'Manage BAS projects with contacts, tags, and status tracking' },
      { icon: FileText, name: 'Documents', desc: 'Upload panel databases, wiring diagrams, and controller backups' },
      { icon: StickyNote, name: 'Field Notes', desc: 'Categorized notes — issues, fixes, punch items, and more' },
      { icon: ClipboardList, name: 'Daily Reports', desc: 'Structured field reports with time tracking and attachments' },
      { icon: Share2, name: 'Share & Export', desc: 'Teams, Outlook, PDF, and JSON export with audience presets' },
    ],
  },
  {
    title: 'Network & Device Tools',
    description: 'IP planning, device tracking, diagnostics, and protocol work.',
    gradient: 'from-siemens-petrol/10 to-siemens-petrol/5',
    items: [
      { icon: Network, name: 'IP Plan', desc: 'Full IP addressing with VLAN, subnet, and duplicate detection' },
      { icon: Database, name: 'Device List', desc: 'Track controllers with BACnet instance, IP, MAC, and location' },
      { icon: Activity, name: 'Ping Tool', desc: 'HTTP and ICMP reachability with port scanning and result export' },
      { icon: Network, name: 'Network Diagrams', desc: 'Visual topology mapping with drag-and-drop and PNG/SVG export' },
      { icon: Calculator, name: 'Register Tool', desc: 'Hex/decimal/binary, IEEE 754, byte order, and Modbus addressing' },
    ],
  },
  {
    title: 'Access & Diagnostics',
    description: 'Connect to controllers and capture field data directly.',
    gradient: 'from-siemens-navy/10 to-siemens-navy/5',
    items: [
      { icon: Globe, name: 'Web Interface', desc: 'Access BAS controller web panels with saved endpoints' },
      { icon: TerminalSquare, name: 'HMI Terminal', desc: 'Browser-based terminal with session tabs and logging' },
      { icon: Wrench, name: 'Command Snippets', desc: 'Reusable commands for BACnet, Modbus, Niagara, and more' },
      { icon: StickyNote, name: 'Sticky Notepad', desc: 'Floating scratchpad with tabbed notes and offline persistence' },
    ],
  },
];

const workflowSteps = [
  { step: '01', title: 'Create a project', desc: 'Set up the job with project number, customer, site address, and contacts.' },
  { step: '02', title: 'Upload documentation', desc: 'Add panel databases, wiring diagrams, sequences, and controller backups.' },
  { step: '03', title: 'Build the IP plan', desc: 'Log every controller with IP, hostname, VLAN, BACnet instance, and status.' },
  { step: '04', title: 'Run diagnostics', desc: 'Use the terminal, web interface, ping tool, and register tool from one place.' },
  { step: '05', title: 'Document findings', desc: 'Record daily reports, field notes, and attach session logs to the project.' },
  { step: '06', title: 'Export & share', desc: 'Send formatted reports to Teams, Outlook, PDF, or JSON.' },
];

const platformPillars = [
  {
    icon: Layers,
    title: 'Unified workspace',
    desc: 'Projects, files, contacts, IP plans, device lists, notes, and activity logs — all linked and searchable in one platform.',
  },
  {
    icon: Wrench,
    title: 'Field-ready diagnostics',
    desc: 'Terminal access, web panel viewer, ping tool, register decoder, and network diagram builder built directly into the platform.',
  },
  {
    icon: ClipboardList,
    title: 'Professional documentation',
    desc: 'Structured daily reports, versioned file uploads, export to Teams, Outlook, and PDF with full audit trails.',
  },
  {
    icon: WifiOff,
    title: 'Offline-first architecture',
    desc: 'All data stored locally via IndexedDB. Pin projects before heading to site. No Wi-Fi, VPN, or cellular required.',
  },
  {
    icon: Monitor,
    title: 'Desktop and web',
    desc: 'Use in the browser as a PWA, or install the native desktop app via Tauri for ICMP ping and full network access.',
  },
  {
    icon: Shield,
    title: 'Secure by design',
    desc: 'Supabase-backed authentication with user profiles, password reset, Row Level Security, and cloud sync.',
  },
];

const fieldBenefits = [
  { icon: Layers, title: 'One platform, not ten apps', desc: 'Stop switching between spreadsheets, file shares, note apps, terminal emulators, and IP scanners.' },
  { icon: WifiOff, title: 'Works offline in the field', desc: 'All data is stored locally. Pin projects before heading to the job site. No Wi-Fi required.' },
  { icon: Zap, title: 'Built for field speed', desc: 'Quick upload from any page. Keyboard shortcuts. Fast search across all project data.' },
  { icon: Shield, title: 'Secure by default', desc: 'User authentication, password reset, and Row Level Security with professional audit trails.' },
];

// ─── Hero Floating Cards ─────────────────────────────────────────────────────

const heroCards = [
  { icon: FolderKanban, label: 'Projects', x: 0, y: 0, delay: '0s' },
  { icon: Network, label: 'IP Plan', x: 1, y: 0, delay: '0.8s' },
  { icon: Activity, label: 'Ping Tool', x: 2, y: 0, delay: '1.6s' },
  { icon: TerminalSquare, label: 'Terminal', x: 0, y: 1, delay: '0.4s' },
  { icon: ClipboardList, label: 'Reports', x: 1, y: 1, delay: '1.2s' },
  { icon: Calculator, label: 'Register', x: 2, y: 1, delay: '2s' },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { mode, user } = useAuth();
  const isAuthed = mode === 'authenticated';
  const scrollRef = useScrollReveal();

  const goApp = () => router.push('/dashboard');
  const goSignup = () => router.push('/login?tab=signup');
  const goLogin = () => router.push('/login');

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

      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="hp-orb absolute -top-32 -left-32 w-96 h-96 opacity-30 dark:opacity-20"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-teal) 0%, transparent 70%)' }}
        />
        <div
          className="hp-orb absolute -bottom-48 -right-32 w-96 h-96 opacity-20 dark:opacity-15"
          style={{ background: 'radial-gradient(circle, var(--color-siemens-petrol) 0%, transparent 70%)', animationDelay: '4s' }}
        />

        {/* Grid background */}
        <div className="hp-grid-bg absolute inset-0 opacity-0" style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6" style={{ paddingTop: 'clamp(3rem, 8vw, 6rem)', paddingBottom: 'clamp(3rem, 8vw, 6rem)' }}>
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
                The field platform
                <br />
                for{' '}
                <span className="text-primary">building</span>
                <br className="hidden sm:block" />
                <span className="text-primary"> automation</span>
              </h1>

              <p
                className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg"
                style={{ animation: 'hp-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.35s', opacity: 0 }}
              >
                A unified workspace for BAS technicians and controls engineers.
                Manage projects, run diagnostics, document fieldwork, and export findings — online or offline.
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
                  { value: '14+', label: 'Tools' },
                  { value: '100%', label: 'Offline' },
                  { value: 'MIT', label: 'License' },
                ].map(({ value, label }) => (
                  <div key={label}>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Floating tool cards */}
            <div
              className="relative hidden lg:block"
              style={{ animation: 'hp-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.4s', opacity: 0, perspective: '1200px' }}
            >
              <div className="relative" style={{ height: '340px' }}>
                {heroCards.map(({ icon: Icon, label, x, y, delay }, i) => (
                  <div
                    key={label}
                    className="hp-hero-card absolute flex items-center gap-3 px-4 py-3"
                    style={{
                      left: `${x * 140 + (y % 2 === 1 ? 30 : 0)}px`,
                      top: `${y * 150 + 20}px`,
                      width: '160px',
                      animation: `hp-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards, hp-float-slow 6s ease-in-out infinite`,
                      animationDelay: `${0.6 + i * 0.12}s, ${delay}`,
                      opacity: 0,
                      transform: `rotateX(2deg) rotateY(${x === 0 ? 3 : x === 2 ? -3 : 0}deg)`,
                    }}
                  >
                    <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground">Module</p>
                    </div>
                  </div>
                ))}
                {/* Decorative connecting lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-15 dark:opacity-10" style={{ overflow: 'visible' }}>
                  <line x1="120" y1="50" x2="170" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="260" y1="50" x2="310" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="80" y1="80" x2="80" y2="170" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="220" y1="80" x2="220" y2="170" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Section divider */}
        <div className="hp-divider" />
      </section>

      {/* ── Platform Positioning ──────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(3rem, 6vw, 5rem)', paddingBottom: 'clamp(3rem, 6vw, 5rem)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal max-w-2xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              Everything a BAS technician carries — in one platform
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              BAU Suite centralizes the project data, diagnostic tools, and documentation workflows
              that field engineers use every day.
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

      <div className="hp-divider" />

      {/* ── Tool Ecosystem ────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(3rem, 6vw, 5rem)', paddingBottom: 'clamp(3rem, 6vw, 5rem)' }}
      >
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Ecosystem</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Core tools</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              Purpose-built utilities for building automation fieldwork, organized by workflow.
            </p>
          </div>

          <div className="space-y-8">
            {toolGroups.map((group) => (
              <div key={group.title} className="hp-reveal">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                    {group.title}
                  </h3>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="hp-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map(({ icon: Icon, name, desc }) => (
                    <div
                      key={name}
                      className="hp-reveal hp-card-surface group p-4 flex items-start gap-3"
                    >
                      <div className="hp-tool-icon rounded-lg bg-primary/8 p-2 border border-primary/10 shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-primary" />
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

      <div className="hp-divider" />

      {/* ── Built for the Field ───────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(3rem, 6vw, 5rem)', paddingBottom: 'clamp(3rem, 6vw, 5rem)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why it matters</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for the field</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              Designed around the real constraints of BAS commissioning, service, and troubleshooting work.
            </p>
          </div>

          <div className="hp-stagger grid gap-5 sm:grid-cols-2">
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

      <div className="hp-divider" />

      {/* ── Workflow ──────────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{ paddingTop: 'clamp(3rem, 6vw, 5rem)', paddingBottom: 'clamp(3rem, 6vw, 5rem)' }}
      >
        <div className="absolute inset-0 bg-muted/30 dark:bg-muted/10" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Workflow</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How it works</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl">
              A connected workflow from project setup through documentation and export.
            </p>
          </div>

          <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map(({ step, title, desc }, i) => (
              <div
                key={step}
                className="hp-reveal relative p-5 sm:p-6 group"
              >
                {/* Connecting line for grid layout */}
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-bold border border-primary/20 bg-primary/8 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary"
                    >
                      {step}
                    </div>
                    {/* Vertical connector — visible on mobile (single column) */}
                    {i < workflowSteps.length - 1 && (
                      <div className="absolute left-1/2 top-12 h-6 w-px bg-border sm:hidden" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold mb-1">{title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="hp-divider" />

      {/* ── Get Started ──────────────────────────────────────────────── */}
      <section style={{ paddingTop: 'clamp(3rem, 8vw, 6rem)', paddingBottom: 'clamp(3rem, 8vw, 6rem)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="hp-reveal relative rounded-2xl overflow-hidden" style={{
            background: 'linear-gradient(135deg, var(--color-siemens-teal) 0%, var(--color-siemens-petrol) 100%)',
          }}>
            {/* Inner grid texture */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `
                linear-gradient(to right, white 1px, transparent 1px),
                linear-gradient(to bottom, white 1px, transparent 1px)
              `,
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
                    Ready to streamline your fieldwork?
                  </h2>
                  <p className="mt-3 text-sm text-white/70 max-w-md mx-auto">
                    Create a free account. Manage projects with secure cloud sync and password recovery.
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
              <button onClick={() => router.push('/help')} className="hover:text-foreground transition-colors">Help</button>
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
