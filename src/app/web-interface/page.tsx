'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Globe, ExternalLink, Star, Copy, Check, Trash2, Edit, RefreshCw,
  Plus, ChevronDown, ChevronUp, AlertTriangle, Shield, X,
  Clock, Play, Bookmark, Info, Download, Search, Wifi, Plug, Zap,
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
import { cn, copyToClipboard } from '@/lib/utils';
import { openUrl, isTauri, nativeProxyFetch } from '@/lib/tauri-bridge';
import { toast } from 'sonner';
import {
  useWebInterfaceStore,
  buildUrl, isSafeUrl, isValidHost, isValidPort,
  SIEMENS_PRESETS,
  type WebEndpoint, type Protocol, type OpenMode, type ControllerFamily, type AccessMethod,
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

// ─── Connection Guidance ─────────────────────────────────────
function SecurityGuidance() {
  const [open, setOpen] = useState(false);
  const isTauriApp = typeof window !== 'undefined' && isTauri();
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
      >
        <Info className="h-3.5 w-3.5" />
        <span>Connection Help & Siemens PXC Guide</span>
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="text-xs text-muted-foreground space-y-3 pt-1">
          {/* Siemens PXC Access Guide */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Siemens PXC7 / PXC.A Access:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li><strong>WLAN SVC</strong> — Connect to controller Wi-Fi AP (SSID on label), browse to <span className="font-mono">192.168.252.1</span></li>
              <li><strong>WAN Eth2 Tool Port</strong> — Direct Ethernet, set laptop to <span className="font-mono">192.168.250.x</span>, browse to <span className="font-mono">192.168.250.2</span></li>
              <li><strong>LAN (post-load)</strong> — After project load, use the site-assigned IP on switched LAN ports</li>
              <li><strong>Protocol:</strong> HTTPS only (port 443). HTTP redirects to HTTPS. Self-signed certs are default.</li>
            </ul>
          </div>
          {/* Runtime-specific guidance */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {isTauriApp ? 'Desktop App Mode:' : 'Web Browser Mode:'}
            </p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              {isTauriApp ? (
                <>
                  <li><strong>Auto mode</strong> proxies through the desktop app, bypassing self-signed certificate issues automatically</li>
                  <li>Interactive pages (forms, login) may work better in <strong>New Tab</strong> mode</li>
                  <li>The proxy only works for private network addresses (10.x, 172.x, 192.168.x)</li>
                </>
              ) : (
                <>
                  <li>Self-signed certs block iframe embedding — use <strong>New Tab</strong> for reliable access</li>
                  <li>For the <strong>desktop app</strong>, embedded view bypasses cert issues automatically</li>
                  <li>BAU Suite tracks your session history and saved endpoints regardless of open mode</li>
                </>
              )}
            </ul>
          </div>
          {/* Common issues */}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Common Issues:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li><strong>No connection</strong> — Verify laptop is on the correct subnet (check IP settings)</li>
              <li><strong>Cert warning</strong> — Normal for BAS controllers. Accept once, then embedded view works</li>
              <li><strong>Wrong port</strong> — LAN ports ≠ WAN tool port. They have different IPs/subnets</li>
              <li><strong>SVC vs LAN</strong> — WLAN SVC and WAN Eth2 are for service only, not BACnet networking</li>
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
  const [certTrusted, setCertTrusted] = useState(false);
  const [proxyHtml, setProxyHtml] = useState<string | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect HTTPS URLs that may have self-signed certs (timeout-based detection)
  const isHttps = activeUrl.startsWith('https://');
  const isPrivateNetwork = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.)/.test(activeUrl);
  const isTauriApp = typeof window !== 'undefined' && isTauri();

  // In Tauri + HTTPS + private network: use Rust proxy to bypass cert issues
  useEffect(() => {
    if (!activeUrl || !isTauriApp || !isHttps || !isPrivateNetwork) return;
    if (embedState !== 'loading') return;

    let cancelled = false;
    (async () => {
      try {
        const response = await nativeProxyFetch(activeUrl);
        if (cancelled) return;
        if (response.status >= 200 && response.status < 400 && !response.is_binary) {
          // Inject a <base> tag so relative URLs resolve correctly
          const baseTag = `<base href="${activeUrl}">`;
          const html = response.body.includes('<head>')
            ? response.body.replace('<head>', `<head>${baseTag}`)
            : `${baseTag}${response.body}`;
          setProxyHtml(html);
          setEmbedState('loaded');
          if (activeEndpointId) {
            updateEndpoint(activeEndpointId, { lastKnownEmbedSupport: 'supported' });
          }
        } else {
          setEmbedState('blocked');
        }
      } catch {
        if (!cancelled) {
          setEmbedState('cert-issue');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeUrl, isTauriApp, isHttps, isPrivateNetwork, embedState, activeEndpointId, setEmbedState, updateEndpoint]);

  // For non-Tauri (web browser): timeout-based cert issue detection
  useEffect(() => {
    if (isTauriApp) return; // Tauri uses proxy, not timeout detection
    if (embedState === 'loading' && isHttps && isPrivateNetwork) {
      loadTimerRef.current = setTimeout(() => {
        setEmbedState('cert-issue');
      }, 8000);
    }
    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }
    };
  }, [embedState, isHttps, isPrivateNetwork, setEmbedState, isTauriApp]);

  const handleCopyUrl = async () => {
    try {
      await copyToClipboard(activeUrl);
      setCopied(true);
      toast.success('URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard access denied');
    }
  };

  const handleOpenExternal = () => {
    openUrl(activeUrl);
  };

  const handleRefresh = () => {
    setProxyHtml(null);
    setEmbedState('loading');
    if (!isTauriApp || !isHttps || !isPrivateNetwork) {
      // Non-proxy path: reload iframe directly
      if (iframeRef.current) {
        iframeRef.current.src = activeUrl;
      }
    }
    // Proxy path: the useEffect will re-trigger due to embedState changing to 'loading'
  };

  // Trust Certificate flow: open URL in new tab so user can accept the cert,
  // then retry the embedded iframe
  const handleTrustCert = () => {
    openUrl(activeUrl);
    setCertTrusted(true);
    toast.info('Accept the certificate in the new tab, then click "Retry Embed" here.');
  };

  const handleRetryAfterTrust = () => {
    setCertTrusted(false);
    setEmbedState('loading');
    if (iframeRef.current) {
      // Force reload by blanking then re-setting the src
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = activeUrl;
        }
      }, 300);
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

      {/* Iframe / blocked / cert-issue fallback */}
      <div className="flex-1 relative bg-white">
        {embedState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center space-y-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-xs text-muted-foreground">Loading panel interface...</p>
            </div>
          </div>
        )}

        {/* Self-signed certificate detected */}
        {embedState === 'cert-issue' ? (
          <div className="flex items-center justify-center h-full bg-background">
            <div className="text-center space-y-4 px-6 max-w-md">
              <div className="mx-auto w-12 h-12 rounded-full bg-field-warning/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-field-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1">Self-Signed Certificate Detected</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This device uses HTTPS with an untrusted certificate, which browsers block in embedded views. Trust the certificate in a new tab, then return here to load the embedded interface.
                </p>
              </div>
              <div className="space-y-2">
                {!certTrusted ? (
                  <Button onClick={handleTrustCert} className="gap-1.5">
                    <Shield className="h-4 w-4" /> Trust Certificate in New Tab
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-primary font-medium">
                      ✓ Accept the certificate warning in the new tab, then click below.
                    </p>
                    <Button onClick={handleRetryAfterTrust} className="gap-1.5">
                      <RefreshCw className="h-4 w-4" /> Retry Embedded View
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={handleOpenExternal} className="gap-1 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3" /> Open in New Tab Instead
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Self-signed certs are standard on BAS controllers (Siemens PXC, Tridium, Honeywell). This is not a security threat on your local network. If using the desktop app, embedded view handles certificates automatically.
              </p>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                <strong>No response?</strong> Verify your laptop is on the correct subnet — WLAN SVC uses 192.168.252.x, WAN tool port uses 192.168.250.x.
              </p>
            </div>
          </div>
        ) : embedState === 'blocked' ? (
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
        ) : proxyHtml ? (
          <iframe
            ref={iframeRef}
            srcDoc={proxyHtml}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="Panel Web Interface"
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={activeUrl}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onLoad={() => {
              if (loadTimerRef.current) {
                clearTimeout(loadTimerRef.current);
                loadTimerRef.current = null;
              }
              setEmbedState('loaded');
              if (activeEndpointId) {
                updateEndpoint(activeEndpointId, { lastKnownEmbedSupport: 'supported' });
              }
            }}
            onError={() => {
              if (loadTimerRef.current) {
                clearTimeout(loadTimerRef.current);
                loadTimerRef.current = null;
              }
              if (isHttps && isPrivateNetwork) {
                setEmbedState('cert-issue');
              } else {
                setEmbedState('blocked');
              }
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
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
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
