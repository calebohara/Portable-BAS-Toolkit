'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Globe, ExternalLink, Copy, Check, RefreshCw, Shield, AlertTriangle, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
import { openUrl, isTauri, nativeProxyFetch } from '@/lib/tauri-bridge';
import { toast } from 'sonner';
import { useWebInterfaceStore } from '@/store/web-interface-store';

export function EmbeddedWorkspace() {
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
