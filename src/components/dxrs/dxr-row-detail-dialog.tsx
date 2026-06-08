'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { DxrEntry } from '@/types';
import { coerceStringField, coerceNumberField, coerceTriState, type DxrTriState } from './dxr-coerce';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dxr: DxrEntry | null;
  readOnly?: boolean;
  onSave?: (dxr: DxrEntry) => Promise<void>;
}

type EditableKey = keyof DxrEntry;

// Source columns stored as numbers — parsed/validated on save.
const NUMBER_KEYS = new Set<EditableKey>([
  'deviceInstanceNumber', 'applicationNumber', 'network',
  'macAddress', 'maxManagerAddress', 'baudRate',
]);

// Boolean tri-state column.
const BOOLEAN_KEY: EditableKey = 'autoAddressing';

const FIELD_LABELS: Array<{ key: EditableKey; label: string }> = [
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
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  return String(val);
}

function toTriState(val: boolean | null | undefined): DxrTriState {
  if (val === true) return 'true';
  if (val === false) return 'false';
  return 'null';
}

type FormState = Record<string, string>;

function hydrate(dxr: DxrEntry): FormState {
  const f: FormState = {};
  for (const { key } of FIELD_LABELS) {
    if (key === BOOLEAN_KEY) {
      f[key] = toTriState(dxr[key] as boolean | null);
    } else {
      const v = dxr[key];
      f[key] = v === null || v === undefined ? '' : String(v);
    }
  }
  return f;
}

export function DxrRowDetailDialog({ open, onOpenChange, dxr, readOnly = true, onSave }: Props) {
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && dxr) {
      setForm(hydrate(dxr));
    }
  }, [open, dxr]);

  if (!dxr) return null;

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const coerced: Partial<DxrEntry> = {};
      for (const { key } of FIELD_LABELS) {
        // guid is the Desigo dedup identity key — never editable.
        if (key === 'guid') continue;
        if (key === BOOLEAN_KEY) {
          coerced.autoAddressing = coerceTriState(form[key] as DxrTriState);
        } else if (NUMBER_KEYS.has(key)) {
          (coerced as Record<string, unknown>)[key] = coerceNumberField(form[key]);
        } else {
          (coerced as Record<string, unknown>)[key] = coerceStringField(form[key]);
        }
      }
      const updated: DxrEntry = { ...dxr, ...coerced };
      await onSave(updated);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const editable = !readOnly && !!onSave;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dxr.name ?? 'DXR Entry'}</DialogTitle>
          <DialogDescription>
            {editable ? 'Edit DXR entry fields.' : 'Read-only view of all 21 DXR fields.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-5 pb-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map(({ key, label }) => {
              const id = `dxr-detail-${key}`;
              const isGuid = key === 'guid';
              const isBool = key === BOOLEAN_KEY;
              const isNumber = NUMBER_KEYS.has(key);

              // Read-only rendering (whole dialog read-only, OR the guid field).
              if (!editable || isGuid) {
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      id={id}
                      value={editable && isBool
                        ? displayValue(form[key] === 'true' ? true : form[key] === 'false' ? false : null)
                        : displayValue(editable ? form[key] : dxr[key])}
                      readOnly
                      disabled
                      className="h-8 text-xs font-mono"
                    />
                    {editable && isGuid && (
                      <p className="text-[10px] text-muted-foreground">Desigo identity — not editable.</p>
                    )}
                  </div>
                );
              }

              // Editable: tri-state boolean.
              if (isBool) {
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
                    <Select value={form[key] ?? 'null'} onValueChange={v => v && u(key, v)}>
                      <SelectTrigger id={id} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="null">— (unset)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              // Editable: text / numeric input.
              return (
                <div key={key} className="space-y-1">
                  <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    id={id}
                    value={form[key] ?? ''}
                    onChange={e => u(key, e.target.value)}
                    inputMode={isNumber ? 'numeric' : undefined}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              );
            })}
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
          {editable ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
