'use client';

import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import {
  Globe, ExternalLink, Star, Copy, Check, Trash2, Edit, RefreshCw,
  Plus, ChevronDown, ChevronUp, AlertTriangle, Shield, X,
  Clock, Play, Bookmark, Info, Download, Search,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { openUrl } from '@/lib/tauri-bridge';
import { toast } from 'sonner';
import {
  useWebInterfaceStore,
  buildUrl, isSafeUrl, isValidHost, isValidPort,
  type WebEndpoint, type Protocol, type OpenMode,
} from '@/store/web-interface-store';
import { useProjects } from '@/hooks/use-projects';

// ─── URL Preview ─────────────────────────────────────────────
function UrlPreview({ protocol, host, port, path }: {
  protocol: Protocol; host: string; port: string; path: string;
}) {
  const url = host ? buildUrl({ protocol, host, port, path }) : '';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('URL copied');
    setTimeout(() => setCopied(false), 1500);
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

// ─── Security Guidance ───────────────────────────────────────
function SecurityGuidance() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
      >
        <Shield className="h-3.5 w-3.5" />
        <span>Browser Security & Embedding Limitations</span>
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="text-xs text-muted-foreground space-y-2 pt-1">
          <div className="space-y-1">
            <p className="font-medium text-foreground">Why embedded view may not work:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li><strong>X-Frame-Options / CSP headers</strong> — Most panel web interfaces deny embedding via iframe. This is a server-side security setting we cannot override.</li>
              <li><strong>Mixed content</strong> — If BAU Suite runs on HTTPS and the panel uses HTTP, browsers block the connection. Use &quot;New Tab&quot; mode instead.</li>
              <li><strong>Self-signed certificates</strong> — Panel HTTPS with untrusted certificates will fail silently in iframes. Open the panel URL directly in a new tab first to accept the certificate.</li>
              <li><strong>Network access</strong> — The browser must be on the same network as the panel. BAU Suite cannot bridge networks.</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Recommended workflow:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Try <strong>Auto</strong> mode first — it attempts embedding and falls back to &quot;New Tab&quot; if blocked</li>
              <li>For panels with self-signed certs, open in new tab first, accept the cert, then try embedded</li>
              <li>Use &quot;New Tab&quot; mode for reliable access — BAU Suite still tracks your session history and notes</li>
              <li>Save frequently used panels for quick relaunch</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Endpoint Edit Dialog ────────────────────────────────────
function EndpointEditDialog({ open, onOpenChange, endpoint, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: WebEndpoint | null;
  onSave: (ep: WebEndpoint) => void;
}) {
  const { projects } = useProjects();
  const [form, setForm] = useState<WebEndpoint>(
    endpoint || createBlankEndpoint()
  );

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
        <div style={{ maxHeight: '85vh', overflowY: 'auto' }}>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────
function createBlankEndpoint(): WebEndpoint {
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

// ─── Embedded Workspace ──────────────────────────────────────
function EmbeddedWorkspace() {
  const activeUrl = useWebInterfaceStore(s => s.activeUrl);
  const embedState = useWebInterfaceStore(s => s.embedState);
  const setEmbedState = useWebInterfaceStore(s => s.setEmbedState);
  const clearWorkspace = useWebInterfaceStore(s => s.clearWorkspace);
  const activeEndpointId = useWebInterfaceStore(s => s.activeEndpointId);
  const updateEndpoint = useWebInterfaceStore(s => s.updateEndpoint);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    toast.success('URL copied');
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenExternal = () => {
    openUrl(activeUrl);
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      setEmbedState('loading');
      iframeRef.current.src = activeUrl;
    }
  };

  if (!activeUrl) {
    return (
      <div className="flex-1 flex items-center justify-center border border-border rounded-xl bg-muted/20">
        <div className="text-center space-y-3 px-6 max-w-sm">
          <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">No Panel Open</p>
          <p className="text-xs text-muted-foreground/70">
            Enter a host/IP address and launch a panel web interface, or select a saved endpoint.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden">
      {/* Workspace header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
        <code className="flex-1 text-xs font-mono text-foreground truncate">{activeUrl}</code>
        <div className="flex items-center gap-1">
          <button onClick={handleCopyUrl} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Copy URL">
            {copied ? <Check className="h-3.5 w-3.5 text-field-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={handleRefresh} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleOpenExternal} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Open in new tab">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button onClick={clearWorkspace} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Iframe / blocked fallback */}
      <div className="flex-1 relative bg-white">
        {embedState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center space-y-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-xs text-muted-foreground">Loading panel interface...</p>
            </div>
          </div>
        )}

        {embedState === 'blocked' ? (
          <div className="flex items-center justify-center h-full bg-background">
            <div className="text-center space-y-4 px-6 max-w-md">
              <AlertTriangle className="h-10 w-10 text-field-warning mx-auto" />
              <div>
                <p className="text-sm font-semibold mb-1">Embedded View Blocked</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This device&apos;s web interface blocks embedded viewing (via X-Frame-Options or Content-Security-Policy headers). This is a server-side security setting that cannot be overridden by the browser.
                </p>
              </div>
              <div className="space-y-2">
                <Button onClick={handleOpenExternal} className="gap-1.5">
                  <ExternalLink className="h-4 w-4" /> Open in New Tab
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Your session is still tracked in BAU Suite history.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={activeUrl}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setEmbedState('loaded');
              if (activeEndpointId) {
                updateEndpoint(activeEndpointId, { lastKnownEmbedSupport: 'supported' });
              }
            }}
            onError={() => {
              setEmbedState('blocked');
              if (activeEndpointId) {
                updateEndpoint(activeEndpointId, { lastKnownEmbedSupport: 'blocked' });
              }
            }}
            title="Panel Web Interface"
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function WebInterfacePage() {
  const { projects } = useProjects();
  const endpoints = useWebInterfaceStore(s => s.endpoints);
  const saveEndpoint = useWebInterfaceStore(s => s.saveEndpoint);
  const removeEndpoint = useWebInterfaceStore(s => s.removeEndpoint);
  const toggleFavorite = useWebInterfaceStore(s => s.toggleFavorite);
  const updateEndpoint = useWebInterfaceStore(s => s.updateEndpoint);
  const recentConnections = useWebInterfaceStore(s => s.recentConnections);
  const addRecentConnection = useWebInterfaceStore(s => s.addRecentConnection);
  const clearRecentConnections = useWebInterfaceStore(s => s.clearRecentConnections);
  const setActiveUrl = useWebInterfaceStore(s => s.setActiveUrl);
  const activeUrl = useWebInterfaceStore(s => s.activeUrl);

  // Launch form state
  const [host, setHost] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('https');
  const [port, setPort] = useState('');
  const [path, setPath] = useState('');
  const [openMode, setOpenMode] = useState<OpenMode>('auto');

  // UI state
  const [editEndpoint, setEditEndpoint] = useState<WebEndpoint | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFrom, setSaveFrom] = useState<Partial<WebEndpoint> | null>(null);
  const [panelSection, setPanelSection] = useState<'saved' | 'recent'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ─── Launch ────────────────────────────────────────────────
  const handleLaunch = useCallback((url: string, mode: OpenMode, endpointId?: string) => {
    if (!url) return;

    // Security: validate URL before opening or embedding
    if (!isSafeUrl(url)) {
      toast.error('Invalid or unsafe URL. Only http:// and https:// are allowed.');
      return;
    }

    addRecentConnection({
      endpointId: endpointId || '',
      fullUrl: url,
      friendlyName: '',
      openedAt: new Date().toISOString(),
      openMode: mode,
      projectId: '',
    });

    if (endpointId) {
      updateEndpoint(endpointId, { lastOpenedAt: new Date().toISOString() });
    }

    if (mode === 'new-tab') {
      openUrl(url);
      toast.success('Opened in new tab');
    } else {
      // auto or embedded — try embed
      setActiveUrl(url, endpointId);
    }
  }, [addRecentConnection, updateEndpoint, setActiveUrl]);

  const handleFormLaunch = useCallback(() => {
    if (!host.trim()) {
      toast.error('Please enter a host/IP address');
      return;
    }
    if (!isValidHost(host.trim())) {
      toast.error('Invalid host/IP address');
      return;
    }
    if (!isValidPort(port)) {
      toast.error('Port must be 1–65535');
      return;
    }
    const url = buildUrl({ protocol, host: host.trim(), port, path });
    handleLaunch(url, openMode);
  }, [host, protocol, port, path, openMode, handleLaunch]);

  const handleEndpointLaunch = useCallback((ep: WebEndpoint) => {
    const url = buildUrl(ep);
    handleLaunch(url, ep.preferredOpenMode, ep.id);
  }, [handleLaunch]);

  const handleSaveFromForm = useCallback(() => {
    if (!host.trim()) {
      toast.error('Enter a host first');
      return;
    }
    const blank = createBlankEndpoint();
    setSaveFrom({ ...blank, host: host.trim(), protocol, port, path });
    setShowSaveDialog(true);
  }, [host, protocol, port, path]);

  // ─── Export ────────────────────────────────────────────────
  const handleExportEndpoints = useCallback(() => {
    const data = endpoints.map(ep => ({
      name: ep.friendlyName,
      url: buildUrl(ep),
      host: ep.host,
      protocol: ep.protocol,
      port: ep.port,
      path: ep.path,
      panel: ep.panelName,
      system: ep.systemName,
      notes: ep.notes,
      favorite: ep.favorite,
      lastOpened: ep.lastOpenedAt,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-endpoints-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Endpoints exported');
  }, [endpoints]);

  // ─── Filtered lists ────────────────────────────────────────
  const q = searchQuery.toLowerCase();
  const filteredEndpoints = endpoints.filter(ep =>
    !q ||
    ep.friendlyName.toLowerCase().includes(q) ||
    ep.host.toLowerCase().includes(q) ||
    ep.panelName.toLowerCase().includes(q) ||
    ep.systemName.toLowerCase().includes(q)
  );

  const favorites = filteredEndpoints.filter(ep => ep.favorite);
  const regular = filteredEndpoints.filter(ep => !ep.favorite);

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || '';

  return (
    <>
      <TopBar title="Web Interface" />
      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Left panel — launch form + endpoints + recent */}
        <div className="w-full lg:w-96 shrink-0 border-r border-border overflow-y-auto" style={{ maxHeight: 'calc(100vh - 3.5rem)' }}>
          {/* Launch Form */}
          <div className="p-4 space-y-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Launch Panel Interface
            </h2>

            <div className="grid gap-2">
              <div className="space-y-1">
                <Label htmlFor="wi-host" className="text-xs">Host / IP Address</Label>
                <Input
                  id="wi-host"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="192.168.1.50"
                  className="h-8 text-xs font-mono"
                  onKeyDown={e => e.key === 'Enter' && handleFormLaunch()}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Protocol</Label>
                  <Select value={protocol} onValueChange={v => v && setProtocol(v as Protocol)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder={protocol === 'https' ? '443' : '80'}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mode</Label>
                  <Select value={openMode} onValueChange={v => v && setOpenMode(v as OpenMode)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="embedded">Embed</SelectItem>
                      <SelectItem value="new-tab">New Tab</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Path (optional)</Label>
                <Input
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  placeholder="/login"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <UrlPreview protocol={protocol} host={host} port={port} path={path} />

            <div className="flex gap-2">
              <Button size="sm" onClick={handleFormLaunch} disabled={!host.trim()} className="gap-1.5 flex-1">
                <Play className="h-3.5 w-3.5" /> Launch
              </Button>
              <Button size="sm" variant="outline" onClick={handleSaveFromForm} disabled={!host.trim()} className="gap-1.5">
                <Bookmark className="h-3.5 w-3.5" /> Save
              </Button>
            </div>

            <SecurityGuidance />
          </div>

          {/* Saved / Recent tabs */}
          <div className="border-b border-border flex">
            <button
              onClick={() => setPanelSection('saved')}
              className={cn(
                'flex-1 px-4 py-2 text-xs font-medium transition-colors',
                panelSection === 'saved' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Saved Endpoints ({endpoints.length})
            </button>
            <button
              onClick={() => setPanelSection('recent')}
              className={cn(
                'flex-1 px-4 py-2 text-xs font-medium transition-colors',
                panelSection === 'recent' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Recent ({recentConnections.length})
            </button>
          </div>

          {/* Saved Endpoints */}
          {panelSection === 'saved' && (
            <div className="p-3 space-y-2">
              {endpoints.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search endpoints..."
                    className="h-7 text-xs pl-7"
                  />
                </div>
              )}

              {endpoints.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  <Bookmark className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No saved endpoints yet.</p>
                  <p className="text-[10px] mt-1">Enter an IP and click Save to bookmark a panel.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {favorites.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-1">Favorites</p>
                      {favorites.map(ep => (
                        <EndpointCard
                          key={ep.id}
                          endpoint={ep}
                          projectName={projectName(ep.projectId)}
                          onLaunch={() => handleEndpointLaunch(ep)}
                          onEdit={() => { setEditEndpoint(ep); setShowEditDialog(true); }}
                          onDelete={() => setDeleteId(ep.id)}
                          onToggleFavorite={() => toggleFavorite(ep.id)}
                          onFillForm={() => { setHost(ep.host); setProtocol(ep.protocol); setPort(ep.port); setPath(ep.path); }}
                        />
                      ))}
                    </>
                  )}
                  {regular.length > 0 && (
                    <>
                      {favorites.length > 0 && <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2">All</p>}
                      {regular.map(ep => (
                        <EndpointCard
                          key={ep.id}
                          endpoint={ep}
                          projectName={projectName(ep.projectId)}
                          onLaunch={() => handleEndpointLaunch(ep)}
                          onEdit={() => { setEditEndpoint(ep); setShowEditDialog(true); }}
                          onDelete={() => setDeleteId(ep.id)}
                          onToggleFavorite={() => toggleFavorite(ep.id)}
                          onFillForm={() => { setHost(ep.host); setProtocol(ep.protocol); setPort(ep.port); setPath(ep.path); }}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}

              {endpoints.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleExportEndpoints} className="w-full gap-1.5 text-xs text-muted-foreground mt-2">
                  <Download className="h-3 w-3" /> Export Endpoints
                </Button>
              )}
            </div>
          )}

          {/* Recent Connections */}
          {panelSection === 'recent' && (
            <div className="p-3 space-y-1">
              {recentConnections.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No recent connections.</p>
                </div>
              ) : (
                <>
                  {recentConnections.map(rc => (
                    <button
                      key={rc.id}
                      onClick={() => handleLaunch(rc.fullUrl, rc.openMode)}
                      className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/50 transition-colors group"
                    >
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono truncate">{rc.fullUrl}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(rc.openedAt), 'MMM d, HH:mm')}
                          {rc.openMode === 'new-tab' && ' · New Tab'}
                        </p>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearRecentConnections}
                    className="w-full gap-1.5 text-xs text-muted-foreground mt-2"
                  >
                    <Trash2 className="h-3 w-3" /> Clear History
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right panel — workspace */}
        <div className="flex-1 flex flex-col p-3 min-h-0">
          <EmbeddedWorkspace />
        </div>
      </div>

      {/* Edit Dialog */}
      {showEditDialog && (
        <EndpointEditDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          endpoint={editEndpoint}
          onSave={(ep) => saveEndpoint(ep)}
        />
      )}

      {/* Save Dialog (from form) */}
      {showSaveDialog && (
        <EndpointEditDialog
          open={showSaveDialog}
          onOpenChange={setShowSaveDialog}
          endpoint={saveFrom as WebEndpoint | null}
          onSave={(ep) => saveEndpoint(ep)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Endpoint</DialogTitle>
              <DialogDescription>
                This will permanently remove this saved endpoint. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { removeEndpoint(deleteId); setDeleteId(null); toast.success('Endpoint deleted'); }}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Endpoint Card ───────────────────────────────────────────
function EndpointCard({ endpoint: ep, projectName, onLaunch, onEdit, onDelete, onToggleFavorite, onFillForm }: {
  endpoint: WebEndpoint;
  projectName: string;
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onFillForm: () => void;
}) {
  const url = buildUrl(ep);

  return (
    <div className="group rounded-lg border border-border px-3 py-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        <button onClick={onToggleFavorite} className="mt-0.5 shrink-0">
          <Star className={cn('h-3.5 w-3.5 transition-colors', ep.favorite ? 'text-field-warning fill-field-warning' : 'text-muted-foreground/30 hover:text-field-warning')} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium truncate">{ep.friendlyName || ep.host}</p>
            {ep.lastKnownEmbedSupport === 'blocked' && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 text-field-warning border-yellow-300">ext only</Badge>
            )}
            {ep.lastKnownEmbedSupport === 'supported' && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 text-field-success border-green-300">embed ok</Badge>
            )}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground truncate">{url}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {ep.panelName && <span className="text-[10px] text-muted-foreground">{ep.panelName}</span>}
            {projectName && <span className="text-[10px] text-primary/70">{projectName}</span>}
            {ep.lastOpenedAt && (
              <span className="text-[10px] text-muted-foreground/50">
                {format(new Date(ep.lastOpenedAt), 'MMM d')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onLaunch} className="p-1 rounded hover:bg-primary/10 hover:text-primary" title="Launch">
            <Play className="h-3 w-3" />
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-muted" title="Edit">
            <Edit className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive" title="Delete">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
