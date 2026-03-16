'use client';

import { useState } from 'react';
import {
  HelpCircle, PlayCircle, FolderKanban, Upload, Search, Pin,
  Database, Network, StickyNote, FileText, Download, Settings,
  ChevronDown, ChevronRight, Wifi, WifiOff, Palette, Share2,
  Monitor, Smartphone, Shield, Activity, TerminalSquare, BookmarkPlus,
  Users2, BookOpen, Cloud, MessageSquare, Calculator, RefreshCw, Gauge,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';

// ─── Getting Started ───────────────────────────────────────────────────────────

const gettingStartedSteps = [
  {
    icon: FolderKanban,
    title: 'Create a Project',
    description: 'Go to Projects and click "New Project". Enter the project name, number (44OP-XXXXXX format), customer, and site address. Add contacts, tags, and notes as needed.',
  },
  {
    icon: Upload,
    title: 'Upload Documents',
    description: 'Use the Upload button in the top bar from anywhere in the app. Choose a destination project or leave it in the Uploads Inbox for later. Supports any file type up to 100MB.',
  },
  {
    icon: Network,
    title: 'Build Your IP Plan',
    description: 'Open a project and go to the IP Plan tab. Add each controller with IP address, hostname, VLAN, subnet, and device role. Duplicate IPs are automatically flagged.',
  },
  {
    icon: Database,
    title: 'Track Your Devices',
    description: 'Use the Devices tab to log every BAS controller, sensor, and actuator. Record BACnet instance numbers, MAC addresses, floor/area locations, and status.',
  },
  {
    icon: StickyNote,
    title: 'Record Field Notes',
    description: 'Use the Notes tab to document issues, fixes, punch items, startup observations, and network changes. Notes are categorized and searchable.',
  },
  {
    icon: Pin,
    title: 'Go Offline',
    description: 'Pin projects for offline access before heading to the job site. All data is stored locally in your browser — no Wi-Fi needed.',
  },
];

// ─── Feature Guides ────────────────────────────────────────────────────────────

const featureGuides = [
  {
    icon: FolderKanban,
    title: 'Project Management',
    items: [
      'Create, edit, and delete projects with cascading cleanup of all related data',
      'Track project status: Active, On Hold, Completed, Archived',
      'Add site contacts with role, company, phone, and email',
      'Use tags to categorize and quickly filter projects',
      'Edit panel roster and network summary inline on the Overview tab',
    ],
  },
  {
    icon: Upload,
    title: 'Document Upload & Management',
    items: [
      'Quick Upload button in the top bar works from any page',
      'Drag-and-drop or click to browse — supports all file types up to 100MB',
      'Assign to a project or send to the Uploads Inbox for later',
      'Categories: Panel DBs, Wiring, Sequences, Backups, General Docs, Other',
      'Preview PDFs, images, and text files directly in the app',
      'Pin and favorite documents for quick access',
    ],
  },
  {
    icon: Network,
    title: 'IP Plan Management',
    items: [
      'Full IP addressing table with IPv4 validation',
      'Track VLAN, subnet, hostname, device role, and MAC address',
      'Automatic duplicate IP detection with visual warnings',
      'Status tracking: Active, Reserved, Available, Conflict',
      'Add, edit, and delete entries inline',
    ],
  },
  {
    icon: Database,
    title: 'Device Inventory',
    items: [
      'Track controllers, sensors, actuators, and other BAS devices',
      'Record controller type (e.g., PXC36.1-E.D), BACnet instance, IP, MAC',
      'System assignment (HVAC, Lighting, Fire, etc.)',
      'Floor and area location for physical mapping',
      'Status tracking: Online, Offline, Issue, Not Commissioned',
    ],
  },
  {
    icon: Search,
    title: 'Global Search',
    items: [
      'Search across all projects, files, devices, IP entries, and notes',
      'Results grouped by type with highlighted matches',
      'Use Cmd+K (Mac) or Ctrl+K (Windows) as a keyboard shortcut',
      'Recent searches saved for quick re-access',
    ],
  },
  {
    icon: Share2,
    title: 'Share & Export',
    items: [
      'Share project data via Teams (markdown), Outlook (email), or PDF (print)',
      'Export as JSON package for backup or transfer',
      'Audience presets for field techs, project managers, and custom',
      'Sensitive data masking for safe external sharing',
    ],
  },
  {
    icon: Network,
    title: 'Network Diagram Builder',
    items: [
      'Create visual BAS network topology maps per project',
      'Drag-and-drop nodes: controllers, routers, switches, servers, sensors, actuators, panels, workstations, gateways',
      'Draw connections between nodes with solid, dashed, or dotted styles',
      'Edit node properties: label, type, IP address, MAC address, color, and notes',
      'Label connections (e.g., "BACnet/IP", "Ethernet", "MSTP")',
      'Pan and zoom the canvas with scroll wheel or toolbar buttons',
      'Export diagrams as PNG or SVG for documentation',
      'Save multiple diagrams per project',
    ],
  },
  {
    icon: BookmarkPlus,
    title: 'Command Snippet Library',
    items: [
      'Save frequently used terminal commands as reusable snippets',
      'Categorize snippets: BACnet, LonWorks, Modbus, Niagara, Siemens, Johnson, Honeywell, and more',
      'Search and filter snippets by category or keyword',
      'Insert snippets directly into the terminal command line with one click',
      'Track usage count and mark favorites for quick access',
      'Copy commands to clipboard or delete old snippets',
    ],
  },
  {
    icon: Activity,
    title: 'Ping Tool (Reachability Test)',
    items: [
      'Test HTTP/TCP reachability of BAS controllers and network devices',
      'Three modes: Single Check, Repeated (configurable count and interval), Multi-Target (parallel)',
      'Browser-based — uses fetch() for honest HTTP reachability testing (not ICMP ping)',
      'Response time measurement for each check',
      'Expandable per-target result history with latency statistics',
      'Save results to a project for documentation',
      'Export results as .txt file with full statistics',
    ],
  },
  {
    icon: Calculator,
    title: 'Register Tool',
    items: [
      'Calculate BACnet, Modbus, and LonWorks register values',
      'Convert between decimal, hex, binary, and register formats',
      'Useful for commissioning and troubleshooting field devices',
    ],
  },
  {
    icon: Gauge,
    title: 'PID Tuning Tool',
    items: [
      'Diagnose PID control loop issues with 11 field-observed symptoms',
      'Rule-based tuning recommendations with confidence levels and explanations',
      'Supports all common BAS loop types: SAT, DAT, static pressure, room temp, humidity, VFD, and more',
      'Gain / Proportional Band live conversion (PB% = 100/Kp)',
      'Before vs After comparison with percentage deltas',
      'Flags non-tuning issues (mechanical sticking, sensor lag) honestly',
      'Save tuning sessions to projects for documentation',
      'BAS-specific PID reference guide with typical ranges by loop type',
      'Export as clipboard text, print/PDF, or JSON',
    ],
  },
  {
    icon: Users2,
    title: 'Global Projects (Shared)',
    items: [
      'Cloud-hosted projects shared across your team in real time',
      'Direct messaging between team members within each project',
      'Real-time presence indicators show who is currently online',
      'All team members see the same project data with live updates',
      'Requires Supabase authentication and an approved account',
    ],
  },
  {
    icon: BookOpen,
    title: 'Knowledge Base',
    items: [
      'Shared article library for technical documentation and guides',
      'Create articles with rich text, categories, and file attachments',
      'Search and filter articles by category or keyword',
      'Reply to articles with threaded comments and discussions',
      'Upload attachments stored in Supabase cloud storage',
      'Full-text search powered by PostgreSQL',
    ],
  },
  {
    icon: Cloud,
    title: 'Cloud Sync & Offline',
    items: [
      'Automatic two-way sync between local IndexedDB and Supabase cloud',
      'Offline-first — all data works without internet, syncs when reconnected',
      'Conflict resolution UI when local and cloud data diverge',
      'Sync status indicator shows pending changes, errors, and conflicts',
      'File uploads stored in Supabase Storage with project organization',
      'Realtime subscriptions push live updates to all connected clients',
    ],
  },
  {
    icon: Shield,
    title: 'Authentication & Account Management',
    items: [
      'Optional Supabase-based sign-in for cloud features',
      'Account approval gate — new accounts require admin approval before access',
      'User inbox for system notifications and account status updates',
      'Online presence tracking shows active users in the sidebar',
      'Account deletion with full data cleanup',
      'Works fully offline without an account — cloud features are opt-in',
    ],
  },
];

// ─── FAQ ────────────────────────────────────────────────────────────────────────

const faqItems = [
  {
    q: 'Where is my data stored?',
    a: 'All data is stored locally in your browser using IndexedDB. If you sign in and enable cloud sync, data is also synced to Supabase. Local data always works offline — cloud sync is optional.',
  },
  {
    q: 'Will I lose my data if I clear my browser?',
    a: 'Yes — clearing browser data or site data will remove all stored projects, files, and notes. Install the app as a PWA for more persistent storage. Export important projects as JSON backups regularly.',
  },
  {
    q: 'How do I install the app?',
    a: 'On Chrome/Edge: look for the install icon in the address bar. On iOS Safari: tap Share then "Add to Home Screen". On Android: tap the install banner or use the browser menu. Once installed, the app works offline and opens like a native app.',
  },
  {
    q: 'What file types are supported?',
    a: 'Any file type up to 100MB can be uploaded. Preview is supported for PDFs, images (PNG, JPG, SVG, WebP, GIF), and text files (TXT, CSV, JSON, XML). Other file types can be downloaded.',
  },
  {
    q: 'Can I use this on my phone?',
    a: 'Yes — BAU Suite is fully responsive and works on phones, tablets, and desktops. Install it as a PWA for the best mobile experience.',
  },
  {
    q: 'What is the project number format?',
    a: 'The default format is 44OP-XXXXXX (Siemens convention). A warning appears for non-matching formats, but any format is accepted.',
  },
  {
    q: 'How does offline mode work?',
    a: 'All your data is stored locally in IndexedDB and works without internet. Pin projects from the Offline / Pinned page for priority access. When you reconnect, pending changes sync automatically to the cloud if you\'re signed in.',
  },
  {
    q: 'Can I share data between devices?',
    a: 'Yes — sign in with your account and enable cloud sync. Your projects, devices, IP plans, and notes sync automatically across all your devices. You can also export project data as JSON from the Share menu.',
  },
  {
    q: 'Do I need to sign in?',
    a: 'No — signing in is completely optional. The app works fully without an account. Sign in to unlock cloud sync, global projects, knowledge base, and team messaging. If Supabase is not configured, the sign-in option won\'t appear at all.',
  },
  {
    q: 'What happens to my data when I sign in?',
    a: 'Your local data stays in IndexedDB. When cloud sync is enabled, data syncs bidirectionally with Supabase. If there are conflicts (e.g., same record edited on two devices), the sync conflict resolver lets you choose which version to keep.',
  },
  {
    q: 'What is the account approval process?',
    a: 'After signing up, your account must be approved by an administrator before you can access cloud features like global projects, knowledge base, and team messaging. You\'ll receive a notification in your inbox when approved.',
  },
];

// ─── Troubleshooting ────────────────────────────────────────────────────────────

const troubleshootingItems = [
  {
    q: 'Files are not showing after upload',
    a: 'Try refreshing the page. If the issue persists, check that your browser has sufficient storage space (Settings > Offline Storage). Some browsers limit IndexedDB storage.',
  },
  {
    q: 'The app is running slowly',
    a: 'Clear the file cache from Settings > Offline Storage > Clear Cache. If you have many large files, consider removing unused ones. Try closing other browser tabs.',
  },
  {
    q: 'PDF preview is not loading',
    a: 'PDF preview uses an iframe. Some browsers block this for certain PDFs. Try downloading the file instead. Ensure the file is not corrupted by re-uploading.',
  },
  {
    q: 'I accidentally deleted a project',
    a: 'Project deletion is permanent and includes all related files, notes, devices, and IP entries. There is no undo. For important projects, export as JSON regularly from the Share menu.',
  },
  {
    q: 'The app won\'t install as a PWA',
    a: 'PWA installation requires HTTPS (or localhost). Make sure you\'re using Chrome, Edge, or Safari. Check that the manifest.json is loading correctly (DevTools > Application > Manifest).',
  },
  {
    q: 'Storage quota exceeded',
    a: 'Clear cached file blobs from Settings > Clear File Cache. Remove old or unnecessary files from projects. Some browsers allocate more storage for installed PWAs.',
  },
];

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────────

const shortcuts = [
  { keys: ['Cmd+K', 'Ctrl+K'], action: 'Open global search' },
  { keys: ['Esc'], action: 'Close dialogs and panels' },
  { keys: ['Arrow keys'], action: 'Navigate tour steps (during guided tour)' },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const startTour = useAppStore((s) => s.startTour);

  return (
    <>
      <TopBar title="Help & Guides" />
      <div className="p-4 md:p-6 space-y-6 max-w-3xl">
        {/* Header with replay tour */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Help Center</h2>
            <p className="text-sm text-muted-foreground">
              Guides, tips, and troubleshooting for BAU Suite.
            </p>
          </div>
          <Button onClick={startTour} className="gap-1.5 shrink-0">
            <PlayCircle className="h-4 w-4" />
            Replay Tour
          </Button>
        </div>

        {/* Getting Started */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4" /> Getting Started
            </CardTitle>
            <CardDescription>Follow these steps to set up your first project.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {gettingStartedSteps.map(({ icon: Icon, title, description }, i) => (
                <div key={title} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{title}</h4>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Feature Guides */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Feature Guides
            </CardTitle>
            <CardDescription>Detailed guides for each major feature.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {featureGuides.map((guide) => (
              <CollapsibleSection
                key={guide.title}
                icon={guide.icon}
                title={guide.title}
              >
                <ul className="space-y-1.5 pl-6">
                  {guide.items.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground list-disc leading-relaxed">{item}</li>
                  ))}
                </ul>
              </CollapsibleSection>
            ))}
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" /> Keyboard Shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shortcuts.map(({ keys, action }) => (
                <div key={action} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{action}</span>
                  <div className="flex gap-1">
                    {keys.map((key) => (
                      <kbd key={key} className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4" /> Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {faqItems.map(({ q, a }) => (
              <CollapsibleSection key={q} title={q}>
                <p className="text-xs text-muted-foreground leading-relaxed pl-1">{a}</p>
              </CollapsibleSection>
            ))}
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" /> Troubleshooting
            </CardTitle>
            <CardDescription>Common issues and how to resolve them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {troubleshootingItems.map(({ q, a }) => (
              <CollapsibleSection key={q} title={q}>
                <p className="text-xs text-muted-foreground leading-relaxed pl-1">{a}</p>
              </CollapsibleSection>
            ))}
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" /> Tips & Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <Download className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Export regularly.</strong> Use Share/Export to back up important projects as JSON.</span>
              </li>
              <li className="flex gap-2">
                <Pin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Pin before you go.</strong> Mark projects for offline before heading to the job site.</span>
              </li>
              <li className="flex gap-2">
                <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Install as PWA.</strong> The installed app is faster, works offline, and feels native.</span>
              </li>
              <li className="flex gap-2">
                <Palette className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Use dark mode.</strong> Great for mechanical rooms and low-light environments.</span>
              </li>
              <li className="flex gap-2">
                <WifiOff className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">No internet needed.</strong> All data stays local. The app works fully offline after first load.</span>
              </li>
              <li className="flex gap-2">
                <Cloud className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Enable cloud sync.</strong> Sign in to sync your data across devices and collaborate with your team.</span>
              </li>
              <li className="flex gap-2">
                <RefreshCw className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <span><strong className="text-foreground">Check sync status.</strong> The sync indicator in the sidebar shows pending changes, errors, and conflicts.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Version info */}
        <p className="text-center text-xs text-muted-foreground/50 pb-4">
          BAU Suite v{APP_VERSION}
        </p>
      </div>
    </>
  );
}

// ─── Collapsible Section ────────────────────────────────────────────────────────

function CollapsibleSection({
  icon: Icon,
  title,
  children,
}: {
  icon?: typeof HelpCircle;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-accent/50 rounded-lg transition-colors"
      >
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="flex-1">{title}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
