'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import type { IpPlanEntry } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  entry?: IpPlanEntry;
  existingIps: string[];
  onSave: (data: Omit<IpPlanEntry, 'id'> | IpPlanEntry) => Promise<unknown>;
}

const IP_STATUSES: IpPlanEntry['status'][] = ['active', 'reserved', 'available', 'conflict'];
const STATUS_LABELS: Record<string, string> = {
  active: 'Active', reserved: 'Reserved', available: 'Available', conflict: 'Conflict',
};

const emptyForm = {
  ipAddress: '',
  hostname: '',
  panel: '',
  vlan: '',
  subnet: '',
  deviceRole: '',
  macAddress: '',
  status: 'active' as IpPlanEntry['status'],
  notes: '',
};

export function IpEntryDialog({ open, onOpenChange, projectId, entry, existingIps, onSave }: Props) {
  const isEdit = !!entry;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [ipWarning, setIpWarning] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  useEffect(() => {
    if (open) {
      if (entry) {
        setForm({
          ipAddress: entry.ipAddress,
          hostname: entry.hostname,
          panel: entry.panel,
          vlan: entry.vlan,
          subnet: entry.subnet,
          deviceRole: entry.deviceRole,
          macAddress: entry.macAddress || '',
          status: entry.status,
          notes: entry.notes,
        });
      } else {
        setForm(emptyForm);
      }
      setIpWarning('');
      setDuplicateWarning(false);
    }
  }, [open, entry]);

  const validateIp = (ip: string) => {
    if (!ip) { setIpWarning(''); setDuplicateWarning(false); return; }
    const valid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) &&
      ip.split('.').every(o => { const n = parseInt(o); return n >= 0 && n <= 255; });
    setIpWarning(valid ? '' : 'Invalid IPv4 format');

    const isDup = existingIps.some(existing =>
      existing === ip && (!isEdit || existing !== entry?.ipAddress)
    );
    setDuplicateWarning(isDup);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ipAddress.trim() || !form.hostname.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...(isEdit ? { id: entry.id } : {}),
        projectId,
        ipAddress: form.ipAddress.trim(),
        hostname: form.hostname.trim(),
        panel: form.panel.trim(),
        vlan: form.vlan.trim(),
        subnet: form.subnet.trim(),
        deviceRole: form.deviceRole.trim(),
        macAddress: form.macAddress.trim() || undefined,
        status: form.status,
        notes: form.notes.trim(),
      };
      await onSave(data as IpPlanEntry);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit IP Entry' : 'Add IP Entry'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update IP plan entry.' : 'Add a new IP address to the network plan.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ipAddress">IP Address *</Label>
              <Input id="ipAddress" placeholder="e.g. 10.40.1.10" value={form.ipAddress} onChange={e => u('ipAddress', e.target.value)} onBlur={() => validateIp(form.ipAddress)} required />
              {ipWarning && <p className="text-xs text-field-warning">{ipWarning}</p>}
              {duplicateWarning && (
                <p className="flex items-center gap-1 text-xs text-field-warning">
                  <AlertTriangle className="h-3 w-3" /> Duplicate IP detected
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostname">Hostname *</Label>
              <Input id="hostname" placeholder="e.g. PXC36-AHU1" value={form.hostname} onChange={e => u('hostname', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel">Panel</Label>
              <Input id="panel" placeholder="e.g. BAS-P1" value={form.panel} onChange={e => u('panel', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlan">VLAN</Label>
              <Input id="vlan" placeholder="e.g. VLAN 100" value={form.vlan} onChange={e => u('vlan', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subnet">Subnet</Label>
              <Input id="subnet" placeholder="e.g. 255.255.255.0" value={form.subnet} onChange={e => u('subnet', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceRole">Device Role</Label>
              <Input id="deviceRole" placeholder="e.g. Controller" value={form.deviceRole} onChange={e => u('deviceRole', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="macAddress">MAC Address</Label>
              <Input id="macAddress" placeholder="e.g. 00:10:BC:xx:xx:xx" value={form.macAddress} onChange={e => u('macAddress', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ipStatus">Status</Label>
              <Select value={form.status} onValueChange={v => v && u('status', v)}>
                <SelectTrigger id="ipStatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IP_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ipNotes">Notes</Label>
              <Textarea id="ipNotes" placeholder="Additional notes..." value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.ipAddress.trim() || !form.hostname.trim()}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
