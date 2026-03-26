'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { isTauri } from '@/lib/tauri-bridge';

export function SecurityGuidance() {
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
