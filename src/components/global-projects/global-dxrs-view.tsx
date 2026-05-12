'use client';

/**
 * GlobalDxrsView
 *
 * Thin read-only wrapper around DxrsView behaviour, driven by the global DXR
 * hook. Uses a local adapter to convert GlobalDxrEntry → DxrEntry shape so the
 * shared table rendering logic remains in DxrsView.
 *
 * No Import button is shown (readOnly is always true here).
 */

import { useState, useMemo } from 'react';
import { Search, ChevronDown, Cpu, Download } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DxrExportDialog } from '@/components/dxrs/dxr-export-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { GlobalDxrEntry } from '@/types/global-projects';
import { useGlobalProjectDxrs } from '@/hooks/use-global-projects';

// ── Column definitions (mirror dxrs-view.tsx) ──────────────

interface ColDef {
  key: keyof GlobalDxrEntry;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'name',                 label: 'Name',                     defaultVisible: true },
  { key: 'description',          label: 'Description',               defaultVisible: true },
  { key: 'deviceInstanceNumber', label: 'Device Instance #',         defaultVisible: true },
  { key: 'macAddress',           label: 'MAC Address',               defaultVisible: true },
  { key: 'network',              label: 'Network',                   defaultVisible: true },
  { key: 'applicationTemplate',  label: 'Application Template',      defaultVisible: true },
  { key: 'location',             label: 'Location',                  defaultVisible: true },
  { key: 'equipmentId',          label: 'Equipment ID',              defaultVisible: true },
  { key: 'serialNumber',         label: 'Serial Number',             defaultVisible: true },
  { key: 'applicationNumber',    label: 'Application Number',        defaultVisible: true },
  { key: 'autoAddressing',       label: 'Auto Addressing',           defaultVisible: true },
  { key: 'maxManagerAddress',    label: 'Max. Manager Address',      defaultVisible: true },
  { key: 'baudRate',             label: 'Baud Rate',                 defaultVisible: true },
  { key: 'roomHierarchy',        label: 'Room Hierarchy',            defaultVisible: true },
  { key: 'roomName',             label: 'Room Name',                 defaultVisible: true },
  { key: 'roomDescription',      label: 'Room Description',          defaultVisible: true },
  { key: 'segmentHierarchy',     label: 'Segment Hierarchy',         defaultVisible: true },
  { key: 'segmentName',          label: 'Segment Name',              defaultVisible: true },
  { key: 'segmentDescription',   label: 'Segment Description',       defaultVisible: true },
  { key: 'msTpNwId',             label: 'MS/TP NW ID',               defaultVisible: true },
  { key: 'guid',                 label: 'GUID',                      defaultVisible: true },
];

const GLOBAL_LOCALSTORAGE_KEY = 'global-dxrs-cols-v2';

function getDefaultVisibility(): Record<string, boolean> {
  return Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultVisible]));
}

function loadVisibility(): Record<string, boolean> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GLOBAL_LOCALSTORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return { ...getDefaultVisibility(), ...parsed };
    }
  } catch {
    // ignore
  }
  return getDefaultVisibility();
}

// ── SortHeader ─────────────────────────────────────────────

function SortHeader({ field, sortField, sortDir, onSort, children }: {
  field: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 whitespace-nowrap"
      onClick={() => onSort(field)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(field); } }}
      tabIndex={0}
      role="columnheader"
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <ChevronDown className={cn('h-3 w-3 transition-transform', sortDir === 'desc' && 'rotate-180')} />
        )}
      </div>
    </TableHead>
  );
}

function displayCell(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  return String(val);
}

// ── Props ──────────────────────────────────────────────────

interface GlobalDxrsViewProps {
  /** global project ID */
  projectId: string;
}

// ── Component ──────────────────────────────────────────────

export function GlobalDxrsView({ projectId }: GlobalDxrsViewProps) {
  const { dxrs, loading } = useGlobalProjectDxrs(projectId);

  const [search, setSearch]             = useState('');
  const [sortField, setSortField]       = useState<keyof GlobalDxrEntry>('name');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc');
  const [colVisibility, setColVisibility] = useState<Record<string, boolean>>(loadVisibility);
  const [exportOpen, setExportOpen]     = useState(false);

  const visibleColumns = ALL_COLUMNS.filter((c) => colVisibility[c.key]);

  const filtered = useMemo(() => {
    let result = [...dxrs];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        (d.equipmentId ?? '').toLowerCase().includes(q) ||
        (d.guid ?? '').toLowerCase().includes(q) ||
        (d.roomName ?? '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const aVal = displayCell(a[sortField]).toLowerCase();
      const bVal = displayCell(b[sortField]).toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return result;
  }, [dxrs, search, sortField, sortDir]);

  const handleSort = (field: string) => {
    const f = field as keyof GlobalDxrEntry;
    if (sortField === f) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(f);
      setSortDir('asc');
    }
  };

  const toggleCol = (key: string) => {
    setColVisibility((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(GLOBAL_LOCALSTORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">DXRs</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{dxrs.length} rows</Badge>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setExportOpen(true)}
            disabled={dxrs.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, description, equipment ID, GUID, room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground shrink-0">
            Columns
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={!!colVisibility[col.key]}
                onCheckedChange={() => toggleCol(col.key)}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Loading DXRs...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title={search ? 'No matching DXRs' : 'No DXRs yet'}
          description={
            search
              ? 'Try a different search term.'
              : 'DXRs will appear here once synced from a local project.'
          }
        />
      ) : (
        <Table
          containerClassName="rounded-lg border max-h-[70vh] overflow-y-auto"
          className="min-w-max"
        >
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {visibleColumns.map((col) => (
                  <SortHeader
                    key={col.key}
                    field={col.key}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    {col.label}
                  </SortHeader>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((dxr) => (
                <TableRow key={dxr.id}>
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'text-xs whitespace-nowrap',
                        col.key === 'name' && 'font-medium font-mono',
                        col.key === 'guid' && 'font-mono text-muted-foreground max-w-32 truncate',
                        col.key === 'description' && 'max-w-48 truncate',
                      )}
                    >
                      {displayCell(dxr[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
        </Table>
      )}

      {/* Export dialog */}
      <DxrExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        rows={filtered as unknown as Record<string, unknown>[]}
        columns={ALL_COLUMNS.map((c) => ({ key: c.key as string, label: c.label }))}
        defaultSelectedKeys={visibleColumns.map((c) => c.key as string)}
        defaultFilename={`dxrs-export-${new Date().toISOString().slice(0, 10)}`}
      />
    </div>
  );
}
