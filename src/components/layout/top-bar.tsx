'use client';

import { useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, WifiOff, Menu, RefreshCw, Upload } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { Button } from '@/components/ui/button';
import { GlobalUploadDialog } from '@/components/files/global-upload-dialog';

export function TopBar({ title, children }: { title?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isOnline = useAppStore((s) => s.isOnline);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const [showUpload, setShowUpload] = useState(false);

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
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md"
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

        {title && <h1 className="text-lg font-semibold truncate">{title}</h1>}
        {children}

        <div className="ml-auto flex items-center gap-2">
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
            className="h-8 gap-2 text-muted-foreground"
            onClick={goToSearch}
            data-tour="search-button"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground lg:inline">
              ⌘K
            </kbd>
          </Button>

          <ThemeSwitcher />
        </div>
      </header>

      <GlobalUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
      />
    </>
  );
}
