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
import type { DeviceEntry } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  device?: DeviceEntry;
  onSave: (data: Omit<DeviceEntry, 'id'> | DeviceEntry) => Promise<unknown>;
}

const DEVICE_STATUSES = ['Online', 'Offline', 'Issue', 'Not Commissioned'] as const;

const emptyForm = {
  deviceName: '',
  description: '',
  system: '',
  panel: '',
  controllerType: '',
  instanceNumber: '',
  macAddress: '',
  ipAddress: '',
  floor: '',
  area: '',
  status: 'Online',
  notes: '',
};

export function DeviceDialog({ open, onOpenChange, projectId, device, onSave }: Props) {
  const isEdit = !!device;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [ipWarning, setIpWarning] = useState('');

  useEffect(() => {
    if (open) {
      if (device) {
        setForm({
          deviceName: device.deviceName,
          description: device.description,
          system: device.system,
          panel: device.panel,
          controllerType: device.controllerType,
          instanceNumber: device.instanceNumber || '',
          macAddress: device.macAddress || '',
          ipAddress: device.ipAddress || '',
          floor: device.floor,
          area: device.area,
          status: device.status,
          notes: device.notes,
        });
      } else {
        setForm(emptyForm);
      }
      setIpWarning('');
    }
  }, [open, device]);

  const validateIp = (ip: string) => {
    if (!ip) { setIpWarning(''); return; }
    const valid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) &&
      ip.split('.').every(o => { const n = parseInt(o); return n >= 0 && n <= 255; });
    setIpWarning(valid ? '' : 'Invalid IPv4 format');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deviceName.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...(isEdit ? { id: device.id } : {}),
        projectId,
        deviceName: form.deviceName.trim(),
        description: form.description.trim(),
        system: form.system.trim(),
        panel: form.panel.trim(),
        controllerType: form.controllerType.trim(),
        instanceNumber: form.instanceNumber.trim() || undefined,
        macAddress: form.macAddress.trim() || undefined,
        ipAddress: form.ipAddress.trim() || undefined,
        floor: form.floor.trim(),
        area: form.area.trim(),
        status: form.status,
        notes: form.notes.trim(),
      };
      await onSave(data as DeviceEntry);
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
          <DialogTitle>{isEdit ? 'Edit Device' : 'Add Device'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update device information.' : 'Add a new BAS device to this project.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="deviceName">Device Name *</Label>
              <Input id="deviceName" placeholder="e.g. AHU-1-MAT" value={form.deviceName} onChange={e => u('deviceName', e.target.value)} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" placeholder="e.g. Mixed Air Temp Sensor" value={form.description} onChange={e => u('description', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system">System</Label>
              <Input id="system" placeholder="e.g. HVAC" value={form.system} onChange={e => u('system', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel">Panel</Label>
              <Input id="panel" placeholder="e.g. BAS-P1" value={form.panel} onChange={e => u('panel', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="controllerType">Controller Type</Label>
              <Input id="controllerType" placeholder="e.g. PXC36.1-E.D" value={form.controllerType} onChange={e => u('controllerType', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instanceNumber">BACnet Instance</Label>
              <Input id="instanceNumber" placeholder="e.g. 300001" value={form.instanceNumber} onChange={e => u('instanceNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ipAddress">IP Address</Label>
              <Input id="ipAddress" placeholder="e.g. 10.40.1.10" value={form.ipAddress} onChange={e => u('ipAddress', e.target.value)} onBlur={() => validateIp(form.ipAddress)} />
              {ipWarning && <p className="text-xs text-field-warning">{ipWarning}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="macAddress">MAC Address</Label>
              <Input id="macAddress" placeholder="e.g. 00:10:BC:xx:xx:xx" value={form.macAddress} onChange={e => u('macAddress', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">Floor</Label>
              <Input id="floor" placeholder="e.g. 3rd Floor" value={form.floor} onChange={e => u('floor', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">Area</Label>
              <Input id="area" placeholder="e.g. Mech Room 104" value={form.area} onChange={e => u('area', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => v && u('status', v)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Additional notes..." value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.deviceName.trim()}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
