'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/store/app-store';
import { Sidebar } from './sidebar';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { TourOverlay } from '@/components/onboarding/tour-overlay';
import { GlobalNotepad } from '@/components/notepad/global-notepad';
import { WebUpdateBanner } from './web-update-banner';
import { MaintenancePage } from '@/components/maintenance/maintenance-page-lazy';
import { isMaintenanceMode } from '@/lib/maintenance';
import { isTauri } from '@/lib/tauri-bridge';
import { cn } from '@/lib/utils';
import { silently } from '@/lib/error-reporting';
import { FULL_PAGE_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { ErrorBoundary } from './error-boundary';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, profile, loading: authLoading } = useAuth();

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setOnline = useAppStore((s) => s.setOnline);
  const isFullPage = (FULL_PAGE_ROUTES as readonly string[]).includes(pathname) || pathname.startsWith('/donate/');
  const isPublic = (PUBLIC_ROUTES as readonly string[]).includes(pathname) || pathname.startsWith('/donate/');

  // Auth guard: redirect unauthenticated users to /login
  useEffect(() => {
    if (!authLoading && mode !== 'authenticated' && !isPublic) {
      router.replace('/login');
    }
  }, [authLoading, mode, isPublic, router]);

  // Approval gate: redirect unapproved users to /pending-approval
  // Waits for profile to be fetched before allowing access
  useEffect(() => {
    if (!authLoading && mode === 'authenticated' && profile && profile.approved === false && pathname !== '/pending-approval') {
      router.replace('/pending-approval');
    }
  }, [authLoading, mode, profile, pathname, router]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  // Register service worker (skip in dev mode and Tauri)
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const inTauri = isTauri();

    if ('serviceWorker' in navigator && !isDev && !inTauri) {
      navigator.serviceWorker.register('/sw.js').catch(silently);
    } else if ('serviceWorker' in navigator && (isDev || inTauri)) {
      // Unregister any previously registered SW to prevent stale caches
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  // Auto-launch tour for first-time users (only on dashboard)
  useEffect(() => {
    if (pathname !== '/dashboard') return;
    const state = useAppStore.getState();
    if (!state.hasCompletedTour && !state.tourActive) {
      // Small delay to let the app render first
      const timer = setTimeout(() => {
        useAppStore.getState().startTour();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  // Close sidebar on mobile by default
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setSidebarOpen]);

  // Maintenance gate: block all non-admin users when maintenance mode is active.
  // Wait for auth loading to complete and profile to resolve before locking out
  // — otherwise admins can be briefly redirected during the auth bootstrap.
  if (!authLoading && profile !== null && profile !== undefined && isMaintenanceMode() && profile.role !== 'admin') {
    return <MaintenancePage />;
  }

  // Full-page routes render without sidebar chrome
  if (isFullPage) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  // While auth is loading, user is not authenticated, or profile hasn't loaded yet, show spinner
  // Profile must be loaded before rendering so the approval gate can fire
  if (authLoading || mode !== 'authenticated' || (mode === 'authenticated' && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Skip-to-content link — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setSidebarOpen(false);
          }}
          role="button"
          aria-label="Close menu"
          tabIndex={-1}
        />
      )}
      <Sidebar />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'min-h-screen transition-all duration-200',
          // On mobile, no margin - sidebar overlays
          'md:transition-[margin-left]',
          sidebarOpen ? 'md:ml-56' : 'md:ml-16'
        )}
      >
        <ErrorBoundary section="Page">
          {children}
        </ErrorBoundary>
      </main>
      <GlobalNotepad />
      <InstallPrompt />
      <WebUpdateBanner />
      <TourOverlay />
    </div>
  );
}
