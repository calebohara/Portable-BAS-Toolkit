'use client';

import { useState, useMemo } from 'react';
import { Search, Server, ChevronDown, Copy, Plus, Edit2, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DeviceDialog } from './device-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { DeviceEntry } from '@/types';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  devices: DeviceEntry[];
  onAddDevice: (data: Omit<DeviceEntry, 'id'>) => Promise<DeviceEntry>;
  onUpdateDevice: (device: DeviceEntry) => Promise<void>;
  onDeleteDevice: (id: string) => Promise<void>;
}

export function DeviceListView({ projectId, devices, onAddDevice, onUpdateDevice, onDeleteDevice }: Props) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof DeviceEntry>('deviceName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<DeviceEntry | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<DeviceEntry | null>(null);

  const filtered = useMemo(() => {
    let result = [...devices];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.deviceName.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.system.toLowerCase().includes(q) ||
        d.panel.toLowerCase().includes(q) ||
        (d.ipAddress || '').toLowerCase().includes(q) ||
        d.floor.toLowerCase().includes(q) ||
        d.area.toLowerCase().includes(q) ||
        d.controllerType.toLowerCase().includes(q) ||
        d.notes.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return result;
  }, [devices, search, sortField, sortDir]);

  const handleSort = (field: keyof DeviceEntry) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const openAdd = () => { setEditDevice(undefined); setDialogOpen(true); };
  const openEdit = (d: DeviceEntry) => { setEditDevice(d); setDialogOpen(true); };

  const handleSave = async (data: Omit<DeviceEntry, 'id'> | DeviceEntry) => {
    try {
      if ('id' in data) {
        await onUpdateDevice(data as DeviceEntry);
        toast.success(`"${data.deviceName}" updated`);
      } else {
        await onAddDevice(data);
        toast.success(`"${data.deviceName}" added`);
      }
    } catch {
      toast.error('Failed to save device');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onDeleteDevice(deleteTarget.id);
      toast.success(`"${deleteTarget.deviceName}" deleted`);
    } catch {
      toast.error('Failed to delete device');
    }
    setDeleteTarget(null);
  };

  const SortHeader = ({ field, children }: { field: keyof DeviceEntry; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <ChevronDown className={cn('h-3 w-3 transition-transform', sortDir === 'desc' && 'rotate-180')} />
        )}
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Device List</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{devices.length} devices</Badge>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Device
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, IP, panel, system..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={cn('rounded-md px-2 py-1 text-xs font-medium transition-colors',
              viewMode === 'table' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={cn('rounded-md px-2 py-1 text-xs font-medium transition-colors',
              viewMode === 'cards' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
          >
            Cards
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Server}
          title={search ? 'No matching devices' : 'No devices yet'}
          description={search ? 'Try a different search term.' : 'Add BAS controllers, sensors, and actuators to track your project inventory.'}
          action={!search ? <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="h-4 w-4" /> Add Device</Button> : undefined}
        />
      ) : viewMode === 'table' ? (
        <div className="rounded-lg border overflow-x-auto max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <SortHeader field="deviceName">Device</SortHeader>
                <SortHeader field="description">Description</SortHeader>
                <SortHeader field="system">System</SortHeader>
                <SortHeader field="panel">Panel</SortHeader>
                <SortHeader field="controllerType">Type</SortHeader>
                <SortHeader field="ipAddress">IP Address</SortHeader>
                <SortHeader field="floor">Floor</SortHeader>
                <SortHeader field="area">Area</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((device) => (
                <TableRow key={device.id} className="group">
                  <TableCell className="font-mono text-xs font-medium whitespace-nowrap">{device.deviceName}</TableCell>
                  <TableCell className="text-xs max-w-48 truncate">{device.description}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{device.system}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{device.panel}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{device.controllerType}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {device.ipAddress ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(device.ipAddress!); }}
                        className="flex items-center gap-1 font-mono text-primary hover:underline"
                        title="Copy IP"
                      >
                        {device.ipAddress}
                        <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{device.floor}</TableCell>
                  <TableCell className="text-xs">{device.area}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn('text-[10px]',
                        device.status === 'Online' && 'bg-field-success/10 text-field-success border-field-success/20',
                        device.status === 'Offline' && 'bg-field-danger/10 text-field-danger border-field-danger/20',
                        device.status === 'Issue' && 'bg-field-warning/10 text-field-warning border-field-warning/20',
                      )}
                    >
                      {device.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(device)} className="rounded p-1 hover:bg-muted" title="Edit">
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => setDeleteTarget(device)} className="rounded p-1 hover:bg-muted" title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-field-danger" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((device) => (
            <div key={device.id} className="group rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold">{device.deviceName}</p>
                  <p className="text-xs text-muted-foreground truncate">{device.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant="secondary"
                    className={cn('text-[10px]',
                      device.status === 'Online' && 'bg-field-success/10 text-field-success',
                      device.status === 'Offline' && 'bg-field-danger/10 text-field-danger',
                      device.status === 'Issue' && 'bg-field-warning/10 text-field-warning',
                    )}
                  >
                    {device.status}
                  </Badge>
                  <button onClick={() => openEdit(device)} className="rounded p-1 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setDeleteTarget(device)} className="rounded p-1 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-field-danger" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><span className="text-muted-foreground">System:</span> {device.system}</div>
                <div><span className="text-muted-foreground">Panel:</span> {device.panel}</div>
                <div><span className="text-muted-foreground">Type:</span> {device.controllerType}</div>
                <div><span className="text-muted-foreground">Floor:</span> {device.floor}</div>
                {device.ipAddress && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">IP:</span>{' '}
                    <button
                      onClick={() => copyToClipboard(device.ipAddress!)}
                      className="font-mono text-primary hover:underline"
                    >
                      {device.ipAddress}
                    </button>
                  </div>
                )}
              </div>
              {device.notes && (
                <p className="text-xs text-muted-foreground border-t border-border pt-1.5">{device.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <DeviceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        device={editDevice}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Device"
        description={`Are you sure you want to delete "${deleteTarget?.deviceName}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
