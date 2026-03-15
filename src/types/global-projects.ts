import type { NoteCategory } from '@/types';

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type GlobalProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type GlobalProjectRole = 'admin' | 'member';
export type GlobalDeviceStatus = 'Online' | 'Offline' | 'Issue' | 'Not Commissioned';
export type GlobalIpStatus = 'active' | 'reserved' | 'available' | 'conflict';
export type GlobalReportStatus = 'draft' | 'submitted' | 'finalized';

// ─── Core ───────────────────────────────────────────────────────────────────

export interface GlobalProject {
  id: string;
  createdBy: string;
  name: string;
  jobSiteName: string;
  siteAddress: string;
  buildingArea: string;
  projectNumber: string;
  description: string;
  accessCode: string;
  tags: string[];
  status: GlobalProjectStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated via join — number of members in this project */
  memberCount?: number;
  /** Populated via join — current user's role in this project */
  role?: GlobalProjectRole;
}

export interface CreateGlobalProjectData {
  name: string;
  jobSiteName: string;
  siteAddress?: string;
  buildingArea?: string;
  projectNumber?: string;
  description?: string;
  tags?: string[];
}

export interface GlobalProjectMember {
  id: string;
  globalProjectId: string;
  userId: string;
  role: GlobalProjectRole;
  joinedAt: string;
  invitedBy: string | null;
  /** Joined from profiles table */
  displayName: string | null;
  /** Joined from profiles table */
  email: string;
  /** Joined from profiles table */
  avatarUrl: string | null;
}

// ─── Child Entities ─────────────────────────────────────────────────────────

export interface GlobalFieldNote {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  fileId: string | null;
  content: string;
  category: NoteCategory;
  isPinned: boolean;
  tags: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalDevice {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  deviceName: string;
  description: string;
  system: string;
  panel: string;
  controllerType: string;
  macAddress: string | null;
  instanceNumber: string | null;
  ipAddress: string | null;
  floor: string;
  area: string;
  status: GlobalDeviceStatus;
  notes: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalIpPlanEntry {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  ipAddress: string;
  hostname: string;
  panel: string;
  vlan: string;
  subnet: string;
  deviceRole: string;
  macAddress: string | null;
  notes: string;
  status: GlobalIpStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalReportAttachment {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  size: number;
  /** Path in Supabase Storage (project-files bucket). Null for legacy metadata-only entries. */
  storagePath: string | null;
}

export interface GlobalDailyReport {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  date: string;
  reportNumber: number;
  technicianName: string;
  status: GlobalReportStatus;
  startTime: string;
  endTime: string;
  hoursOnSite: string;
  location: string;
  weather: string;
  workCompleted: string;
  issuesEncountered: string;
  workPlannedNext: string;
  coordinationNotes: string;
  equipmentWorkedOn: string;
  deviceIpChanges: string;
  safetyNotes: string;
  generalNotes: string;
  attachments: GlobalReportAttachment[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProjectFile {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  title: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  category: string;
  panelSystem: string | null;
  revisionNumber: string;
  revisionDate: string;
  notes: string;
  tags: string[];
  status: string;
  isPinned: boolean;
  size: number;
  storagePath: string | null;
  versions: unknown[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalActivityLogEntry {
  id: string;
  globalProjectId: string;
  userId: string;
  action: string;
  details: string;
  fileId: string | null;
  timestamp: string;
}

export interface GlobalMessage {
  id: string;
  globalProjectId: string | null;
  parentId: string | null;
  subject: string;
  body: string;
  createdBy: string;
  deletedAt: string | null;
  createdAt: string;
  /** Joined from profiles table */
  authorName: string | null;
  /** Joined from profiles table */
  authorAvatarUrl: string | null;
  /** Joined from global_projects table */
  projectName: string | null;
  /** Replies nested under this message (populated client-side) */
  replies?: GlobalMessage[];
  /** Number of replies (populated client-side) */
  replyCount?: number;
}

export interface GlobalNetworkDiagram {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  description: string;
  nodes: unknown[];
  connections: unknown[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
