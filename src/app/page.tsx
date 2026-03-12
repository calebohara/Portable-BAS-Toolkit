'use client';

import { useRouter } from 'next/navigation';
import {
  FolderKanban, FileText, StickyNote, ClipboardList, Share2,
  Network, Database, Activity, Globe, TerminalSquare, Calculator,
  Wrench, Shield, WifiOff, ArrowRight, LogIn, UserPlus, ChevronRight,
  CheckCircle2, Zap, Layers,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';

// ─── Tool Group Data ────────────────────────────────────────────────────────

const toolGroups = [
  {
    title: 'Project & Documentation',
    description: 'Organize every aspect of your BAS projects in one place.',
    items: [
      { icon: FolderKanban, name: 'Projects', desc: 'Manage BAS projects with contacts, tags, status tracking, and cascading data cleanup' },
      { icon: FileText, name: 'Documents', desc: 'Upload panel databases, wiring diagrams, sequences, and backups with version history' },
      { icon: StickyNote, name: 'Field Notes', desc: 'Categorized field notes — issues, fixes, punch items, startup notes, network changes' },
      { icon: ClipboardList, name: 'Daily Reports', desc: 'Structured daily field reports with time tracking, sections, attachments, and export' },
      { icon: Share2, name: 'Share & Export', desc: 'Teams, Outlook, PDF, and JSON export with audience presets and data masking' },
    ],
  },
  {
    title: 'Network & Device Tools',
    description: 'IP planning, device tracking, diagnostics, and protocol work.',
    items: [
      { icon: Network, name: 'IP Plan', desc: 'Full IP addressing table with VLAN, subnet, hostname, device role, and duplicate detection' },
      { icon: Database, name: 'Device List', desc: 'Track controllers, sensors, and actuators with BACnet instance, IP, MAC, and location' },
      { icon: Activity, name: 'Ping Tool', desc: 'HTTP and ICMP reachability testing with BAS port scanning, multi-target, and result export' },
      { icon: Network, name: 'Network Diagrams', desc: 'Visual BAS topology mapping with drag-and-drop nodes, connections, and PNG/SVG export' },
      { icon: Calculator, name: 'Register Tool', desc: 'Hex/decimal/binary conversion, IEEE 754 floats, byte order, bitmasks, scaling, and Modbus addressing' },
    ],
  },
  {
    title: 'Access & Diagnostics',
    description: 'Connect to controllers and capture field data directly.',
    items: [
      { icon: Globe, name: 'Web Interface', desc: 'Access BAS controller web panels with saved endpoints, favorites, and security guidance' },
      { icon: TerminalSquare, name: 'HMI Terminal', desc: 'Browser-based terminal for BAS controller access with session tabs, logging, and export' },
      { icon: Wrench, name: 'Command Snippets', desc: 'Save and reuse terminal commands — BACnet, Modbus, Niagara, Siemens, Johnson, Honeywell' },
      { icon: StickyNote, name: 'Sticky Notepad', desc: 'Draggable floating scratchpad with tabbed notes, project attachment, and offline persistence' },
    ],
  },
];

const workflowSteps = [
  { step: '1', title: 'Create a project', desc: 'Set up the job with project number, customer, site address, and contacts.' },
  { step: '2', title: 'Upload documentation', desc: 'Add panel databases, wiring diagrams, sequences, and controller backups.' },
  { step: '3', title: 'Build the IP plan & device list', desc: 'Log every controller with IP, hostname, VLAN, BACnet instance, and status.' },
  { step: '4', title: 'Run diagnostics', desc: 'Use the terminal, web interface, ping tool, and register tool from one place.' },
  { step: '5', title: 'Document findings', desc: 'Record daily reports, field notes, and attach session logs to the project.' },
  { step: '6', title: 'Export & share', desc: 'Send formatted reports to Teams, Outlook, PDF, or JSON package.' },
];

const fieldBenefits = [
  { icon: Layers, title: 'One platform, not ten apps', desc: 'Stop switching between spreadsheets, file shares, note apps, terminal emulators, and IP scanners. Everything lives here.' },
  { icon: WifiOff, title: 'Works offline in the field', desc: 'All data is stored locally. Pin projects before heading to the job site. No Wi-Fi, VPN, or cellular required.' },
  { icon: Zap, title: 'Built for field speed', desc: 'Quick upload from any page. Keyboard shortcuts. Fast search across all project data. No loading spinners in the field.' },
  { icon: Shield, title: 'Professional documentation', desc: 'Structured daily reports, versioned files, activity logs, and export-ready output that stands up to audits and handoffs.' },
];

// ─── Page Component ─────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { mode, user, isConfigured } = useAuth();
  const isAuthed = mode === 'authenticated';

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navigation Bar ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
              <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-8 w-8" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">BAU Suite</span>
              <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">Portable Project Toolkit</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <>
                <span className="text-xs text-muted-foreground hidden sm:inline mr-2">{user?.email}</span>
                <Button size="sm" onClick={() => router.push('/dashboard')} className="gap-1.5">
                  Open App <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                {isConfigured && (
                  <Button variant="ghost" size="sm" onClick={() => router.push('/login')} className="gap-1.5 text-muted-foreground">
                    <LogIn className="h-3.5 w-3.5" /> Sign In
                  </Button>
                )}
                <Button size="sm" onClick={() => router.push('/dashboard')} className="gap-1.5">
                  Open App <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              v{APP_VERSION} — Local-first with optional cloud auth
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15]">
              The field platform for
              <br />
              <span className="text-primary">building automation</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
              A unified project workspace for BAS technicians and controls engineers.
              Manage projects, run diagnostics, document field work, and export findings — all from one place, online or offline.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isAuthed ? (
                <Button size="lg" onClick={() => router.push('/dashboard')} className="gap-2">
                  Go to Dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  {isConfigured && (
                    <Button size="lg" onClick={() => router.push('/login?tab=signup')} className="gap-2">
                      <UserPlus className="h-4 w-4" /> Create Account
                    </Button>
                  )}
                  <Button size="lg" variant={isConfigured ? 'outline' : 'default'} onClick={() => router.push('/dashboard')} className="gap-2">
                    {isConfigured ? 'Continue as Guest' : 'Open App'} <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right-side stat badges */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Tools', value: '14+' },
              { label: 'Offline-First', value: '100%' },
              { label: 'Desktop & Web', value: 'Both' },
              { label: 'Open Source', value: 'MIT' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-card/50 px-4 py-3 text-center">
                <p className="text-lg sm:text-xl font-bold">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What the Platform Is ────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Everything a BAS technician carries — in one platform
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
              BAU Suite centralizes the project data, diagnostic tools, and documentation workflows
              that field engineers use every day. Instead of juggling spreadsheets, file shares,
              terminal emulators, and note apps across multiple devices, everything lives in a single
              searchable, offline-capable workspace.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard
              title="Centralized project data"
              desc="Projects, files, contacts, IP plans, device lists, notes, and activity logs — all linked and searchable."
            />
            <InfoCard
              title="Field-ready diagnostic tools"
              desc="Terminal access, web panel viewer, ping tool, register decoder, and network diagram builder built into the platform."
            />
            <InfoCard
              title="Professional documentation"
              desc="Structured daily reports, versioned file uploads, export to Teams/Outlook/PDF, and full audit trails."
            />
            <InfoCard
              title="Offline-first architecture"
              desc="All data stored locally via IndexedDB. Pin projects before heading to site. No Wi-Fi required."
            />
            <InfoCard
              title="Desktop and web"
              desc="Use in the browser as a PWA, or install the native desktop app via Tauri for ICMP ping and VPN access."
            />
            <InfoCard
              title="Cloud-ready foundation"
              desc="Optional Supabase authentication establishes user identity. Data sync is a planned future milestone."
            />
          </div>
        </div>
      </section>

      {/* ── Core Tools Overview ─────────────────────────────────────── */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Core tools</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              Purpose-built utilities for building automation fieldwork, organized by workflow.
            </p>
          </div>
          <div className="space-y-12">
            {toolGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map(({ icon: Icon, name, desc }) => (
                    <div
                      key={name}
                      className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/20 hover:bg-accent/30"
                    >
                      <div className="mb-2.5 flex items-center gap-2.5">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <h4 className="text-sm font-semibold">{name}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why It Matters ──────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Built for the field</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              Designed around the real constraints of BAS commissioning, service, and troubleshooting work.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {fieldBenefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="shrink-0 rounded-xl border border-border bg-card p-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              A connected workflow from project setup through documentation and export.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {step}
                </div>
                <div>
                  <h4 className="text-sm font-semibold">{title}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Get Started / Auth CTA ──────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 text-center">
          {isAuthed ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                You&apos;re signed in
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Your account is ready. All data is stored locally — cloud sync is a future milestone.
              </p>
              <Button size="lg" className="mt-6 gap-2" onClick={() => router.push('/dashboard')}>
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Ready to get started?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                {isConfigured
                  ? 'Create an account to prepare for future cloud sync, or continue in local mode — all features work either way.'
                  : 'All features work locally with no account required. Data is stored on your device.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                {isConfigured && (
                  <Button size="lg" onClick={() => router.push('/login?tab=signup')} className="gap-2">
                    <UserPlus className="h-4 w-4" /> Create Account
                  </Button>
                )}
                <Button
                  size="lg"
                  variant={isConfigured ? 'outline' : 'default'}
                  onClick={() => router.push('/dashboard')}
                  className="gap-2"
                >
                  {isConfigured ? 'Continue as Guest' : 'Open App'} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              {isConfigured && (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Already have an account?{' '}
                  <button onClick={() => router.push('/login')} className="text-primary hover:underline">
                    Sign in
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="py-6 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded overflow-hidden">
              <img src="/icons/icon-small.svg" alt="" className="h-5 w-5" />
            </div>
            <span>BAU Suite v{APP_VERSION}</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/help')} className="hover:text-foreground transition-colors">Help</button>
            <button onClick={() => router.push('/settings')} className="hover:text-foreground transition-colors">Settings</button>
            <span className="text-muted-foreground/50">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function InfoCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
