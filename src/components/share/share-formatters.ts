import { format } from 'date-fns';
import {
  FILE_CATEGORY_LABELS, NOTE_CATEGORY_LABELS, PROJECT_STATUS_LABELS,
  type Project, type ProjectFile, type FieldNote, type DeviceEntry,
  type IpPlanEntry, type ActivityLogEntry, type FileCategory,
} from '@/types';
import { formatFileSize } from '@/components/shared/file-icon';
import type { ShareConfig, ShareContentSelection, ShareMetadata, DetailLevel } from './share-types';

// ─── Sensitive data masking ─────────────────────────────────
function maskIp(ip: string): string {
  if (!ip) return ip;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`;
  return 'xxx.xxx.xxx.xxx';
}

function maskMac(mac: string): string {
  if (!mac) return mac;
  return mac.replace(/[\da-fA-F]{2}/g, (m, i) => i > 5 ? 'XX' : m);
}

function maskEmail(email: string): string {
  if (!email) return email;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user[0]}***@${domain}`;
}

function maskPhone(phone: string): string {
  if (!phone) return phone;
  return phone.replace(/\d(?=\d{4})/g, '*');
}

// ─── Data bundle type ────────────────────────────────────────
export interface ShareData {
  project: Project;
  files: ProjectFile[];
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  activity: ActivityLogEntry[];
}

// ─── Filter data by selection ────────────────────────────────
function filterFiles(files: ProjectFile[], sel: ShareContentSelection): ProjectFile[] {
  if (!sel.sections.files) return [];
  return files.filter(f => sel.fileCategories[f.category as FileCategory]);
}

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function formatDateTime(iso: string): string {
  try { return format(new Date(iso), 'MMM d, yyyy h:mm a'); } catch { return iso; }
}

// ─── Teams Formatter (Markdown) ──────────────────────────────
export function formatForTeams(data: ShareData, config: ShareConfig): string {
  const { content, metadata } = config;
  const { project, files, notes, devices, ipEntries, activity } = data;
  const mask = content.hideSensitive;
  const detail = content.detailLevel;
  const lines: string[] = [];

  // Header
  if (metadata.title) {
    lines.push(`## ${metadata.title}`);
  } else {
    lines.push(`## ${project.name} — Project Share`);
  }
  if (metadata.coverNote) {
    lines.push('', metadata.coverNote);
  }
  if (metadata.preparedBy) {
    lines.push('', `*Prepared by ${metadata.preparedBy} on ${formatDate(metadata.date)}*`);
  }
  lines.push('---');

  // Project Info
  if (content.sections.projectInfo) {
    lines.push('', '### Project Details');
    lines.push(`- **Project:** ${project.name}`);
    lines.push(`- **Number:** ${project.projectNumber}`);
    lines.push(`- **Customer:** ${project.customerName}`);
    lines.push(`- **Status:** ${PROJECT_STATUS_LABELS[project.status]}`);
    if (detail !== 'summary') {
      lines.push(`- **Address:** ${project.siteAddress}`);
      if (project.buildingArea) lines.push(`- **Building/Area:** ${project.buildingArea}`);
    }
    if (detail === 'detailed' && project.tags.length > 0) {
      lines.push(`- **Tags:** ${project.tags.join(', ')}`);
    }
  }

  // Contacts
  if (content.sections.contacts && project.contacts.length > 0) {
    lines.push('', '### Contacts');
    for (const c of project.contacts) {
      const phone = mask && c.phone ? maskPhone(c.phone) : c.phone;
      const email = mask && c.email ? maskEmail(c.email) : c.email;
      let line = `- **${c.name}** — ${c.role}`;
      if (c.company) line += ` (${c.company})`;
      if (detail !== 'summary') {
        if (phone) line += ` | ${phone}`;
        if (email) line += ` | ${email}`;
      }
      lines.push(line);
    }
  }

  // Panel Roster
  if (content.sections.panelRoster && project.panelRosterSummary) {
    lines.push('', '### Panel Roster', project.panelRosterSummary);
  }

  // Technician Notes
  if (content.sections.techNotes && project.technicianNotes) {
    lines.push('', '### Technician Notes', project.technicianNotes);
  }

  // Network Summary
  if (content.sections.networkSummary) {
    const activeIps = ipEntries.filter(e => e.status === 'active').length;
    const subnets = [...new Set(ipEntries.map(e => e.subnet).filter(Boolean))];
    const vlans = [...new Set(ipEntries.map(e => e.vlan).filter(Boolean))];
    if (ipEntries.length > 0 || project.networkSummary) {
      lines.push('', '### Network Summary');
      if (ipEntries.length > 0) {
        lines.push(`- **Total IPs:** ${ipEntries.length} (${activeIps} active)`);
        lines.push(`- **Subnets:** ${subnets.length > 0 ? subnets.join(', ') : 'None'}`);
        lines.push(`- **VLANs:** ${vlans.length > 0 ? vlans.join(', ') : 'None'}`);
      }
      if (project.networkSummary) lines.push('', project.networkSummary);
    }
  }

  // Files
  const filteredFiles = filterFiles(files, content);
  if (filteredFiles.length > 0) {
    lines.push('', '### Files');
    if (detail === 'summary') {
      const byCat: Record<string, number> = {};
      for (const f of filteredFiles) byCat[f.category] = (byCat[f.category] || 0) + 1;
      for (const [cat, count] of Object.entries(byCat)) {
        lines.push(`- ${FILE_CATEGORY_LABELS[cat as FileCategory]}: **${count}** files`);
      }
    } else {
      const byCat = groupBy(filteredFiles, f => f.category);
      for (const [cat, catFiles] of Object.entries(byCat)) {
        lines.push(``, `**${FILE_CATEGORY_LABELS[cat as FileCategory]}** (${catFiles.length})`);
        for (const f of catFiles) {
          let line = `- ${f.title} — ${f.fileName} (${formatFileSize(f.size)})`;
          if (detail === 'detailed' && f.notes) line += ` — *${f.notes}*`;
          lines.push(line);
        }
      }
    }
  }

  // Notes
  if (content.sections.notes && notes.length > 0) {
    lines.push('', '### Field Notes');
    if (detail === 'summary') {
      const byCat: Record<string, number> = {};
      for (const n of notes) byCat[n.category] = (byCat[n.category] || 0) + 1;
      for (const [cat, count] of Object.entries(byCat)) {
        lines.push(`- ${NOTE_CATEGORY_LABELS[cat as keyof typeof NOTE_CATEGORY_LABELS]}: **${count}**`);
      }
    } else {
      for (const n of notes) {
        lines.push(`- **[${NOTE_CATEGORY_LABELS[n.category]}]** ${n.content.substring(0, detail === 'detailed' ? 500 : 200)}${n.content.length > 200 && detail !== 'detailed' ? '...' : ''}`);
        if (detail === 'detailed') {
          lines.push(`  *${n.author} — ${formatDateTime(n.createdAt)}*`);
        }
      }
    }
  }

  // Devices
  if (content.sections.devices && devices.length > 0) {
    lines.push('', '### Devices');
    if (detail === 'summary') {
      lines.push(`**${devices.length}** devices total`);
    } else {
      lines.push('| Device | System | Panel | Controller | IP | Status |');
      lines.push('|--------|--------|-------|------------|-----|--------|');
      for (const d of devices) {
        const ip = mask && d.ipAddress ? maskIp(d.ipAddress) : (d.ipAddress || '—');
        lines.push(`| ${d.deviceName} | ${d.system} | ${d.panel} | ${d.controllerType} | ${ip} | ${d.status} |`);
      }
    }
  }

  // IP Plan
  if (content.sections.ipPlan && ipEntries.length > 0) {
    lines.push('', '### IP Plan');
    if (detail === 'summary') {
      lines.push(`**${ipEntries.length}** entries total`);
    } else {
      lines.push('| IP Address | Hostname | Panel | VLAN | Subnet | Role | Status |');
      lines.push('|------------|----------|-------|------|--------|------|--------|');
      for (const e of ipEntries) {
        const ip = mask ? maskIp(e.ipAddress) : e.ipAddress;
        lines.push(`| ${ip} | ${e.hostname} | ${e.panel} | ${e.vlan} | ${mask ? maskIp(e.subnet) : e.subnet} | ${e.deviceRole} | ${e.status} |`);
      }
    }
  }

  // Activity
  if (content.sections.activity && activity.length > 0) {
    lines.push('', '### Recent Activity');
    const shown = detail === 'summary' ? activity.slice(0, 5) : detail === 'standard' ? activity.slice(0, 15) : activity;
    for (const a of shown) {
      lines.push(`- ${formatDateTime(a.timestamp)}: ${a.details} *(${a.user})*`);
    }
    if (shown.length < activity.length) {
      lines.push(`- *...and ${activity.length - shown.length} more*`);
    }
  }

  lines.push('', '---', `*Generated by BAU Suite on ${formatDate(metadata.date)}*`);
  return lines.join('\n');
}

// ─── Outlook Formatter ──────────────────────────────────────
export function formatForOutlook(data: ShareData, config: ShareConfig): { subject: string; body: string } {
  const { project, notes, devices, ipEntries, files } = data;
  const { content, metadata } = config;
  const mask = content.hideSensitive;
  const detail = content.detailLevel;

  const subject = metadata.title || `BAU Suite — ${project.name} (${project.projectNumber})`;
  const lines: string[] = [];

  if (metadata.coverNote) lines.push(metadata.coverNote, '');

  if (content.sections.projectInfo) {
    lines.push('PROJECT DETAILS');
    lines.push(`Project: ${project.name}`);
    lines.push(`Number: ${project.projectNumber}`);
    lines.push(`Customer: ${project.customerName}`);
    lines.push(`Status: ${PROJECT_STATUS_LABELS[project.status]}`);
    if (detail !== 'summary') {
      lines.push(`Address: ${project.siteAddress}`);
      if (project.buildingArea) lines.push(`Building/Area: ${project.buildingArea}`);
    }
    lines.push('');
  }

  if (content.sections.contacts && project.contacts.length > 0) {
    lines.push('CONTACTS');
    for (const c of project.contacts) {
      let line = `• ${c.name} — ${c.role}`;
      if (c.company) line += ` (${c.company})`;
      if (detail !== 'summary') {
        const phone = mask && c.phone ? maskPhone(c.phone) : c.phone;
        const email = mask && c.email ? maskEmail(c.email) : c.email;
        if (phone) line += `, ${phone}`;
        if (email) line += `, ${email}`;
      }
      lines.push(line);
    }
    lines.push('');
  }

  if (content.sections.panelRoster && project.panelRosterSummary) {
    lines.push('PANEL ROSTER', project.panelRosterSummary, '');
  }

  if (content.sections.techNotes && project.technicianNotes) {
    lines.push('TECHNICIAN NOTES', project.technicianNotes, '');
  }

  const filteredFiles = filterFiles(files, content);
  if (filteredFiles.length > 0) {
    lines.push('FILES');
    if (detail === 'summary') {
      const byCat: Record<string, number> = {};
      for (const f of filteredFiles) byCat[f.category] = (byCat[f.category] || 0) + 1;
      for (const [cat, count] of Object.entries(byCat)) {
        lines.push(`• ${FILE_CATEGORY_LABELS[cat as FileCategory]}: ${count} files`);
      }
    } else {
      for (const f of filteredFiles) {
        lines.push(`• ${f.title} (${f.fileName}, ${formatFileSize(f.size)})`);
      }
    }
    lines.push('');
  }

  if (content.sections.notes && notes.length > 0) {
    lines.push('FIELD NOTES');
    const shown = detail === 'summary' ? notes.slice(0, 5) : notes;
    for (const n of shown) {
      lines.push(`• [${NOTE_CATEGORY_LABELS[n.category]}] ${n.content.substring(0, 150)}${n.content.length > 150 ? '...' : ''}`);
    }
    if (shown.length < notes.length) lines.push(`  ...and ${notes.length - shown.length} more`);
    lines.push('');
  }

  if (content.sections.devices && devices.length > 0) {
    lines.push('DEVICES');
    if (detail === 'summary') {
      lines.push(`${devices.length} devices total`);
    } else {
      for (const d of devices) {
        const ip = mask && d.ipAddress ? maskIp(d.ipAddress) : d.ipAddress;
        lines.push(`• ${d.deviceName} — ${d.system} / ${d.panel} — ${d.controllerType}${ip ? ` — ${ip}` : ''}`);
      }
    }
    lines.push('');
  }

  if (content.sections.ipPlan && ipEntries.length > 0) {
    lines.push('IP PLAN');
    if (detail === 'summary') {
      lines.push(`${ipEntries.length} entries total`);
    } else {
      for (const e of ipEntries) {
        const ip = mask ? maskIp(e.ipAddress) : e.ipAddress;
        lines.push(`• ${ip} — ${e.hostname} — ${e.panel} — VLAN ${e.vlan} — ${e.status}`);
      }
    }
    lines.push('');
  }

  if (metadata.preparedBy) {
    lines.push(`Prepared by ${metadata.preparedBy} on ${formatDate(metadata.date)}`);
  }
  lines.push('Generated by BAU Suite');

  return { subject, body: lines.join('\n') };
}

// ─── Share Package (JSON) ───────────────────────────────────
export function generateSharePackage(data: ShareData, config: ShareConfig): string {
  const { content, metadata } = config;
  const { project, files, notes, devices, ipEntries, activity } = data;
  const mask = content.hideSensitive;

  const pkg: Record<string, unknown> = {
    _meta: {
      generator: 'BAU Suite',
      version: '2.2.0',
      exportedAt: metadata.date,
      preparedBy: metadata.preparedBy || undefined,
      title: metadata.title || undefined,
      coverNote: metadata.coverNote || undefined,
    },
  };

  if (content.sections.projectInfo) {
    pkg.project = {
      name: project.name,
      projectNumber: project.projectNumber,
      customerName: project.customerName,
      siteAddress: project.siteAddress,
      buildingArea: project.buildingArea,
      status: project.status,
      tags: project.tags,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  if (content.sections.contacts && project.contacts.length > 0) {
    pkg.contacts = project.contacts.map(c => ({
      ...c,
      phone: mask && c.phone ? maskPhone(c.phone) : c.phone,
      email: mask && c.email ? maskEmail(c.email) : c.email,
    }));
  }

  if (content.sections.panelRoster && project.panelRosterSummary) {
    pkg.panelRoster = project.panelRosterSummary;
  }

  if (content.sections.techNotes && project.technicianNotes) {
    pkg.technicianNotes = project.technicianNotes;
  }

  if (content.sections.networkSummary) {
    pkg.networkSummary = project.networkSummary || undefined;
  }

  const filteredFiles = filterFiles(files, content);
  if (filteredFiles.length > 0) {
    pkg.files = filteredFiles.map(f => ({
      title: f.title,
      fileName: f.fileName,
      category: f.category,
      fileType: f.fileType,
      size: f.size,
      revisionNumber: f.revisionNumber,
      status: f.status,
      uploadedBy: f.uploadedBy,
      notes: f.notes,
      tags: f.tags,
      updatedAt: f.updatedAt,
    }));
  }

  if (content.sections.notes && notes.length > 0) {
    pkg.notes = notes.map(n => ({
      category: n.category,
      content: n.content,
      author: n.author,
      createdAt: n.createdAt,
      tags: n.tags,
      isPinned: n.isPinned,
    }));
  }

  if (content.sections.devices && devices.length > 0) {
    pkg.devices = devices.map(d => ({
      ...d,
      ipAddress: mask && d.ipAddress ? maskIp(d.ipAddress) : d.ipAddress,
      macAddress: mask && d.macAddress ? maskMac(d.macAddress) : d.macAddress,
      id: undefined,
      projectId: undefined,
    }));
  }

  if (content.sections.ipPlan && ipEntries.length > 0) {
    pkg.ipPlan = ipEntries.map(e => ({
      ...e,
      ipAddress: mask ? maskIp(e.ipAddress) : e.ipAddress,
      subnet: mask ? maskIp(e.subnet) : e.subnet,
      macAddress: mask && e.macAddress ? maskMac(e.macAddress) : e.macAddress,
      id: undefined,
      projectId: undefined,
    }));
  }

  if (content.sections.activity && activity.length > 0) {
    pkg.activity = activity.map(a => ({
      action: a.action,
      details: a.details,
      timestamp: a.timestamp,
      user: a.user,
    }));
  }

  return JSON.stringify(pkg, null, 2);
}

// ─── Helpers ─────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
