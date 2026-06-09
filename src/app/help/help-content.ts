import {
  HelpCircle, FolderKanban, Upload, Search, Pin,
  Database, Network, StickyNote, Share2,
  Shield, Activity, Users2, BookOpen, Cloud, Calculator,
  Gauge, ClipboardList, TerminalSquare, Globe, FileCode, Thermometer,
  LineChart, FileSpreadsheet, NotebookPen, History, Rocket, Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

// ─── Categories ─────────────────────────────────────────────────────────────────
// Stable ids used for in-page nav anchors and per-guide grouping.

export type CategoryId =
  | 'getting-started'
  | 'engineering-tools'
  | 'field-connectivity'
  | 'projects-docs'
  | 'collaboration-cloud'
  | 'safety'
  | 'settings'
  | 'faq';

export interface HelpCategory {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  blurb: string;
}

export const helpCategories: HelpCategory[] = [
  { id: 'getting-started', label: 'Getting Started', icon: Rocket, blurb: 'Set up your first project and learn the basics.' },
  { id: 'engineering-tools', label: 'Engineering Tools', icon: Calculator, blurb: 'Calculators, analyzers, and editors for the field.' },
  { id: 'field-connectivity', label: 'Field Connectivity & Diagnostics', icon: Activity, blurb: 'Reach, talk to, and troubleshoot live BAS hardware.' },
  { id: 'projects-docs', label: 'Projects & Documentation', icon: FolderKanban, blurb: 'Organize projects, files, devices, and field records.' },
  { id: 'collaboration-cloud', label: 'Collaboration & Cloud', icon: Cloud, blurb: 'Team projects, knowledge sharing, sync, and accounts.' },
  { id: 'safety', label: 'Safety', icon: Shield, blurb: 'Pre-work safety routines and accountability.' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, blurb: 'Backup, restore, data hygiene, and preferences.' },
  { id: 'faq', label: 'FAQ, Troubleshooting & Shortcuts', icon: HelpCircle, blurb: 'Answers, fixes, and keyboard shortcuts.' },
];

// ─── Getting Started steps ──────────────────────────────────────────────────────

export interface GettingStartedStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const gettingStartedSteps: GettingStartedStep[] = [
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

// ─── Feature guides ─────────────────────────────────────────────────────────────

export interface FeatureGuide {
  icon: LucideIcon;
  title: string;
  summary: string;
  category: CategoryId;
  items: string[];
}

export const featureGuides: FeatureGuide[] = [
  // ── Engineering Tools ──────────────────────────────────────────────────────
  {
    icon: LineChart,
    title: 'Trend Data Viewer',
    summary: 'Upload trend CSVs and surface anomalies with interactive charts.',
    category: 'engineering-tools',
    items: [
      'Upload one or more trend CSV files and combine them into a single analysis',
      'Interactive multi-series chart with zoom and pan across the full time range',
      'Configurable anomaly detection: spikes, flat-lines, gaps, saturation / out-of-range, and oscillation',
      'Per-series statistics: min, max, mean, median, standard deviation, and runtime',
      'Click any detected anomaly to center the chart on that point',
      'Full data table view alongside the chart',
      'Export to CSV or PNG, or print the analysis',
      'Save and reload analysis sessions to a project',
    ],
  },
  {
    icon: Calculator,
    title: 'Register Tool',
    summary: 'Convert, decode, and build register and Modbus values.',
    category: 'engineering-tools',
    items: [
      'Quick Converter: convert values between decimal, hex, binary, and octal instantly',
      'Register Interpreter: decode 16-bit and 32-bit register values as signed/unsigned int or float',
      'Byte Order Tool: visualize and swap byte/word order for Modbus and BACnet registers',
      'Float Decoder: decode IEEE 754 single and double-precision floating point values',
      'Bitmask Tool: AND, OR, XOR, NOT operations with visual bit-level display',
      'Scaling Calculator: compute linear scaling between raw counts and engineering units',
      'Modbus Builder: construct and decode Modbus RTU/TCP frames',
      'Save calculations to history for later reference',
    ],
  },
  {
    icon: Gauge,
    title: 'PID Tuning Tool',
    summary: 'Diagnose loops and compute tuning recommendations.',
    category: 'engineering-tools',
    items: [
      'Diagnose PID control loop issues with 11 field-observed symptoms',
      'Rule-based tuning recommendations with confidence levels and explanations',
      'Supports all common BAS loop types: SAT, DAT, static pressure, room temp, humidity, VFD, and more',
      'Gain / Proportional Band live conversion (PB% = 100/Kp)',
      'Ziegler-Nichols calculator: ultimate gain method and open-loop step response method',
      'Cohen-Coon calculator: better suited for high dead-time processes (VAV, chilled water, SAT) — shows θ/τ ratio',
      'Before vs After comparison with percentage deltas',
      'Flags non-tuning issues (mechanical sticking, sensor lag) honestly',
      'Save tuning sessions to projects for documentation',
      'BAS-specific PID reference guide with typical ranges by loop type',
      'Export as clipboard text, print/PDF, or JSON',
    ],
  },
  {
    icon: FileCode,
    title: 'PPCL Editor',
    summary: 'Edit Siemens PPCL, or import a .p2 panel to view its programs, points & trends.',
    category: 'engineering-tools',
    items: [
      'Code editor for Siemens PPCL (Powers Process Control Language)',
      'Syntax highlighting for PPCL keywords, operators, and comments',
      'Multi-tab support for working on multiple files simultaneously',
      'Import a Siemens .p2 panel database (upload or drag-and-drop) — its PPCL programs are reconstructed into editable tabs',
      'Panel Inspector lists the panel’s points (type, descriptor, units/states) and trends, with a Physical-I/O filter and CSV export',
      'Cloud sync to save editor content and associate files with projects',
      'Copy editor content to the clipboard and download files with a .pcl extension',
    ],
  },
  {
    icon: Thermometer,
    title: 'Psychrometric Calculator',
    summary: 'Moist-air properties, mixed air, and coil loads.',
    category: 'engineering-tools',
    items: [
      'Calculate all moist air properties from any two known values',
      'Five input modes: DB + RH, DB + Wet Bulb, DB + Dew Point, DB + Humidity Ratio, DB + Enthalpy',
      'Outputs: dry bulb, wet bulb, dew point, RH, humidity ratio, enthalpy, specific volume, vapor pressure',
      'IP and SI unit systems with one-click toggle — values convert automatically',
      'Altitude correction for accurate high-elevation results',
      'ASHRAE 55 comfort zone indicator',
      'AHU Mixed Air Calculator: compute mixed air conditions from OA and RA states at any OA fraction',
      'Coil Load Calculator: sensible, latent, total load (BTU/hr or kW), and SHR from entering/leaving conditions and airflow',
      'Save calculation sessions to projects with labels and notes',
      'Reference guide with ASHRAE equations and BAS field applications',
    ],
  },

  // ── Field Connectivity & Diagnostics ──────────────────────────────────────
  {
    icon: TerminalSquare,
    title: 'Terminal (Telnet & Serial)',
    summary: 'Talk to controllers over Telnet (TCP) or a serial COM port.',
    category: 'field-connectivity',
    items: [
      'Connect to BAS controllers over Telnet (TCP, default port 23) directly from the app',
      'On the desktop app, also connect over Serial: choose a COM port, then set baud rate, data bits, parity, stop bits, and flow control',
      'List available serial ports so you can pick the right COM device',
      'Character mode for accurate HMI interaction with controllers that expect raw input',
      'Session logging with timestamps — export logs as .txt',
      'Attach session logs to projects for documentation',
      'Save frequently used commands as reusable snippets',
      'Categorize snippets: BACnet, LonWorks, Modbus, Niagara, Siemens, Johnson, Honeywell, and more',
      'Insert snippets directly into the command line with one click',
    ],
  },
  {
    icon: Activity,
    title: 'Ping Tool (Reachability Test)',
    summary: 'Native ICMP ping on desktop, HTTP fallback in the browser.',
    category: 'field-connectivity',
    items: [
      'Desktop app: native ICMP ping for real reachability and TTL, and can also check specific TCP ports',
      'Browser / PWA: falls back to HTTP/HTTPS reachability testing (browsers cannot send ICMP), with an optional BAS port scan (8080, 8443, 47808)',
      'Three modes: Single Check, Repeated (configurable count and interval), Multi-Target (parallel)',
      'Response time measurement for each check',
      'Expandable per-target result history with latency statistics',
      'Save results to a project for documentation',
      'Export results as a .txt file with full statistics',
    ],
  },
  {
    icon: Globe,
    title: 'Web Interface',
    summary: 'Embed controller web panels, even with self-signed certs.',
    category: 'field-connectivity',
    items: [
      'Access BAS controller web panels directly without leaving the app',
      'Desktop app: a Rust proxy fetches the panel HTML and embeds it in a sandboxed iframe — works with self-signed BAS controller certs and injects a <base> tag so relative URLs resolve',
      'Browser / PWA: direct iframe embed, falling back to opening a new tab when X-Frame-Options blocks embedding',
      'Trust Certificate flow: opens the panel in a new tab to accept the cert, then retries embedding',
      'Save controller endpoints and organize them by project',
      'Launch panels embedded in the app or open in a new tab',
    ],
  },
  {
    icon: Network,
    title: 'Network Diagram Builder',
    summary: 'Draw BAS network topology maps per project.',
    category: 'field-connectivity',
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

  // ── Projects & Documentation ──────────────────────────────────────────────
  {
    icon: FolderKanban,
    title: 'Project Management',
    summary: 'Create and track projects with cascading data.',
    category: 'projects-docs',
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
    title: 'Files & Documents',
    summary: 'Upload, categorize, and preview project files.',
    category: 'projects-docs',
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
    summary: 'IP addressing table with duplicate detection.',
    category: 'projects-docs',
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
    summary: 'Log every controller, sensor, and actuator.',
    category: 'projects-docs',
    items: [
      'Track controllers, sensors, actuators, and other BAS devices',
      'Record controller type (e.g., PXC36.1-E.D), BACnet instance, IP, MAC',
      'System assignment (HVAC, Lighting, Fire, etc.)',
      'Floor and area location for physical mapping',
      'Status tracking: Online, Offline, Issue, Not Commissioned',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: 'DXR Import',
    summary: 'Bulk-import devices from a Desigo CC Smart Copy export.',
    category: 'projects-docs',
    items: [
      'Bulk device import from a Siemens Desigo CC "Smart Copy" XLSX export',
      'Parse preview with automatic row/column detection and warnings before importing',
      'Upsert by Desigo GUID so re-imports update existing devices instead of duplicating',
      'Imports are tied to the current project',
      'Available on the project "DXRs" tab',
    ],
  },
  {
    icon: ClipboardList,
    title: 'Daily Reports',
    summary: 'Chronological field reports with multi-channel export.',
    category: 'projects-docs',
    items: [
      'Record structured daily field reports tied to a project',
      'Track work completed, issues encountered, coordination notes, and equipment status',
      'Attach files to a report and move it from draft to finalized',
      'Stored per project in chronological order for a complete field history',
      'Export via Teams (markdown), Outlook (email), PDF (print), or as a JSON share package',
    ],
  },
  {
    icon: NotebookPen,
    title: 'Global Notepad',
    summary: 'A floating scratchpad available on every page.',
    category: 'projects-docs',
    items: [
      'Floating quick-scratchpad you can open from any page',
      'Persists across sessions so your notes are always there',
      'Syncs to the cloud when you are signed in',
    ],
  },
  {
    icon: History,
    title: 'Activity Timeline',
    summary: 'Per-project change log with user attribution.',
    category: 'projects-docs',
    items: [
      'Per-project chronological change log of files, notes, devices, IP entries, and more',
      'User attribution on global (shared) projects so you can see who changed what',
      'Included in share and export packages for a full audit trail',
    ],
  },
  {
    icon: Search,
    title: 'Global Search',
    summary: 'Search every project, file, device, IP entry, and note.',
    category: 'projects-docs',
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
    summary: 'Share project data via Teams, Outlook, PDF, or JSON.',
    category: 'projects-docs',
    items: [
      'Share project data via Teams (markdown), Outlook (email), or PDF (print)',
      'Export as JSON package for backup or transfer',
      'Audience presets for field techs, project managers, and custom',
      'Sensitive data masking for safe external sharing',
    ],
  },

  // ── Collaboration & Cloud ─────────────────────────────────────────────────
  {
    icon: Users2,
    title: 'Global Projects (Shared)',
    summary: 'Real-time team projects with presence and messaging.',
    category: 'collaboration-cloud',
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
    summary: 'Shared article library with attachments and threads.',
    category: 'collaboration-cloud',
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
    summary: 'Offline-first local storage with two-way cloud sync.',
    category: 'collaboration-cloud',
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
    summary: 'Optional sign-in unlocks cloud and team features.',
    category: 'collaboration-cloud',
    items: [
      'Optional Supabase-based sign-in for cloud features',
      'Account approval gate — new accounts require admin approval before access',
      'User inbox for system notifications and account status updates',
      'Online presence tracking shows active users in the sidebar',
      'Account deletion with full data cleanup',
      'Works fully offline without an account — cloud features are opt-in',
    ],
  },

  // ── Safety ─────────────────────────────────────────────────────────────────
  {
    icon: Shield,
    title: 'Pre-Work Safety Log (PWSL)',
    summary: 'Open the daily safety checklist before any work begins.',
    category: 'safety',
    items: [
      'Always-visible access from the dashboard',
      'Optional daily reminder you can toggle on or off in Settings',
      'Opens an external Microsoft Forms safety checklist in a companion window',
      'Built for accountability and safety culture — the checklist is not stored in the app',
    ],
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  {
    icon: SettingsIcon,
    title: 'Settings',
    summary: 'Backup, restore, data hygiene, and preferences.',
    category: 'settings',
    items: [
      'Backup & Restore: export and re-import your full local dataset as JSON',
      'Consistency Check: compare your local data against the cloud to spot drift',
      'Data Cleanup: remove orphaned or stale records to keep storage tidy',
      'Clear File Cache: free space by clearing cached file blobs',
      'Theme: switch between light and dark mode',
      'PWSL reminder: toggle the daily Pre-Work Safety Log reminder on or off',
    ],
  },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────────

export interface QaItem {
  q: string;
  a: string;
}

export const faqItems: QaItem[] = [
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

// ─── Troubleshooting ──────────────────────────────────────────────────────────────

export const troubleshootingItems: QaItem[] = [
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

// ─── Keyboard Shortcuts ────────────────────────────────────────────────────────────

export interface ShortcutGroup {
  scope: string;
  shortcuts: { keys: string[]; action: string }[];
}

export const shortcutGroups: ShortcutGroup[] = [
  {
    scope: 'Global',
    shortcuts: [
      { keys: ['Cmd+K', 'Ctrl+K'], action: 'Open global search' },
      { keys: ['Esc'], action: 'Close dialogs and panels, and deselect' },
    ],
  },
  {
    scope: 'Network Diagram',
    shortcuts: [
      { keys: ['V'], action: 'Select tool' },
      { keys: ['H'], action: 'Pan tool' },
      { keys: ['C'], action: 'Connect tool' },
      { keys: ['+', '='], action: 'Zoom in' },
      { keys: ['-'], action: 'Zoom out' },
      { keys: ['0'], action: 'Reset zoom to 100%' },
      { keys: ['Delete', 'Backspace'], action: 'Delete selected node or connection' },
      { keys: ['Esc'], action: 'Deselect' },
    ],
  },
  {
    scope: 'PPCL Editor',
    shortcuts: [
      { keys: ['Esc'], action: 'Blur the editor' },
    ],
  },
];
