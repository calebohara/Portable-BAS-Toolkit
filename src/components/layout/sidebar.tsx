'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Search, WifiOff, Settings, Pin,
  ChevronLeft, ChevronRight, X, FolderOpen, HelpCircle, ClipboardList, TerminalSquare, Globe,
  Network, Activity, Calculator, Users2, BookOpen, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UpdateNotifier } from './update-notifier';
import { SyncStatusIndicator } from './sync-status';
import { OnlineUsers } from './online-users';
import { APP_VERSION } from '@/lib/version';

const navGroups = [
  {
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', tourId: 'nav-dashboard' },
      { href: '/projects', icon: FolderKanban, label: 'Projects', tourId: 'nav-projects' },
      { href: '/reports', icon: ClipboardList, label: 'Daily Reports', tourId: 'nav-reports' },
    ],
  },
  {
    label: 'Shared',
    items: [
      { href: '/global-projects', icon: Users2, label: 'Global Projects', tourId: 'nav-global-projects' },
      { href: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base', tourId: 'nav-knowledge-base' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/network-diagram', icon: Network, label: 'Network Diagrams', tourId: 'nav-network-diagram' },
      { href: '/terminal', icon: TerminalSquare, label: 'Telnet HMI', tourId: 'nav-terminal' },
      { href: '/web-interface', icon: Globe, label: 'Web Interface', tourId: 'nav-web-interface' },
      { href: '/ping', icon: Activity, label: 'Ping Tool', tourId: 'nav-ping' },
      { href: '/register-tool', icon: Calculator, label: 'Register Tool', tourId: 'nav-register-tool' },
      { href: '/pid-tuning', icon: Gauge, label: 'PID Tuning', tourId: 'nav-pid-tuning' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/documents', icon: FolderOpen, label: 'Uploads Inbox', tourId: 'nav-documents' },
      { href: '/search', icon: Search, label: 'Search', tourId: 'nav-search' },
      { href: '/offline', icon: Pin, label: 'Offline / Pinned', tourId: 'nav-offline' },
    ],
  },
  {
    items: [
      { href: '/help', icon: HelpCircle, label: 'Help', tourId: 'nav-help' },
      { href: '/settings', icon: Settings, label: 'Settings', tourId: 'nav-settings' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const isOnline = useAppStore((s) => s.isOnline);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        // On mobile: slide off-screen when closed
        sidebarOpen ? 'translate-x-0 w-56' : '-translate-x-full w-56 md:translate-x-0 md:w-16'
      )}
    >
      {/* Logo area */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3" data-tour="sidebar-logo">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden">
          <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-8 w-8" />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">BAU Suite</span>
            <span className="truncate text-[10px] text-muted-foreground">Portable Project Toolkit</span>
          </div>
        )}
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(false)}
          className="ml-auto h-8 w-8 p-0 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Close menu"
        >
          <X className="h-4.5 w-4.5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && sidebarOpen && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hidden md:block">
                {group.label}
              </p>
            )}
            {!sidebarOpen && group.label && (
              <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border hidden md:block" />
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label, tourId }) => {
                // Normalize pathname for trailing slash, index.html, and catch-all fallback patterns.
                // In Tauri static export, paths like /projects/_/ are used for dynamic routes.
                // Strip: trailing slash, /index.html, and /_/ or /_ catch-all segments.
                const normalizedPath = pathname
                  .replace(/\/index\.html$/, '')
                  .replace(/\/_\/?$/, '')     // strip catch-all /_/ or /_
                  .replace(/\/$/, '')          // strip trailing slash
                  || '/';
                const isActive = href === '/'
                  ? normalizedPath === '/'
                  : normalizedPath === href || normalizedPath.startsWith(href + '/');

                const linkEl = (
                  <Link
                    key={href}
                    href={href}
                    data-tour={tourId}
                    onClick={() => {
                      if (window.innerWidth < 768) setSidebarOpen(false);
                    }}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-sidebar-primary'
                        : 'text-sidebar-foreground/70'
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="truncate md:hidden">{label}</span>
                    {sidebarOpen && <span className="truncate hidden md:inline">{label}</span>}
                  </Link>
                );

                if (!sidebarOpen) {
                  return (
                    <Tooltip key={href}>
                      <TooltipTrigger render={<span className="block" />}>
                        {linkEl}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return linkEl;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: sync status, offline warning, version & collapse */}
      <div className="border-t border-sidebar-border px-2 py-2 space-y-1.5">
        {/* Online users — presence indicator */}
        <OnlineUsers collapsed={!sidebarOpen} />

        {/* Sync indicator — always visible, full-width tap target */}
        <SyncStatusIndicator collapsed={!sidebarOpen} />

        {/* Offline warning */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-lg bg-field-warning/10 px-3 py-2 text-xs text-field-warning">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {sidebarOpen && <span>Offline Mode</span>}
          </div>
        )}

        {/* Version + update notifier */}
        {sidebarOpen && (
          <div className="hidden md:block space-y-1">
            <div className="mb-0.5">
              <UpdateNotifier />
            </div>
            <p className="text-center text-[10px] text-muted-foreground/60">
              v{APP_VERSION}
            </p>
          </div>
        )}

        {/* Collapse toggle — desktop only */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center text-muted-foreground hover:text-foreground hidden md:flex"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
