'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, Shield, Copy, Plus, FileText, Clock,
  User, Tag, Server, Globe, Activity, ChevronRight, MessageSquare,
  AlertTriangle, Database, Cpu, Wrench, Bell, Settings, Gauge,
  FolderOpen, Link2, Terminal, Network,
} from 'lucide-react';
import { useFieldPanel } from '@/hooks/use-field-panels';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { isTauri, openUrl } from '@/lib/tauri-bridge';
import { cn, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  PanelStatus, PanelActivityType, PanelNote, PanelActivity,
  PanelLinkedFile, PanelRelatedTool,
} from '@/types';

// ─── Helpers ────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

const panelStatusStyles: Record<PanelStatus, string> = {
  online: 'bg-field-success/10 text-field-success border-field-success/20',
  offline: 'bg-muted text-muted-foreground border-border',
  warning: 'bg-field-warning/10 text-field-warning border-field-warning/20',
  error: 'bg-field-danger/10 text-field-danger border-field-danger/20',
  unknown: 'bg-muted text-muted-foreground border-border',
  commissioning: 'bg-primary/10 text-primary border-primary/20',
};

const panelStatusLabels: Record<PanelStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  warning: 'Warning',
  error: 'Error',
  unknown: 'Unknown',
  commissioning: 'Commissioning',
};

function PanelStatusBadge({ status }: { status: PanelStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
      panelStatusStyles[status],
    )}>
      {panelStatusLabels[status]}
    </span>
  );
}

function getActivityIcon(type: PanelActivityType) {
  const icons: Record<PanelActivityType, typeof MessageSquare> = {
    'note': MessageSquare,
    'status-change': AlertTriangle,
    'backup': Database,
    'firmware-update': Cpu,
    'commissioning': Wrench,
    'maintenance': Settings,
    'alarm': Bell,
    'config-change': Settings,
  };
  return icons[type] || MessageSquare;
}

const activityTypeLabels: Record<PanelActivityType, string> = {
  'note': 'Note',
  'status-change': 'Status Change',
  'backup': 'Backup',
  'firmware-update': 'Firmware Update',
  'commissioning': 'Commissioning',
  'maintenance': 'Maintenance',
  'alarm': 'Alarm',
  'config-change': 'Config Change',
};

const noteCategoryLabels: Record<PanelNote['category'], string> = {
  general: 'General',
  issue: 'Issue',
  fix: 'Fix',
  commissioning: 'Commissioning',
  maintenance: 'Maintenance',
};

const noteCategoryStyles: Record<PanelNote['category'], string> = {
  general: 'bg-muted text-muted-foreground border-border',
  issue: 'bg-field-danger/10 text-field-danger border-field-danger/20',
  fix: 'bg-field-success/10 text-field-success border-field-success/20',
  commissioning: 'bg-primary/10 text-primary border-primary/20',
  maintenance: 'bg-field-warning/10 text-field-warning border-field-warning/20',
};

const fileCategoryLabels: Record<PanelLinkedFile['category'], string> = {
  database: 'Database',
  wiring: 'Wiring',
  sequence: 'Sequence',
  'point-list': 'Point List',
  startup: 'Startup',
  report: 'Report',
  other: 'Other',
};

// ─── Copiable Field ─────────────────────────────────────────

function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const handleCopy = useCallback(async () => {
    await copyToClipboard(value);
    toast.success(`${label} copied`);
  }, [label, value]);

  return (
    <div className="group flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-sm text-foreground', mono && 'font-mono')}>{value || 'N/A'}</p>
      </div>
      {value && (
        <button
          onClick={handleCopy}
          className="mt-3 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title={`Copy ${label}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Detail Field (no copy) ─────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || 'N/A'}</p>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────

export function FieldPanelDetailPage({ panelId }: { panelId: string }) {
  const router = useRouter();
  const { panel, loading, update } = useFieldPanel(panelId);
  const [activeTab, setActiveTab] = useState('overview');

  // Dialog states
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);

  // Note form
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<PanelNote['category']>('general');
  const [noteAuthor, setNoteAuthor] = useState('');

  // Activity form
  const [activityType, setActivityType] = useState<PanelActivityType>('note');
  const [activityDesc, setActivityDesc] = useState('');
  const [activityAuthor, setActivityAuthor] = useState('');

  const handleBack = useCallback(() => {
    if (isTauri()) {
      window.location.href = '/field-panels';
    } else {
      router.push('/field-panels');
    }
  }, [router]);

  const handleCopyValue = useCallback(async (value: string, label: string) => {
    await copyToClipboard(value);
    toast.success(`${label} copied to clipboard`);
  }, []);

  const handleOpenWebUi = useCallback(async () => {
    if (!panel?.webUiUrl) {
      toast.error('No Web UI URL configured');
      return;
    }
    await openUrl(panel.webUiUrl);
  }, [panel?.webUiUrl]);

  const handleOpenSecureUi = useCallback(async () => {
    if (!panel?.secureWebUiUrl) {
      toast.error('No Secure Web UI URL configured');
      return;
    }
    await openUrl(panel.secureWebUiUrl);
  }, [panel?.secureWebUiUrl]);

  const handleAddNote = useCallback(async () => {
    if (!panel || !noteContent.trim()) return;
    const newNote: PanelNote = {
      id: crypto.randomUUID(),
      content: noteContent.trim(),
      author: noteAuthor.trim() || 'Unknown',
      category: noteCategory,
      createdAt: new Date().toISOString(),
    };
    await update({ notes: [...(panel.notes || []), newNote] });
    setNoteContent('');
    setNoteAuthor('');
    setNoteCategory('general');
    setShowAddNote(false);
    toast.success('Note added');
  }, [panel, noteContent, noteAuthor, noteCategory, update]);

  const handleAddActivity = useCallback(async () => {
    if (!panel || !activityDesc.trim()) return;
    const newActivity: PanelActivity = {
      id: crypto.randomUUID(),
      type: activityType,
      description: activityDesc.trim(),
      author: activityAuthor.trim() || 'Unknown',
      timestamp: new Date().toISOString(),
    };
    await update({ activities: [...(panel.activities || []), newActivity] });
    setActivityDesc('');
    setActivityAuthor('');
    setActivityType('note');
    setShowAddActivity(false);
    toast.success('Activity logged');
  }, [panel, activityType, activityDesc, activityAuthor, update]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading panel...</div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!panel) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Server}
            title="Panel Not Found"
            description="The field panel you're looking for doesn't exist or has been removed."
            action={
              <Button variant="outline" size="sm" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Panels
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const notes = panel.notes || [];
  const activities = panel.activities || [];
  const linkedFiles = panel.linkedFiles || [];
  const relatedTools = panel.relatedTools || [];
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">

          {/* ── Header ─────────────────────────────────────── */}
          <div className="mb-6">
            <button
              onClick={handleBack}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Field Panels
            </button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">{panel.name}</h1>
                  <PanelStatusBadge status={panel.panelStatus} />
                </div>
                {/* Location breadcrumb */}
                <div className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
                  {panel.site && (
                    <>
                      <Globe className="h-3.5 w-3.5" />
                      <span>{panel.site}</span>
                    </>
                  )}
                  {panel.building && (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      <span>{panel.building}</span>
                    </>
                  )}
                  {panel.floor && (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      <span>{panel.floor}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Last seen {timeAgo(panel.lastSeenAt)}</span>
              </div>
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v as string)}>
            <TabsList className="mb-6 w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview" className="gap-1.5 text-xs">
                <Gauge className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5 text-xs">
                <Activity className="h-3.5 w-3.5" /> Activity
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> Notes
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Files
              </TabsTrigger>
              <TabsTrigger value="tools" className="gap-1.5 text-xs">
                <Terminal className="h-3.5 w-3.5" /> Tools
              </TabsTrigger>
            </TabsList>

            {/* ── Overview Tab ───────────────────────────── */}
            <TabsContent value="overview">
              <div className="space-y-6">

                {/* Summary Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Panel Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      <DetailField label="Controller" value={`${panel.controllerFamily} ${panel.model}`.trim()} />
                      <DetailField label="System" value={panel.system} />
                      <DetailField label="Equipment" value={panel.equipment} />
                      <DetailField label="Assigned Tech" value={panel.assignedTechnician} />
                      <DetailField label="Network Type" value={panel.networkType} />
                      <DetailField label="Last Seen" value={timeAgo(panel.lastSeenAt)} />
                    </div>
                    {panel.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {panel.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[11px]">
                            <Tag className="mr-1 h-3 w-3" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Launch Actions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <button
                        onClick={handleOpenWebUi}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60',
                          !panel.webUiUrl && 'cursor-not-allowed opacity-40',
                        )}
                        disabled={!panel.webUiUrl}
                      >
                        <ExternalLink className="h-5 w-5 text-primary" />
                        <span className="text-xs font-medium">Open Web UI</span>
                      </button>

                      <button
                        onClick={handleOpenSecureUi}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60',
                          !panel.secureWebUiUrl && 'cursor-not-allowed opacity-40',
                        )}
                        disabled={!panel.secureWebUiUrl}
                      >
                        <Shield className="h-5 w-5 text-field-warning" />
                        <span className="text-xs font-medium">Open Secure UI</span>
                      </button>

                      <button
                        onClick={() => panel.ipAddress && handleCopyValue(panel.ipAddress, 'IP Address')}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60',
                          !panel.ipAddress && 'cursor-not-allowed opacity-40',
                        )}
                        disabled={!panel.ipAddress}
                      >
                        <Copy className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs font-medium">Copy IP Address</span>
                      </button>

                      <button
                        onClick={() => panel.bacnetInstance != null && handleCopyValue(String(panel.bacnetInstance), 'BACnet Instance')}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60',
                          panel.bacnetInstance == null && 'cursor-not-allowed opacity-40',
                        )}
                        disabled={panel.bacnetInstance == null}
                      >
                        <Copy className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs font-medium">Copy BACnet ID</span>
                      </button>

                      <button
                        onClick={() => { setActiveTab('notes'); setShowAddNote(true); }}
                        className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60"
                      >
                        <MessageSquare className="h-5 w-5 text-field-info" />
                        <span className="text-xs font-medium">Add Note</span>
                      </button>

                      <button
                        onClick={() => setShowAddActivity(true)}
                        className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/60"
                      >
                        <Activity className="h-5 w-5 text-field-success" />
                        <span className="text-xs font-medium">Log Activity</span>
                      </button>
                    </div>
                  </CardContent>
                </Card>

                {/* Technical Details */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Technical Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <CopyField label="IP Address" value={panel.ipAddress} mono />
                      <CopyField label="Subnet Mask" value={panel.subnetMask} mono />
                      <CopyField label="Gateway" value={panel.gateway} mono />
                      <CopyField label="BACnet Instance" value={panel.bacnetInstance != null ? String(panel.bacnetInstance) : ''} mono />
                      <CopyField label="MAC Address" value={panel.macAddress} mono />
                      <DetailField label="Network Type" value={panel.networkType} />
                      <DetailField label="Firmware Version" value={panel.firmwareVersion} />
                      <DetailField label="Application Version" value={panel.applicationVersion} />
                      <DetailField label="Last Backup" value={formatDate(panel.lastBackupAt)} />
                      <DetailField label="Last Commissioned" value={formatDate(panel.lastCommissionedAt)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card>
                    <CardContent className="flex flex-col items-center p-4">
                      <span className="text-2xl font-bold">{notes.length}</span>
                      <span className="text-[11px] text-muted-foreground">Notes</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex flex-col items-center p-4">
                      <span className="text-2xl font-bold">{activities.length}</span>
                      <span className="text-[11px] text-muted-foreground">Activities</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex flex-col items-center p-4">
                      <span className="text-2xl font-bold">{linkedFiles.length}</span>
                      <span className="text-[11px] text-muted-foreground">Files</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex flex-col items-center p-4">
                      <span className="text-2xl font-bold">{daysSince(panel.lastBackupAt)}</span>
                      <span className="text-[11px] text-muted-foreground">Since Backup</span>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* ── Activity Tab ───────────────────────────── */}
            <TabsContent value="activity">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Activity Timeline ({activities.length})
                  </h2>
                  <Button size="sm" variant="outline" onClick={() => setShowAddActivity(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Log Activity
                  </Button>
                </div>

                {sortedActivities.length === 0 ? (
                  <EmptyState
                    icon={Activity}
                    title="No Activity Yet"
                    description="Log backups, firmware updates, status changes, and other events for this panel."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setShowAddActivity(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Log First Activity
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {sortedActivities.map((act) => {
                      const IconComp = getActivityIcon(act.type);
                      return (
                        <Card key={act.id}>
                          <CardContent className="flex items-start gap-3 p-4">
                            <div className="mt-0.5 rounded-lg bg-muted p-2">
                              <IconComp className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  {activityTypeLabels[act.type]}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  {timeAgo(act.timestamp)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm">{act.description}</p>
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User className="h-3 w-3" />
                                {act.author}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Notes Tab ──────────────────────────────── */}
            <TabsContent value="notes">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Notes ({notes.length})
                  </h2>
                  <Button size="sm" variant="outline" onClick={() => setShowAddNote(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Note
                  </Button>
                </div>

                {sortedNotes.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No Notes Yet"
                    description="Add field notes, issues, fixes, and commissioning details for this panel."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setShowAddNote(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add First Note
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {sortedNotes.map((note) => (
                      <Card key={note.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              noteCategoryStyles[note.category],
                            )}>
                              {noteCategoryLabels[note.category]}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {timeAgo(note.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                            {note.content}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            {note.author}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Files Tab ──────────────────────────────── */}
            <TabsContent value="files">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Linked Files ({linkedFiles.length})
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toast.info('File linking coming soon')}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    Link File
                  </Button>
                </div>

                {linkedFiles.length === 0 ? (
                  <EmptyState
                    icon={FolderOpen}
                    title="No Linked Files"
                    description="Link panel databases, wiring diagrams, sequences, and other documents to this panel."
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.info('File linking coming soon')}
                      >
                        <Link2 className="mr-1.5 h-4 w-4" />
                        Link First File
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {linkedFiles.map((file) => (
                      <Card key={file.id}>
                        <CardContent className="flex items-center gap-3 p-4">
                          <div className="rounded-lg bg-muted p-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{file.name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {fileCategoryLabels[file.category] || file.category}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {file.fileType.toUpperCase()}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Added {timeAgo(file.addedAt)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tools Tab ──────────────────────────────── */}
            <TabsContent value="tools">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Related Tools ({relatedTools.length})
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toast.info('Tool linking coming soon')}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Tool
                  </Button>
                </div>

                {relatedTools.length === 0 ? (
                  <EmptyState
                    icon={Terminal}
                    title="No Tools Linked"
                    description="Link ping sessions, terminal profiles, register tools, and other related tools to this panel."
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.info('Tool linking coming soon')}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Link First Tool
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {relatedTools.map((tool) => {
                      const handleOpen = () => {
                        if (isTauri()) {
                          window.location.href = tool.route;
                        } else {
                          router.push(tool.route);
                        }
                      };
                      return (
                        <Card key={tool.id}>
                          <CardContent className="flex items-start gap-3 p-4">
                            <div className="rounded-lg bg-muted p-2">
                              <Network className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{tool.name}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {tool.description}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 text-xs"
                                onClick={handleOpen}
                              >
                                Open
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Add Note Dialog ────────────────────────────── */}
      <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Add a field note for {panel.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Describe the issue, fix, or observation..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={noteCategory} onValueChange={(val) => val && setNoteCategory(val as PanelNote['category'])}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(noteCategoryLabels) as [PanelNote['category'], string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="note-author">Author</Label>
                <Input
                  id="note-author"
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNote(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={!noteContent.trim()}>
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Activity Dialog ────────────────────────── */}
      <Dialog open={showAddActivity} onOpenChange={setShowAddActivity}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
            <DialogDescription>
              Log an event for {panel.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 p-5">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={activityType} onValueChange={(val) => val && setActivityType(val as PanelActivityType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(activityTypeLabels) as [PanelActivityType, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-desc">Description</Label>
              <Textarea
                id="activity-desc"
                value={activityDesc}
                onChange={(e) => setActivityDesc(e.target.value)}
                placeholder="What happened?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-author">Author</Label>
              <Input
                id="activity-author"
                value={activityAuthor}
                onChange={(e) => setActivityAuthor(e.target.value)}
                placeholder="Your name"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddActivity(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddActivity} disabled={!activityDesc.trim()}>
              Log Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
