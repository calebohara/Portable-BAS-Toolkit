'use client';

import { useState, useMemo } from 'react';
import { Search, Network, Copy, ChevronDown, AlertTriangle, Plus, Edit2, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { IpEntryDialog } from './ip-entry-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { IpPlanEntry } from '@/types';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  entries: IpPlanEntry[];
  onAddEntry: (data: Omit<IpPlanEntry, 'id'>) => Promise<IpPlanEntry>;
  onUpdateEntry: (entry: IpPlanEntry) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export function IpPlanView({ projectId, entries, onAddEntry, onUpdateEntry, onDeleteEntry }: Props) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof IpPlanEntry>('ipAddress');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<IpPlanEntry | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<IpPlanEntry | null>(null);

  // Detect duplicate IPs
  const ipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.ipAddress] = (counts[e.ipAddress] || 0) + 1;
    }
    return counts;
  }, [entries]);
  const duplicateIps = Object.entries(ipCounts).filter(([, count]) => count > 1).map(([ip]) => ip);

  const filtered = useMemo(() => {
    let result = [...entries];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.ipAddress.toLowerCase().includes(q) ||
        e.hostname.toLowerCase().includes(q) ||
        e.panel.toLowerCase().includes(q) ||
        e.vlan.toLowerCase().includes(q) ||
        e.subnet.toLowerCase().includes(q) ||
        e.deviceRole.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      if (sortField === 'ipAddress') {
        const aParts = a.ipAddress.split('.').map(Number);
        const bParts = b.ipAddress.split('.').map(Number);
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) {
            return sortDir === 'asc' ? aParts[i] - bParts[i] : bParts[i] - aParts[i];
          }
        }
        return 0;
      }
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return result;
  }, [entries, search, sortField, sortDir]);

  const handleSort = (field: keyof IpPlanEntry) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const openAdd = () => { setEditEntry(undefined); setDialogOpen(true); };
  const openEdit = (e: IpPlanEntry) => { setEditEntry(e); setDialogOpen(true); };

  const handleSave = async (data: Omit<IpPlanEntry, 'id'> | IpPlanEntry) => {
    try {
      if ('id' in data) {
        await onUpdateEntry(data as IpPlanEntry);
        toast.success(`IP ${data.ipAddress} updated`);
      } else {
        await onAddEntry(data);
        toast.success(`IP ${data.ipAddress} added`);
      }
    } catch {
      toast.error('Failed to save IP entry');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onDeleteEntry(deleteTarget.id);
      toast.success(`IP ${deleteTarget.ipAddress} deleted`);
    } catch {
      toast.error('Failed to delete IP entry');
    }
    setDeleteTarget(null);
  };

  // Summary cards
  const activeCount = entries.filter((e) => e.status === 'active').length;
  const reservedCount = entries.filter((e) => e.status === 'reserved').length;
  const subnets = [...new Set(entries.map((e) => e.subnet).filter(Boolean))];
  const vlans = [...new Set(entries.map((e) => e.vlan).filter(Boolean))];

  const SortHeader = ({ field, children }: { field: keyof IpPlanEntry; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50 whitespace-nowrap" onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && <ChevronDown className={cn('h-3 w-3', sortDir === 'desc' && 'rotate-180')} />}
      </div>
    </TableHead>
  );

  const statusColors: Record<string, string> = {
    active: 'bg-field-success/10 text-field-success',
    reserved: 'bg-field-warning/10 text-field-warning',
    available: 'bg-muted text-muted-foreground',
    conflict: 'bg-field-danger/10 text-field-danger',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">IP Plan</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{entries.length} entries</Badge>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {entries.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-field-success">{activeCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-field-warning">{reservedCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Reserved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{subnets.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Subnets</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{vlans.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">VLANs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conflict Warning */}
      {duplicateIps.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-field-danger/20 bg-field-danger/5 p-3 text-sm text-field-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>IP Conflict detected: {duplicateIps.join(', ')}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by IP, hostname, panel, VLAN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Network}
          title={search ? 'No matching entries' : 'No IP plan entries yet'}
          description={search ? 'Try a different search term.' : 'Start building your network plan by adding IP assignments for controllers and devices.'}
          action={!search ? <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="h-4 w-4" /> Add Entry</Button> : undefined}
        />
      ) : (
        <div className="rounded-lg border overflow-x-auto overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <SortHeader field="ipAddress">IP Address</SortHeader>
                <SortHeader field="hostname">Hostname</SortHeader>
                <SortHeader field="panel">Panel</SortHeader>
                <SortHeader field="vlan">VLAN</SortHeader>
                <SortHeader field="subnet">Subnet</SortHeader>
                <SortHeader field="deviceRole">Role</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <TableHead>Notes</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={cn('group', duplicateIps.includes(entry.ipAddress) && 'bg-field-danger/5')}
                >
                  <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                    <button
                      onClick={() => copyToClipboard(entry.ipAddress)}
                      className="flex items-center gap-1 text-primary hover:underline"
                      title="Copy IP"
                    >
                      {entry.ipAddress}
                      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    {duplicateIps.includes(entry.ipAddress) && (
                      <AlertTriangle className="inline h-3 w-3 ml-1 text-field-danger" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{entry.hostname}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{entry.panel}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{entry.vlan}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{entry.subnet}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{entry.deviceRole}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-[10px]', statusColors[entry.status])}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{entry.notes}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(entry)} className="rounded p-1 hover:bg-muted" title="Edit">
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => setDeleteTarget(entry)} className="rounded p-1 hover:bg-muted" title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-field-danger" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <IpEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        entry={editEntry}
        existingIps={entries.map(e => e.ipAddress)}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete IP Entry"
        description={`Are you sure you want to delete IP ${deleteTarget?.ipAddress} (${deleteTarget?.hostname})? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
