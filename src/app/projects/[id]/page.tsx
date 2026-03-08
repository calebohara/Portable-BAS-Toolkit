'use client';

import { useState, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft, Database, FileText, Network, Server, HardDrive,
  StickyNote, History, LayoutGrid, MapPin, Hash,
  Users, Pin, Edit2, Plus, Trash2, Phone, Mail, Building2,
  ChevronRight,
} from 'lucide-react';
import {
  useProject, useProjectFiles, useProjectNotes,
  useProjectDevices, useProjectIpPlan, useProjectActivity,
} from '@/hooks/use-projects';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge, FileStatusBadge } from '@/components/shared/status-badge';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EditProjectDialog } from '@/components/projects/edit-project-dialog';
import { ContactDialog } from '@/components/projects/contact-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DeviceListView } from '@/components/devices/device-list-view';
import { IpPlanView } from '@/components/devices/ip-plan-view';
import { FieldNotesView } from '@/components/notes/field-notes-view';
import { FileListView } from '@/components/files/file-list-view';
import { ActivityTimeline } from '@/components/projects/activity-timeline';
import { NOTE_CATEGORY_LABELS, type FileCategory, type ProjectFile, type Project, type Contact, type FieldNote, type DeviceEntry, type IpPlanEntry } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'panel-databases', label: 'Panel DBs', icon: Database },
  { id: 'wiring-diagrams', label: 'Wiring', icon: FileText },
  { id: 'sequences', label: 'Sequences', icon: FileText },
  { id: 'ip-plan', label: 'IP Plan', icon: Network },
  { id: 'device-list', label: 'Devices', icon: Server },
  { id: 'backups', label: 'Backups', icon: HardDrive },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'history', label: 'History', icon: History },
] as const;

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { project, loading, update: updateProject } = useProject(id);
  const { files, refresh: refreshFiles } = useProjectFiles(id);
  const { notes, addNote, updateNote, removeNote } = useProjectNotes(id);
  const { devices, addDevice, updateDevice, removeDevice } = useProjectDevices(id);
  const { entries: ipEntries, addIpEntry, updateIpEntry, removeIpEntry } = useProjectIpPlan(id);
  const { activity } = useProjectActivity(id);
  const [activeTab, setActiveTab] = useState('overview');

  if (loading) {
    return (
      <>
        <TopBar title="Loading..." />
        <div className="flex items-center justify-center p-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <TopBar title="Project Not Found" />
        <EmptyState
          icon={Database}
          title="Project Not Found"
          description="This project may have been deleted or the link is invalid."
          action={<Button onClick={() => router.push('/projects')} variant="outline">Back to Projects</Button>}
        />
      </>
    );
  }

  const fileCounts: Record<string, number> = {};
  for (const f of files) {
    fileCounts[f.category] = (fileCounts[f.category] || 0) + 1;
  }

  const getFilesByCategory = (cat: FileCategory) => files.filter((f) => f.category === cat);

  const handleUpdateProject = async (data: Partial<Project>) => {
    try {
      await updateProject(data);
      toast.success('Project updated');
    } catch {
      toast.error('Failed to update project');
    }
  };

  return (
    <>
      <TopBar>
        <Button variant="ghost" size="sm" onClick={() => router.push('/projects')} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Projects</span>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{project.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{project.customerName} — {project.projectNumber}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
        {project.isPinned && <Pin className="h-4 w-4 text-primary" />}
      </TopBar>

      <div className="flex flex-col lg:flex-row">
        {/* Section Tabs */}
        <div className="border-b lg:border-b-0 lg:border-r border-border lg:w-48 shrink-0">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible p-2 gap-0.5 scrollbar-thin">
            {sections.map(({ id: sectionId, label, icon: Icon }) => {
              const count = sectionId === 'device-list' ? devices.length
                : sectionId === 'ip-plan' ? ipEntries.length
                : sectionId === 'notes' ? notes.length
                : sectionId !== 'overview' && sectionId !== 'history' ? fileCounts[sectionId] || 0
                : 0;
              return (
                <button
                  key={sectionId}
                  onClick={() => setActiveTab(sectionId)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeTab === sectionId
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center text-[10px]">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 p-4 md:p-6">
          {activeTab === 'overview' && (
            <OverviewSection
              project={project}
              files={files}
              notes={notes}
              devices={devices}
              ipEntries={ipEntries}
              onNavigate={setActiveTab}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {(activeTab === 'panel-databases' || activeTab === 'wiring-diagrams' || activeTab === 'sequences' || activeTab === 'backups') && (
            <FileListView
              projectId={id}
              category={activeTab as FileCategory}
              files={getFilesByCategory(activeTab as FileCategory)}
              onRefresh={refreshFiles}
            />
          )}

          {activeTab === 'ip-plan' && (
            <IpPlanView
              projectId={id}
              entries={ipEntries}
              onAddEntry={addIpEntry}
              onUpdateEntry={updateIpEntry}
              onDeleteEntry={removeIpEntry}
            />
          )}

          {activeTab === 'device-list' && (
            <DeviceListView
              projectId={id}
              devices={devices}
              onAddDevice={addDevice}
              onUpdateDevice={updateDevice}
              onDeleteDevice={removeDevice}
            />
          )}

          {activeTab === 'notes' && (
            <FieldNotesView
              projectId={id}
              notes={notes}
              onAddNote={addNote}
              onUpdateNote={updateNote}
              onDeleteNote={removeNote}
            />
          )}

          {activeTab === 'history' && (
            <ActivityTimeline activity={activity} />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Overview Section ───────────────────────────────────────────────────────

function OverviewSection({
  project, files, notes, devices, ipEntries, onNavigate, onUpdateProject,
}: {
  project: Project;
  files: ProjectFile[];
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  onNavigate: (tab: string) => void;
  onUpdateProject: (data: Partial<Project>) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<{ contact: Contact; index: number } | undefined>();
  const [deleteContactIndex, setDeleteContactIndex] = useState<number | null>(null);
  const [editingPanelRoster, setEditingPanelRoster] = useState(false);
  const [panelRosterDraft, setPanelRosterDraft] = useState('');
  const [editingTechNotes, setEditingTechNotes] = useState(false);
  const [techNotesDraft, setTechNotesDraft] = useState('');

  const pinnedFiles = files.filter((f) => f.isPinned || f.isFavorite);
  const pinnedNotes = notes.filter((n) => n.isPinned);

  // Derived network stats from IP entries
  const networkStats = useMemo(() => {
    if (ipEntries.length === 0) return null;
    const subnets = [...new Set(ipEntries.map(e => e.subnet).filter(Boolean))];
    const vlans = [...new Set(ipEntries.map(e => e.vlan).filter(Boolean))];
    const activeCount = ipEntries.filter(e => e.status === 'active').length;
    const reservedCount = ipEntries.filter(e => e.status === 'reserved').length;
    return { total: ipEntries.length, subnets: subnets.length, vlans: vlans.length, activeCount, reservedCount };
  }, [ipEntries]);

  const handleSaveContact = (contact: Contact) => {
    const contacts = [...project.contacts];
    if (editContact) {
      contacts[editContact.index] = contact;
    } else {
      contacts.push(contact);
    }
    onUpdateProject({ contacts });
    setEditContact(undefined);
  };

  const handleDeleteContact = () => {
    if (deleteContactIndex === null) return;
    const contacts = project.contacts.filter((_, i) => i !== deleteContactIndex);
    onUpdateProject({ contacts });
    setDeleteContactIndex(null);
  };

  const savePanelRoster = () => {
    onUpdateProject({ panelRosterSummary: panelRosterDraft.trim() || undefined });
    setEditingPanelRoster(false);
  };

  const saveTechNotes = () => {
    onUpdateProject({ technicianNotes: techNotesDraft.trim() });
    setEditingTechNotes(false);
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
          <Edit2 className="h-3.5 w-3.5" /> Edit Project
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('notes')}>
          <StickyNote className="h-3.5 w-3.5" /> Add Note
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('device-list')}>
          <Server className="h-3.5 w-3.5" /> Add Device
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('ip-plan')}>
          <Network className="h-3.5 w-3.5" /> Add IP Entry
        </Button>
      </div>

      {/* Project Info + Contacts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Project Details</CardTitle>
              <button onClick={() => setEditOpen(true)} className="rounded p-1 hover:bg-muted" title="Edit">
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={Hash} label="Project #" value={project.projectNumber} />
            <InfoRow icon={Building2} label="Customer" value={project.customerName} />
            <InfoRow icon={MapPin} label="Address" value={project.siteAddress} />
            <InfoRow icon={LayoutGrid} label="Building/Area" value={project.buildingArea} />
            <InfoRow icon={History} label="Created" value={format(new Date(project.createdAt), 'MMM d, yyyy')} />
            <InfoRow icon={History} label="Updated" value={format(new Date(project.updatedAt), 'MMM d, yyyy h:mm a')} />
          </CardContent>
        </Card>

        {/* Contacts Card - always rendered */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Contacts
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setEditContact(undefined); setContactDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {project.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No contacts added. Add site contacts like GC, mechanical, or TAB.</p>
            ) : (
              <div className="space-y-3">
                {project.contacts.map((contact, i) => (
                  <div key={i} className="group flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.role}{contact.company ? ` — ${contact.company}` : ''}</p>
                      {contact.phone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{contact.phone}</p>
                      )}
                      {contact.email && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{contact.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => { setEditContact({ contact, index: i }); setContactDialogOpen(true); }} className="rounded p-1 hover:bg-muted" title="Edit">
                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => setDeleteContactIndex(i)} className="rounded p-1 hover:bg-muted" title="Delete">
                        <Trash2 className="h-3 w-3 text-field-danger" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Panel Roster & Network Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Panel Roster */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Panel Roster
              </CardTitle>
              {!editingPanelRoster && (
                <button
                  onClick={() => { setPanelRosterDraft(project.panelRosterSummary || ''); setEditingPanelRoster(true); }}
                  className="rounded p-1 hover:bg-muted" title="Edit"
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingPanelRoster ? (
              <div className="space-y-2">
                <Textarea
                  value={panelRosterDraft}
                  onChange={e => setPanelRosterDraft(e.target.value)}
                  placeholder="e.g. PXC36-AHU1, PXC36-AHU2, PXC100-Main, JACE-8000..."
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingPanelRoster(false)}>Cancel</Button>
                  <Button size="sm" onClick={savePanelRoster}>Save</Button>
                </div>
              </div>
            ) : project.panelRosterSummary ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.panelRosterSummary}</p>
            ) : (
              <button
                onClick={() => { setPanelRosterDraft(''); setEditingPanelRoster(true); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add panel roster details
              </button>
            )}
          </CardContent>
        </Card>

        {/* Network Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" /> Network Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {networkStats ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{networkStats.total}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">IPs</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{networkStats.subnets}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Subnets</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{networkStats.vlans}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">VLANs</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('ip-plan')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add IP plan entries to see network summary
              </button>
            )}
            {project.networkSummary && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">{project.networkSummary}</p>
            )}
            {networkStats && (
              <button
                onClick={() => onNavigate('ip-plan')}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View full IP plan <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Technician Notes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Technician Notes</CardTitle>
            {!editingTechNotes && (
              <button
                onClick={() => { setTechNotesDraft(project.technicianNotes || ''); setEditingTechNotes(true); }}
                className="rounded p-1 hover:bg-muted" title="Edit"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingTechNotes ? (
            <div className="space-y-2">
              <Textarea
                value={techNotesDraft}
                onChange={e => setTechNotesDraft(e.target.value)}
                placeholder="Project-level technician notes..."
                rows={4}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingTechNotes(false)}>Cancel</Button>
                <Button size="sm" onClick={saveTechNotes}>Save</Button>
              </div>
            </div>
          ) : project.technicianNotes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.technicianNotes}</p>
          ) : (
            <button
              onClick={() => { setTechNotesDraft(''); setEditingTechNotes(true); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add technician notes
            </button>
          )}
        </CardContent>
      </Card>

      {/* Quick Access: Sections Summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {[
          { key: 'panel-databases', label: 'Panel Databases', icon: Database, color: 'text-primary' },
          { key: 'wiring-diagrams', label: 'Wiring Diagrams', icon: FileText, color: 'text-blue-500' },
          { key: 'sequences', label: 'Sequences', icon: FileText, color: 'text-purple-500' },
          { key: 'ip-plan', label: 'IP Plan', icon: Network, color: 'text-green-500' },
          { key: 'device-list', label: 'Devices', icon: Server, color: 'text-amber-500' },
          { key: 'backups', label: 'Backups', icon: HardDrive, color: 'text-red-500' },
        ].map(({ key, label, icon: Icon, color }) => {
          const count = key === 'device-list' ? devices.length : key === 'ip-plan' ? ipEntries.length : files.filter((f) => f.category === key).length;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:shadow-sm hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className={cn('h-5 w-5 shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{label}</p>
                <p className="text-lg font-bold">{count}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pinned Files */}
      {pinnedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              Pinned & Favorites
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pinnedFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                <FileIcon fileType={file.fileType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{file.fileName} — {formatFileSize(file.size)}</p>
                </div>
                <FileStatusBadge status={file.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              Pinned Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pinnedNotes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{NOTE_CATEGORY_LABELS[note.category]}</Badge>
                  <span className="text-[10px] text-muted-foreground">{note.author} — {format(new Date(note.createdAt), 'MMM d, h:mm a')}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={onUpdateProject}
      />

      <ContactDialog
        open={contactDialogOpen}
        onOpenChange={(open) => { if (!open) { setContactDialogOpen(false); setEditContact(undefined); } else setContactDialogOpen(true); }}
        contact={editContact?.contact}
        onSave={handleSaveContact}
      />

      <ConfirmDialog
        open={deleteContactIndex !== null}
        onOpenChange={(open) => { if (!open) setDeleteContactIndex(null); }}
        title="Delete Contact"
        description={`Remove "${project.contacts[deleteContactIndex ?? 0]?.name}" from this project?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteContact}
      />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
