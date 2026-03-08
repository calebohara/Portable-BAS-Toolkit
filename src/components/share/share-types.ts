import type { FileCategory } from '@/types';

// ─── Share Format ────────────────────────────────────────────
export type ShareFormat = 'teams' | 'outlook' | 'pdf' | 'package';

export const SHARE_FORMAT_LABELS: Record<ShareFormat, string> = {
  teams: 'Microsoft Teams',
  outlook: 'Outlook Email',
  pdf: 'PDF Export',
  package: 'Share Package',
};

export const SHARE_FORMAT_DESCRIPTIONS: Record<ShareFormat, string> = {
  teams: 'Markdown-formatted message ready to paste into Teams',
  outlook: 'Email subject + body for Outlook or any email client',
  pdf: 'Print-optimized view for PDF export via browser print',
  package: 'Downloadable JSON bundle with all selected data',
};

// ─── Detail Level ────────────────────────────────────────────
export type DetailLevel = 'summary' | 'standard' | 'detailed';

export const DETAIL_LEVEL_LABELS: Record<DetailLevel, string> = {
  summary: 'Summary',
  standard: 'Standard',
  detailed: 'Detailed',
};

export const DETAIL_LEVEL_DESCRIPTIONS: Record<DetailLevel, string> = {
  summary: 'Counts and high-level info only',
  standard: 'Key fields and lists',
  detailed: 'All fields including notes, tags, and metadata',
};

// ─── Content Sections ────────────────────────────────────────
export type ShareSection =
  | 'projectInfo'
  | 'contacts'
  | 'panelRoster'
  | 'techNotes'
  | 'networkSummary'
  | 'files'
  | 'notes'
  | 'devices'
  | 'ipPlan'
  | 'activity';

export const SHARE_SECTION_LABELS: Record<ShareSection, string> = {
  projectInfo: 'Project Details',
  contacts: 'Contacts',
  panelRoster: 'Panel Roster',
  techNotes: 'Technician Notes',
  networkSummary: 'Network Summary',
  files: 'Files',
  notes: 'Field Notes',
  devices: 'Device List',
  ipPlan: 'IP Plan',
  activity: 'Activity History',
};

// ─── File Category Filter ────────────────────────────────────
export type FileCategoryFilter = Record<FileCategory, boolean>;

// ─── Content Selection ──────────────────────────────────────
export interface ShareContentSelection {
  sections: Record<ShareSection, boolean>;
  detailLevel: DetailLevel;
  fileCategories: FileCategoryFilter;
  hideSensitive: boolean; // mask IPs, MACs, emails, phones
}

// ─── Share Metadata ─────────────────────────────────────────
export interface ShareMetadata {
  title: string;
  preparedBy: string;
  coverNote: string;
  date: string;
}

// ─── Full Share Config ──────────────────────────────────────
export interface ShareConfig {
  format: ShareFormat;
  content: ShareContentSelection;
  metadata: ShareMetadata;
}

// ─── Audience Presets ───────────────────────────────────────
export interface AudiencePreset {
  id: string;
  label: string;
  description: string;
  sections: ShareSection[];
  detailLevel: DetailLevel;
  fileCategories: FileCategory[];
  hideSensitive: boolean;
}

export const AUDIENCE_PRESETS: AudiencePreset[] = [
  {
    id: 'field-tech',
    label: 'Field Technician Handoff',
    description: 'Everything a tech needs on-site',
    sections: ['projectInfo', 'contacts', 'panelRoster', 'techNotes', 'files', 'notes', 'devices', 'ipPlan'],
    detailLevel: 'detailed',
    fileCategories: ['panel-databases', 'wiring-diagrams', 'sequences', 'backups', 'ip-plan', 'device-list', 'general-documents', 'other'],
    hideSensitive: false,
  },
  {
    id: 'pm-status',
    label: 'PM Status Update',
    description: 'Project manager overview with counts and status',
    sections: ['projectInfo', 'contacts', 'networkSummary', 'files', 'notes', 'devices', 'ipPlan', 'activity'],
    detailLevel: 'summary',
    fileCategories: ['panel-databases', 'wiring-diagrams', 'sequences', 'backups', 'ip-plan', 'device-list', 'general-documents', 'other'],
    hideSensitive: false,
  },
  {
    id: 'customer',
    label: 'Customer Summary',
    description: 'Clean overview without internal details',
    sections: ['projectInfo', 'contacts', 'networkSummary', 'files', 'devices'],
    detailLevel: 'summary',
    fileCategories: ['wiring-diagrams', 'sequences'],
    hideSensitive: true,
  },
  {
    id: 'network-review',
    label: 'Network Review',
    description: 'IP plan, devices, and network configuration',
    sections: ['projectInfo', 'networkSummary', 'devices', 'ipPlan'],
    detailLevel: 'detailed',
    fileCategories: ['ip-plan', 'device-list'],
    hideSensitive: false,
  },
  {
    id: 'controls-troubleshoot',
    label: 'Controls Troubleshooting',
    description: 'Panel DBs, sequences, notes, and device info',
    sections: ['projectInfo', 'panelRoster', 'techNotes', 'files', 'notes', 'devices'],
    detailLevel: 'detailed',
    fileCategories: ['panel-databases', 'sequences', 'backups'],
    hideSensitive: false,
  },
  {
    id: 'tab-coordination',
    label: 'TAB Coordination',
    description: 'Sequences, wiring, and relevant contacts',
    sections: ['projectInfo', 'contacts', 'files', 'notes'],
    detailLevel: 'standard',
    fileCategories: ['sequences', 'wiring-diagrams'],
    hideSensitive: true,
  },
];

// ─── Defaults ───────────────────────────────────────────────
export const ALL_SECTIONS: ShareSection[] = [
  'projectInfo', 'contacts', 'panelRoster', 'techNotes',
  'networkSummary', 'files', 'notes', 'devices', 'ipPlan', 'activity',
];

export const ALL_FILE_CATEGORIES: FileCategory[] = [
  'panel-databases', 'wiring-diagrams', 'sequences',
  'ip-plan', 'device-list', 'backups', 'general-documents', 'other',
];

export function createDefaultSelection(): ShareContentSelection {
  const sections = {} as Record<ShareSection, boolean>;
  ALL_SECTIONS.forEach(s => { sections[s] = true; });
  const fileCategories = {} as FileCategoryFilter;
  ALL_FILE_CATEGORIES.forEach(c => { fileCategories[c] = true; });
  return { sections, detailLevel: 'standard', fileCategories, hideSensitive: false };
}

export function applyPreset(preset: AudiencePreset): ShareContentSelection {
  const sections = {} as Record<ShareSection, boolean>;
  ALL_SECTIONS.forEach(s => { sections[s] = preset.sections.includes(s); });
  const fileCategories = {} as FileCategoryFilter;
  ALL_FILE_CATEGORIES.forEach(c => { fileCategories[c] = preset.fileCategories.includes(c); });
  return {
    sections,
    detailLevel: preset.detailLevel,
    fileCategories,
    hideSensitive: preset.hideSensitive,
  };
}
