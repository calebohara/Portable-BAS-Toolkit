'use client';

import { useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, WifiOff, Menu, RefreshCw, Upload, Mail, Bug } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/store/app-store';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useInbox } from '@/hooks/use-inbox';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { Button } from '@/components/ui/button';
import { GlobalUploadDialog } from '@/components/files/global-upload-dialog';
import { InboxPanel } from '@/components/inbox/inbox-panel';
import { BugReportDialog } from '@/components/shared/bug-report-dialog';

export function TopBar({ title, children }: { title?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const isOnline = useAppStore((s) => s.isOnline);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const [showUpload, setShowUpload] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const { unreadCount } = useInbox();

  const goToSearch = useCallback(() => router.push('/search'), [router]);

  // Use soft refresh on dynamic routes to avoid triggering SPA fallback in desktop app.
  // Static routes are safe for hard refresh.
  const handleRefresh = useCallback(() => {
    const isDynamicRoute = /^\/(projects|reports)\/[^_]/.test(pathname);
    if (isDynamicRoute) {
      router.refresh();
    } else {
      window.location.reload();
    }
  }, [pathname, router]);
  useKeyboardShortcut('k', goToSearch);

  return (
    <>
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-3 border-b border-border bg-background/80 px-3 sm:px-4 backdrop-blur-md"
      >
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden p-1.5"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {title && <h1 className="text-base sm:text-lg font-semibold truncate min-w-0">{title}</h1>}
        {children}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isOnline && (
            <div className="flex items-center gap-1.5 rounded-full bg-field-warning/10 px-2.5 py-1 text-xs font-medium text-field-warning">
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">Offline</span>
            </div>
          )}

          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowUpload(true)}
            aria-label="Quick Upload"
            data-tour="upload-button"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={handleRefresh}
            aria-label="Refresh page"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex h-8 gap-2 text-muted-foreground"
            onClick={goToSearch}
            data-tour="search-button"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground lg:inline">
              ⌘K
            </kbd>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowBugReport(true)}
            aria-label="Report a bug"
          >
            <Bug className="h-3.5 w-3.5 animate-bug-crawl" />
          </Button>

          <ThemeSwitcher />

          {/* Inbox button with notification badge */}
          {user && (
            <button
              type="button"
              onClick={() => setShowInbox(true)}
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Open inbox"
            >
              <Mail className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Profile pill — navigates to settings */}
          {user && (
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="flex items-center gap-2 rounded-full border border-border bg-muted/50 pl-1 pr-3 py-1 hover:bg-muted transition-colors cursor-pointer"
              aria-label="Go to profile"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[10px] font-semibold text-primary">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  (() => {
                    const f = profile?.firstName?.[0] ?? '';
                    const l = profile?.lastName?.[0] ?? '';
                    return (f + l).toUpperCase() || user.email?.slice(0, 2).toUpperCase() || '??';
                  })()
                )}
              </div>
              <span className="hidden sm:inline max-w-28 truncate text-xs font-medium text-foreground">
                {profile?.displayName || user.email || 'Account'}
              </span>
            </button>
          )}
        </div>
      </header>

      <GlobalUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
      />

      <InboxPanel
        open={showInbox}
        onOpenChange={setShowInbox}
      />

      <BugReportDialog
        open={showBugReport}
        onOpenChange={setShowBugReport}
        pageTitle={title}
      />
    </>
  );
}
