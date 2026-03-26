'use client';

import { useState, useEffect } from 'react';
import { Globe, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/use-projects';
import {
  buildUrl, isValidHost, isValidPort,
  type WebEndpoint, type Protocol, type OpenMode, type ControllerFamily, type AccessMethod,
} from '@/store/web-interface-store';

// ─── URL Preview ─────────────────────────────────────────────
function UrlPreview({ protocol, host, port, path }: {
  protocol: Protocol; host: string; port: string; path: string;
}) {
  const url = host ? buildUrl({ protocol, host, port, path }) : '';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await copyToClipboard(url);
      setCopied(true);
      toast.success('URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard access denied');
    }
  };

  if (!host) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <code className="flex-1 text-xs font-mono text-foreground truncate">{url}</code>
      <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground p-0.5">
        {copied ? <Check className="h-3.5 w-3.5 text-field-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// Re-export for use in the main page
export { UrlPreview };

export function createBlankEndpoint(): WebEndpoint {
  return {
    id: crypto.randomUUID(),
    friendlyName: '',
    host: '',
    protocol: 'https',
    port: '',
    path: '',
    projectId: '',
    panelName: '',
    systemName: '',
    controllerFamily: '',
    accessMethod: '',
    accessMethodNote: '',
    notes: '',
    tags: [],
    createdAt: '',
    updatedAt: '',
    lastOpenedAt: '',
    preferredOpenMode: 'auto',
    favorite: false,
    lastKnownEmbedSupport: 'unknown',
  };
}

export function EndpointEditDialog({ open, onOpenChange, endpoint, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: WebEndpoint | null;
  onSave: (ep: WebEndpoint) => void;
}) {
  const { projects } = useProjects();
  const [form, setForm] = useState<WebEndpoint>(
    endpoint || createBlankEndpoint()
  );

  // Re-sync form when endpoint prop changes (different endpoint opened)
  useEffect(() => {
    setForm(endpoint || createBlankEndpoint());
  }, [endpoint]);

  const handleSave = () => {
    if (!form.host.trim()) {
      toast.error('Host/IP is required');
      return;
    }
    if (!isValidHost(form.host.trim())) {
      toast.error('Invalid host/IP address');
      return;
    }
    if (!isValidPort(form.port)) {
      toast.error('Port must be 1–65535');
      return;
    }
    const now = new Date().toISOString();
    onSave({
      ...form,
      updatedAt: now,
      createdAt: endpoint ? form.createdAt : now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{endpoint ? 'Edit Endpoint' : 'Save Endpoint'}</DialogTitle>
            <DialogDescription>Configure a saved panel web interface endpoint.</DialogDescription>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-3 px-5 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Friendly Name</Label>
                <Input
                  value={form.friendlyName}
                  onChange={e => setForm(f => ({ ...f, friendlyName: e.target.value }))}
                  placeholder="AHU-1 PXC Panel"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Host / IP Address</Label>
                <Input
                  value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder="192.168.1.50"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Protocol</Label>
                  <Select value={form.protocol} onValueChange={v => v && setForm(f => ({ ...f, protocol: v as Protocol }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input
                    value={form.port}
                    onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="443"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Path / Endpoint</Label>
                <Input
                  value={form.path}
                  onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                  placeholder="/login"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Panel / Controller Name</Label>
                <Input
                  value={form.panelName}
                  onChange={e => setForm(f => ({ ...f, panelName: e.target.value }))}
                  placeholder="PXC36-AHU1"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">System</Label>
                <Input
                  value={form.systemName}
                  onChange={e => setForm(f => ({ ...f, systemName: e.target.value }))}
                  placeholder="HVAC"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Controller Family</Label>
                <Select value={form.controllerFamily || '_none'} onValueChange={v => v && setForm(f => ({ ...f, controllerFamily: (v === '_none' ? '' : v) as ControllerFamily }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not specified</SelectItem>
                    <SelectItem value="siemens-pxc">Siemens PXC</SelectItem>
                    <SelectItem value="tridium">Tridium / Niagara</SelectItem>
                    <SelectItem value="honeywell">Honeywell</SelectItem>
                    <SelectItem value="schneider">Schneider Electric</SelectItem>
                    <SelectItem value="johnson-controls">Johnson Controls</SelectItem>
                    <SelectItem value="distech">Distech Controls</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Access Method</Label>
                <Select value={form.accessMethod || '_none'} onValueChange={v => v && setForm(f => ({ ...f, accessMethod: (v === '_none' ? '' : v) as AccessMethod }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not specified</SelectItem>
                    <SelectItem value="wlan-svc">WLAN / SVC Port</SelectItem>
                    <SelectItem value="wan-tool-port">WAN / Tool Port</SelectItem>
                    <SelectItem value="building-lan">Building LAN</SelectItem>
                    <SelectItem value="vpn-remote">VPN / Remote</SelectItem>
                    <SelectItem value="direct-connect">Direct Connect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Project</Label>
                <Select value={form.projectId || '_none'} onValueChange={v => v && setForm(f => ({ ...f, projectId: v === '_none' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Open Mode</Label>
                <Select value={form.preferredOpenMode} onValueChange={v => v && setForm(f => ({ ...f, preferredOpenMode: v as OpenMode }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (try embed, fallback)</SelectItem>
                    <SelectItem value="embedded">Embedded View</SelectItem>
                    <SelectItem value="new-tab">New Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Login credentials managed separately. Default path /login. Self-signed cert..."
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>
            </div>
            <UrlPreview protocol={form.protocol} host={form.host} port={form.port} path={form.path} />
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>{endpoint ? 'Save Changes' : 'Save Endpoint'}</Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
