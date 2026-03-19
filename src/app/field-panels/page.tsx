'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Server, Copy, ExternalLink, ChevronDown,
  Filter, ArrowUpDown, Loader2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { copyToClipboard } from '@/lib/utils';
import { isTauri } from '@/lib/tauri-bridge';
import { useFieldPanels } from '@/hooks/use-field-panels';
import type { FieldPanel, PanelStatus, PanelNetworkType } from '@/types';

// ─── Helper Functions ──────────────────────────────────────

function getStatusColor(status: PanelStatus): string {
  const colors: Record<PanelStatus, string> = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    warning: 'bg-yellow-500',
    error: 'bg-orange-500',
    commissioning: 'bg-blue-500',
    unknown: 'bg-gray-500',
  };
  return colors[status];
}

function getStatusBadgeVariant(status: PanelStatus) {
  const variants: Record<PanelStatus, string> = {
    online: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    offline: 'bg-red-500/10 text-red-500 border-red-500/20',
    warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    error: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    commissioning: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    unknown: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  return variants[status];
}

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

// ─── Constants ─────────────────────────────────────────────

const CONTROLLER_FAMILIES = [
  'Siemens PXC', 'Tridium', 'Honeywell', 'Schneider Electric',
  'Johnson Controls', 'Distech', 'Other',
] as const;

const NETWORK_TYPES: PanelNetworkType[] = ['IP', 'MSTP', 'LON', 'Modbus', 'Other'];

const STATUS_OPTIONS: PanelStatus[] = [
  'online', 'offline', 'warning', 'error', 'commissioning', 'unknown',
];

type SortKey = 'name' | 'site' | 'status' | 'lastSeen' | 'updatedAt';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'site', label: 'Site' },
  { value: 'status', label: 'Status' },
  { value: 'lastSeen', label: 'Last Seen' },
  { value: 'updatedAt', label: 'Updated' },
];

// ─── Add Panel Form State ──────────────────────────────────

interface AddPanelForm {
  name: string;
  site: string;
  building: string;
  floor: string;
  system: string;
  equipment: string;
  controllerFamily: string;
  model: string;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  bacnetInstance: string;
  macAddress: string;
  networkType: PanelNetworkType;
  webUiUrl: string;
  secureWebUiUrl: string;
  assignedTechnician: string;
  tags: string;
}

const INITIAL_FORM: AddPanelForm = {
  name: '',
  site: '',
  building: '',
  floor: '',
  system: '',
  equipment: '',
  controllerFamily: '',
  model: '',
  ipAddress: '',
  subnetMask: '255.255.255.0',
  gateway: '',
  bacnetInstance: '',
  macAddress: '',
  networkType: 'IP',
  webUiUrl: '',
  secureWebUiUrl: '',
  assignedTechnician: '',
  tags: '',
};

// ─── Main Page Component ───────────────────────────────────

export default function FieldPanelsPage() {
  const router = useRouter();
  const { panels, loading, addPanel } = useFieldPanels();

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PanelStatus | 'all'>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [showFilters, setShowFilters] = useState(false);

  // Add panel dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<AddPanelForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Derived filter options
  const sites = useMemo(() => {
    const s = new Set(panels.map((p) => p.site));
    return Array.from(s).sort();
  }, [panels]);

  const families = useMemo(() => {
    const f = new Set(panels.map((p) => p.controllerFamily).filter(Boolean));
    return Array.from(f).sort();
  }, [panels]);

  // Filtered + sorted panels
  const filteredPanels = useMemo(() => {
    let result = [...panels];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.site.toLowerCase().includes(q) ||
        p.building.toLowerCase().includes(q) ||
        (p.ipAddress ?? '').toLowerCase().includes(q) ||
        (p.equipment ?? '').toLowerCase().includes(q) ||
        (p.controllerFamily ?? '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.panelStatus === statusFilter);
    }

    // Site filter
    if (siteFilter !== 'all') {
      result = result.filter((p) => p.site === siteFilter);
    }

    // Family filter
    if (familyFilter !== 'all') {
      result = result.filter((p) => p.controllerFamily === familyFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'site':
          return a.site.localeCompare(b.site);
        case 'status':
          return a.panelStatus.localeCompare(b.panelStatus);
        case 'lastSeen':
          return (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '');
        case 'updatedAt':
          return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
        default:
          return 0;
      }
    });

    return result;
  }, [panels, searchQuery, statusFilter, siteFilter, familyFilter, sortBy]);

  // Navigation
  const navigateToPanel = useCallback((id: string) => {
    const url = `/field-panels/_/?_id=${id}`;
    if (isTauri()) {
      window.location.href = url;
    } else {
      router.push(url);
    }
  }, [router]);

  // Copy helpers
  const handleCopy = useCallback((text: string, label: string) => {
    copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  }, []);

  // Form change handler
  const updateForm = useCallback((field: keyof AddPanelForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-fill web UI URLs from IP
      if (field === 'ipAddress' && value) {
        next.webUiUrl = `http://${value}`;
        next.secureWebUiUrl = `https://${value}`;
      }
      return next;
    });
  }, []);

  // Submit new panel
  const handleAddPanel = useCallback(async () => {
    if (!form.name.trim() || !form.site.trim()) {
      toast.error('Name and Site are required');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const bacnetNum = form.bacnetInstance.trim() ? parseInt(form.bacnetInstance.trim(), 10) : null;
      const panel: FieldPanel = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        site: form.site.trim(),
        building: form.building.trim(),
        floor: form.floor.trim(),
        system: form.system.trim(),
        equipment: form.equipment.trim(),
        controllerFamily: form.controllerFamily,
        model: form.model.trim(),
        ipAddress: form.ipAddress.trim(),
        subnetMask: form.subnetMask.trim(),
        gateway: form.gateway.trim(),
        bacnetInstance: Number.isNaN(bacnetNum) ? null : bacnetNum,
        macAddress: form.macAddress.trim(),
        networkType: form.networkType,
        firmwareVersion: '',
        applicationVersion: '',
        panelStatus: 'unknown',
        webUiUrl: form.webUiUrl.trim(),
        secureWebUiUrl: form.secureWebUiUrl.trim(),
        lastSeenAt: null,
        lastBackupAt: null,
        lastCommissionedAt: null,
        assignedTechnician: form.assignedTechnician.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: [],
        activities: [],
        linkedFiles: [],
        relatedTools: [],
        createdAt: now,
        updatedAt: now,
      };
      await addPanel(panel);
      setForm(INITIAL_FORM);
      setAddDialogOpen(false);
    } catch {
      // addPanel hook already shows error toast
    } finally {
      setSaving(false);
    }
  }, [form, addPanel]);

  // Active filter count
  const activeFilterCount = [
    statusFilter !== 'all',
    siteFilter !== 'all',
    familyFilter !== 'all',
  ].filter(Boolean).length;

  if (loading) {
    return (
      <>
        <TopBar title="Field Panels" />
        <div className="flex items-center justify-center p-16" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Field Panels" />
      <div className="p-4 md:p-6 space-y-4 overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Field Panels</h1>
            <Badge variant="secondary" className="tabular-nums">
              {panels.length}
            </Badge>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Panel
          </Button>
        </div>

        {/* Search + Filter Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, site, building, IP, equipment, controller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground text-primary text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(v) => { if (v) setStatusFilter(v as PanelStatus | 'all'); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${getStatusColor(s)}`} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Site Filter */}
            <Select
              value={siteFilter}
              onValueChange={(v) => { if (v) setSiteFilter(v); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Family Filter */}
            <Select
              value={familyFilter}
              onValueChange={(v) => { if (v) setFamilyFilter(v); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Controller Family" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Controllers</SelectItem>
                {families.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <div className="flex items-center gap-1.5 ml-auto">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={sortBy}
                onValueChange={(v) => { if (v) setSortBy(v as SortKey); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setStatusFilter('all');
                  setSiteFilter('all');
                  setFamilyFilter('all');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {/* Results count */}
        {(searchQuery || activeFilterCount > 0) && (
          <p className="text-xs text-muted-foreground">
            Showing {filteredPanels.length} of {panels.length} panels
          </p>
        )}

        {/* Panel Grid or Empty State */}
        {panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <div className="rounded-xl bg-muted p-4 mb-4">
              <Server className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No field panels yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Add your first panel to get started
            </p>
            <div className="flex items-center gap-3">
              <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Panel
              </Button>
            </div>
          </div>
        ) : filteredPanels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No panels match your search</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPanels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                onNavigate={navigateToPanel}
                onCopy={handleCopy}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Panel Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Field Panel</DialogTitle>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            {/* Name + Site (required) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input
                  placeholder="AHU-1 Panel"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Site *</label>
                <Input
                  placeholder="Main Campus"
                  value={form.site}
                  onChange={(e) => updateForm('site', e.target.value)}
                />
              </div>
            </div>

            {/* Building + Floor */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Building</label>
                <Input
                  placeholder="Building A"
                  value={form.building}
                  onChange={(e) => updateForm('building', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Floor</label>
                <Input
                  placeholder="1st Floor"
                  value={form.floor}
                  onChange={(e) => updateForm('floor', e.target.value)}
                />
              </div>
            </div>

            {/* System + Equipment */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">System</label>
                <Input
                  placeholder="HVAC"
                  value={form.system}
                  onChange={(e) => updateForm('system', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Equipment</label>
                <Input
                  placeholder="AHU-1"
                  value={form.equipment}
                  onChange={(e) => updateForm('equipment', e.target.value)}
                />
              </div>
            </div>

            {/* Controller Family + Model */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Controller Family</label>
                <Select
                  value={form.controllerFamily || undefined}
                  onValueChange={(v) => { if (v) updateForm('controllerFamily', v); }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select controller..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROLLER_FAMILIES.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <Input
                  placeholder="PXC36-E.D"
                  value={form.model}
                  onChange={(e) => updateForm('model', e.target.value)}
                />
              </div>
            </div>

            {/* IP Address + Subnet + Gateway */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">IP Address</label>
                <Input
                  placeholder="192.168.1.100"
                  value={form.ipAddress}
                  onChange={(e) => updateForm('ipAddress', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subnet Mask</label>
                <Input
                  placeholder="255.255.255.0"
                  value={form.subnetMask}
                  onChange={(e) => updateForm('subnetMask', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Gateway</label>
                <Input
                  placeholder="192.168.1.1"
                  value={form.gateway}
                  onChange={(e) => updateForm('gateway', e.target.value)}
                />
              </div>
            </div>

            {/* BACnet + MAC + Network Type */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">BACnet Instance</label>
                <Input
                  placeholder="100"
                  value={form.bacnetInstance}
                  onChange={(e) => updateForm('bacnetInstance', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">MAC Address</label>
                <Input
                  placeholder="00:1A:2B:3C:4D:5E"
                  value={form.macAddress}
                  onChange={(e) => updateForm('macAddress', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Network Type</label>
                <Select
                  value={form.networkType}
                  onValueChange={(v) => { if (v) updateForm('networkType', v); }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {NETWORK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Web UI URLs */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Web UI URL</label>
                <Input
                  placeholder="http://192.168.1.100"
                  value={form.webUiUrl}
                  onChange={(e) => updateForm('webUiUrl', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Secure Web UI URL</label>
                <Input
                  placeholder="https://192.168.1.100"
                  value={form.secureWebUiUrl}
                  onChange={(e) => updateForm('secureWebUiUrl', e.target.value)}
                />
              </div>
            </div>

            {/* Technician + Tags */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Assigned Technician</label>
                <Input
                  placeholder="John Smith"
                  value={form.assignedTechnician}
                  onChange={(e) => updateForm('assignedTechnician', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
                <Input
                  placeholder="hvac, ahu, floor-1"
                  value={form.tags}
                  onChange={(e) => updateForm('tags', e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-1.5" disabled={saving} onClick={handleAddPanel}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Panel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Panel Card Component ──────────────────────────────────

function PanelCard({
  panel,
  onNavigate,
  onCopy,
}: {
  panel: FieldPanel;
  onNavigate: (id: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const locationParts = [panel.site, panel.building, panel.floor].filter(Boolean);
  const bacnetStr = panel.bacnetInstance != null ? String(panel.bacnetInstance) : '';

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:shadow-md hover:border-primary/20 cursor-pointer"
      onClick={() => onNavigate(panel.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(panel.id);
        }
      }}
    >
      {/* Status stripe on left edge */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusColor(panel.panelStatus)}`} />

      <div className="pl-4 pr-3 py-3 space-y-2.5">
        {/* Header: Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{panel.name}</h3>
            {locationParts.length > 0 && (
              <p className="text-xs text-muted-foreground truncate">
                {locationParts.join(' > ')}
              </p>
            )}
          </div>
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeVariant(panel.panelStatus)}`}>
            {panel.panelStatus.charAt(0).toUpperCase() + panel.panelStatus.slice(1)}
          </span>
        </div>

        {/* System + Equipment */}
        {(panel.system || panel.equipment) && (
          <div className="flex flex-wrap gap-1.5">
            {panel.system && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {panel.system}
              </span>
            )}
            {panel.equipment && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {panel.equipment}
              </span>
            )}
          </div>
        )}

        {/* Controller info */}
        {(panel.controllerFamily || panel.model) && (
          <p className="text-xs text-muted-foreground truncate">
            Controller: {[panel.controllerFamily, panel.model].filter(Boolean).join(' - ')}
          </p>
        )}

        {/* Network details */}
        <div className="space-y-1 text-xs">
          {panel.ipAddress && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate">
                IP: <span className="font-mono text-foreground">{panel.ipAddress}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(panel.ipAddress, 'IP address');
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy IP address"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
          {bacnetStr && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate">
                BACnet: <span className="font-mono text-foreground">{bacnetStr}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(bacnetStr, 'BACnet instance');
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy BACnet instance"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
          {panel.firmwareVersion && (
            <p className="text-muted-foreground">
              Firmware: <span className="text-foreground">{panel.firmwareVersion}</span>
            </p>
          )}
        </div>

        {/* Last seen */}
        <p className="text-[10px] text-muted-foreground/70">
          Last seen: {timeAgo(panel.lastSeenAt)}
        </p>

        {/* Tags */}
        {panel.tags && panel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {panel.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {tag}
              </span>
            ))}
            {panel.tags.length > 4 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                +{panel.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(panel.id);
            }}
          >
            <ChevronDown className="h-3 w-3" />
            Details
          </Button>
          {panel.webUiUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 flex-1"
              onClick={(e) => {
                e.stopPropagation();
                window.open(panel.webUiUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-3 w-3" />
              Web UI
            </Button>
          )}
          {panel.ipAddress && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(panel.ipAddress, 'IP');
              }}
            >
              <Copy className="h-3 w-3" />
              IP
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
