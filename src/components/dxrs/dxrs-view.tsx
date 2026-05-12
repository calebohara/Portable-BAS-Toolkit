'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronDown, FileSpreadsheet, Cpu, Download, ClipboardPaste, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import type { DxrEntry } from '@/types';
import { useProjectDxrs } from '@/hooks/use-projects';
import { DxrImportDialog } from './dxr-import-dialog';
import { DxrRowDetailDialog } from './dxr-row-detail-dialog';
import { DxrExportDialog } from './dxr-export-dialog';
import { DxrSmartPasteDialog } from './dxr-smart-paste-dialog';

// ── Column definitions ─────────────────────────────────────

interface ColDef {
  key: keyof DxrEntry;
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

const LOCALSTORAGE_KEY = 'dxrs-cols-v2';

function getDefaultVisibility(): Record<string, boolean> {
  return Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultVisible]));
}

function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      // Merge with defaults so new columns added later appear visible by default
      return { ...getDefaultVisibility(), ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return getDefaultVisibility();
}

// ── SortHeader (copied pattern from device-list-view.tsx) ──

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

// ── Display helpers ────────────────────────────────────────

function displayCell(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  return String(val);
}

// ── Props ──────────────────────────────────────────────────

interface DxrsViewProps {
  projectId: string;
  readOnly?: boolean;
}

// ── Component ──────────────────────────────────────────────

export function DxrsView({ projectId, readOnly = false }: DxrsViewProps) {
  const { dxrs, loading, refresh, bulkImport, clearAll } = useProjectDxrs(projectId);

  const [search, setSearch]             = useState('');
  const [sortField, setSortField]       = useState<keyof DxrEntry>('name');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc');
  const [colVisibility, setColVisibility] = useState<Record<string, boolean>>(getDefaultVisibility);
  const [importOpen, setImportOpen]     = useState(false);
  const [exportOpen, setExportOpen]     = useState(false);
  const [smartPasteOpen, setSmartPasteOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing]         = useState(false);
  const [detailDxr, setDetailDxr]       = useState<DxrEntry | null>(null);

  // Hydrate column visibility from localStorage after mount
  useEffect(() => {
    setColVisibility(loadVisibility());
  }, []);

  // Persist column visibility to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(colVisibility));
    } catch {
      // ignore quota errors
    }
  }, [colVisibility]);

  const visibleColumns = ALL_COLUMNS.filter((c) => colVisibility[c.key]);

  // ── Filtering ──────────────────────────────────────────────
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
    const f = field as keyof DxrEntry;
    if (sortField === f) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(f);
      setSortDir('asc');
    }
  };

  const toggleCol = (key: string) => {
    setColVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header strip */}
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
          {!readOnly && (
            <>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setClearConfirmOpen(true)}
                disabled={dxrs.length === 0}
              >
                <Trash2 className="h-4 w-4" />
                Clear All
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setSmartPasteOpen(true)}
              >
                <ClipboardPaste className="h-4 w-4" />
                Create Smart Paste
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setImportOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Import .xlsx
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search + column toggle */}
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

        {/* Columns dropdown */}
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

      {/* Empty state */}
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
              : 'Import an .xlsx export from Desigo CC.'
          }
          action={
            !search && !readOnly ? (
              <Button size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                Import .xlsx
              </Button>
            ) : undefined
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
                <TableRow
                  key={dxr.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailDxr(dxr)}
                >
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'text-xs whitespace-nowrap',
                        (col.key === 'name') && 'font-medium font-mono',
                        (col.key === 'guid') && 'font-mono text-muted-foreground max-w-32 truncate',
                        (col.key === 'description') && 'max-w-48 truncate',
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

      {/* Import dialog */}
      <DxrImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        onImported={() => { refresh(); }}
      />

      {/* Row detail dialog */}
      <DxrRowDetailDialog
        open={!!detailDxr}
        onOpenChange={(o) => { if (!o) setDetailDxr(null); }}
        dxr={detailDxr}
        readOnly={readOnly}
      />

      {/* Export dialog */}
      <DxrExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        rows={filtered as unknown as Record<string, unknown>[]}
        columns={ALL_COLUMNS.map((c) => ({ key: c.key as string, label: c.label }))}
        defaultSelectedKeys={visibleColumns.map((c) => c.key as string)}
        defaultFilename={`dxrs-export-${new Date().toISOString().slice(0, 10)}`}
      />

      {/* Smart Paste dialog */}
      <DxrSmartPasteDialog
        open={smartPasteOpen}
        onOpenChange={setSmartPasteOpen}
        projectId={projectId}
        bulkImport={bulkImport}
        onCreated={() => { refresh(); }}
      />

      {/* Clear-all confirmation */}
      <Dialog open={clearConfirmOpen} onOpenChange={(o) => { if (!clearing) setClearConfirmOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete all DXRs?</DialogTitle>
            <DialogDescription>
              This will permanently delete {dxrs.length} DXR{dxrs.length === 1 ? '' : 's'} from this project.
              The change syncs to Global Projects on the next reconcile and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 pb-1">
            <p className="text-sm text-muted-foreground">
              Source files saved in General Docs (from previous imports) are not affected.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearConfirmOpen(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  const n = await clearAll();
                  toast.success(`Deleted ${n} DXR${n === 1 ? '' : 's'}.`);
                  setClearConfirmOpen(false);
                } catch (e) {
                  toast.error(`Failed to clear DXRs: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setClearing(false);
                }
              }}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {dxrs.length} DXR{dxrs.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
