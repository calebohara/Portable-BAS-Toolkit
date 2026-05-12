'use client';

import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DxrEntry } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dxr: DxrEntry | null;
  readOnly?: boolean;
  onSave?: (dxr: DxrEntry) => Promise<void>;
}

const FIELD_LABELS: Array<{ key: keyof DxrEntry; label: string }> = [
  { key: 'name',                 label: 'Name' },
  { key: 'location',             label: 'Location' },
  { key: 'description',          label: 'Description' },
  { key: 'deviceInstanceNumber', label: 'Device Instance Number' },
  { key: 'equipmentId',          label: 'Equipment ID' },
  { key: 'serialNumber',         label: 'Serial Number' },
  { key: 'applicationTemplate',  label: 'Application Template' },
  { key: 'applicationNumber',    label: 'Application Number' },
  { key: 'network',              label: 'Network' },
  { key: 'autoAddressing',       label: 'Auto Addressing' },
  { key: 'macAddress',           label: 'MAC Address' },
  { key: 'maxManagerAddress',    label: 'Max. Manager Address' },
  { key: 'baudRate',             label: 'Baud Rate' },
  { key: 'roomHierarchy',        label: 'Room Hierarchy' },
  { key: 'roomName',             label: 'Room Name' },
  { key: 'roomDescription',      label: 'Room Description' },
  { key: 'segmentHierarchy',     label: 'Segment Hierarchy' },
  { key: 'segmentName',          label: 'Segment Name' },
  { key: 'segmentDescription',   label: 'Segment Description' },
  { key: 'msTpNwId',             label: 'MS/TP NW ID' },
  { key: 'guid',                 label: 'GUID' },
];

function displayValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}

export function DxrRowDetailDialog({ open, onOpenChange, dxr, readOnly = true }: Props) {
  if (!dxr) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dxr.name ?? 'DXR Entry'}</DialogTitle>
          <DialogDescription>
            {readOnly ? 'Read-only view of all 21 DXR fields.' : 'Edit DXR entry fields.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-5 pb-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`dxr-detail-${key}`} className="text-xs text-muted-foreground">
                  {label}
                </Label>
                <Input
                  id={`dxr-detail-${key}`}
                  value={displayValue(dxr[key])}
                  readOnly
                  disabled={readOnly}
                  className="h-8 text-xs font-mono"
                />
              </div>
            ))}
          </div>

          {/* Metadata row */}
          <div className="mt-4 border-t border-border pt-3 grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div><span className="font-medium">Created:</span> {dxr.createdAt ? new Date(dxr.createdAt).toLocaleString() : '—'}</div>
            <div><span className="font-medium">Updated:</span> {dxr.updatedAt ? new Date(dxr.updatedAt).toLocaleString() : '—'}</div>
            {dxr.importedFromFileId && (
              <div className="sm:col-span-2">
                <span className="font-medium">Imported from file:</span> {dxr.importedFromFileId}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
