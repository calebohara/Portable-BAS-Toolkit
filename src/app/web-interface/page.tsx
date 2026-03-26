'use client';

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Globe, ExternalLink, Trash2, Download, Search, Wifi, Plug, Zap,
  Plus, Clock, Play, Bookmark,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { openUrl } from '@/lib/tauri-bridge';
import { toast } from 'sonner';
import {
  useWebInterfaceStore,
  buildUrl, isSafeUrl, isValidHost, isValidPort,
  SIEMENS_PRESETS,
  type Protocol, type OpenMode, type WebEndpoint,
} from '@/store/web-interface-store';
import { useProjects } from '@/hooks/use-projects';
import { EmbeddedWorkspace } from '@/components/web-interface/embedded-workspace';
import { EndpointEditDialog, UrlPreview, createBlankEndpoint } from '@/components/web-interface/endpoint-edit-dialog';
import { SecurityGuidance } from '@/components/web-interface/security-guidance';
import { EndpointCard } from '@/components/web-interface/endpoint-card';

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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
        <div className="w-full lg:w-96 shrink-0 border-r border-border overflow-y-auto max-h-[50vh] lg:max-h-[calc(100vh-3.5rem)]">
          {/* Siemens Quick Connect */}
          <div className="p-4 pb-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Quick Connect — Siemens PXC
            </h2>
            <div className="grid gap-2">
              {SIEMENS_PRESETS.map(preset => (
                <button
                  key={preset.host}
                  onClick={() => {
                    setHost(preset.host);
                    setProtocol(preset.protocol);
                    setPort('');
                    setPath('');
                  }}
                  className={cn(
                    'flex items-start gap-2.5 w-full rounded-lg border border-border px-3 py-2.5 text-left transition-all',
                    'hover:border-primary/40 hover:bg-primary/5',
                    host === preset.host && 'border-primary/60 bg-primary/10',
                  )}
                >
                  {preset.accessMethod === 'wlan-svc' ? (
                    <Wifi className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  ) : (
                    <Plug className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{preset.label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{preset.host}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{preset.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Launch Form */}
          <div className="p-4 space-y-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Launch Panel Interface
            </h2>

            <div className="grid gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="wi-host" className="text-xs">Host / IP Address</Label>
                <Input
                  id="wi-host"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="192.168.1.50"
                  className="h-9 text-xs font-mono"
                  onKeyDown={e => e.key === 'Enter' && handleFormLaunch()}
                />
              </div>

              <div className="flex gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Protocol</Label>
                  <Select value={protocol} onValueChange={v => v && setProtocol(v as Protocol)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-20 sm:flex-1">
                  <Label className="text-xs">Port</Label>
                  <Input
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder={protocol === 'https' ? '443' : '80'}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Path</Label>
                  <Input
                    value={path}
                    onChange={e => setPath(e.target.value)}
                    placeholder="/login"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Mode</Label>
                  <Select value={openMode} onValueChange={v => v && setOpenMode(v as OpenMode)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="embedded">Embed</SelectItem>
                      <SelectItem value="new-tab">New Tab</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
