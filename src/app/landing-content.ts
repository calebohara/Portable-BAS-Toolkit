// ─── Landing page content ────────────────────────────────────────────────────
// Data arrays for the public marketing page (src/app/page.tsx). Kept here to
// keep the page component readable. Icons are lucide-react components.

import {
  FolderKanban, FileText, StickyNote, ClipboardList, Share2,
  Network, Database, Activity, Globe, TerminalSquare, Calculator, FileCode,
  Wrench, WifiOff, Layers, Gauge, BookOpen, Thermometer, TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface ToolGroup {
  title: string;
  desc: string;
  accent: { icon: string; bg: string; border: string };
  items: { icon: LucideIcon; name: string; desc: string }[];
}

// The built-in toolkit, grouped by what a tech is doing on a job. This is the
// most informative content on the page — keep the substance, present compactly.
export const toolGroups: ToolGroup[] = [
  {
    title: 'Manage & document',
    desc: 'Keep every project organized and every finding on record.',
    accent: { icon: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/15' },
    items: [
      { icon: FolderKanban, name: 'Projects', desc: 'Contacts, tags, status, and a full activity history' },
      { icon: ClipboardList, name: 'Daily Reports', desc: 'Structured field reports with issue tracking' },
      { icon: FileText, name: 'Documents', desc: 'Panel databases, diagrams, controller backups' },
      { icon: StickyNote, name: 'Field Notes', desc: 'Punch items and observations, categorized & searchable' },
      { icon: Share2, name: 'Share & Export', desc: 'Teams, Outlook, or PDF with audience presets' },
    ],
  },
  {
    title: 'Plan & diagnose',
    desc: 'The diagnostic kit for BAS commissioning and service.',
    accent: { icon: 'text-field-info', bg: 'bg-field-info/10', border: 'border-field-info/15' },
    items: [
      { icon: Network, name: 'IP Plan', desc: 'IP addressing with VLAN, subnet & duplicate detection' },
      { icon: Database, name: 'Device List', desc: 'BACnet instance, IP, MAC, firmware & location' },
      { icon: Network, name: 'Network Diagrams', desc: 'Drag-and-drop topology maps with PNG / SVG export' },
      { icon: Activity, name: 'Ping Tool', desc: 'HTTP & ICMP testing with port scanning and history' },
      { icon: Calculator, name: 'Register Tool', desc: 'Decode BACnet, Modbus & LonWorks values' },
      { icon: Gauge, name: 'PID Tuning', desc: 'Ziegler-Nichols & Cohen-Coon with symptom diagnosis' },
      { icon: Thermometer, name: 'Psychrometric', desc: 'Moist-air properties for AHU commissioning' },
      { icon: TrendingUp, name: 'Trend Viewer', desc: 'Overlay trend CSVs and detect stuck sensors' },
    ],
  },
  {
    title: 'Access & program',
    desc: 'Connect to controllers and program from the field.',
    accent: { icon: 'text-field-warning', bg: 'bg-field-warning/10', border: 'border-field-warning/15' },
    items: [
      { icon: TerminalSquare, name: 'Telnet HMI', desc: 'Direct terminal access with session logging & ANSI' },
      { icon: Globe, name: 'Web Interface', desc: 'Controller web panels in embedded tabs' },
      { icon: FileCode, name: 'PPCL Editor', desc: 'Write PPCL, or import .p2 panels to view programs, points & trends' },
    ],
  },
  {
    title: 'Collaborate',
    desc: 'Share projects and knowledge across the team.',
    accent: { icon: 'text-field-success', bg: 'bg-field-success/10', border: 'border-field-success/15' },
    items: [
      { icon: Globe, name: 'Global Projects', desc: 'Shared projects with access codes & role permissions' },
      { icon: BookOpen, name: 'Knowledge Base', desc: 'Technical guides with markdown, replies & search' },
      { icon: Share2, name: 'Activity Tracking', desc: 'Before/after diffs, timestamps & attribution' },
    ],
  },
];

/**
 * Total tool count across all groups. Use this anywhere marketing copy cites
 * a tool count ("19 integrated tools") so the number can't drift from the
 * canonical list above.
 */
export const toolCount = toolGroups.reduce((n, g) => n + g.items.length, 0);

export interface FieldHighlight {
  icon: LucideIcon;
  title: string;
  desc: string;
}

// Differentiators row — merged from the old "Platform" + "Built for the Field"
// sections. A compact strip, not a wall of cards.
export const fieldHighlights: FieldHighlight[] = [
  { icon: WifiOff, title: 'Offline-first', desc: 'Everything lives on your device. Pin projects, then work with no Wi-Fi, VPN, or cell signal.' },
  { icon: Layers, title: 'One workspace', desc: 'Projects, files, IP plans, device lists, notes, and diagnostics — linked and searchable in one place.' },
  { icon: Wrench, title: 'Built-in diagnostics', desc: 'Terminal, ping, register decoder, PID tuner, psychrometric, trends — no extra software to install.' },
  { icon: Database, title: 'Your data stays local', desc: 'Device configs and project data stay on your machine by default. Cloud sync is opt-in, never forced.' },
];
