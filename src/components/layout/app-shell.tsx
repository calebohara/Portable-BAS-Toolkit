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
import { cn } from '@/lib/utils';

// Routes that render their own full-page layout (no sidebar)
const FULL_PAGE_ROUTES = ['/', '/login', '/forgot-password', '/reset-password', '/donate', '/desktop', '/pending-approval'];

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/login', '/forgot-password', '/reset-password', '/offline', '/donate', '/desktop', '/pending-approval'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, profile, loading: authLoading } = useAuth();

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setOnline = useAppStore((s) => s.setOnline);
  const isFullPage = FULL_PAGE_ROUTES.includes(pathname) || pathname.startsWith('/donate/');
  const isPublic = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/donate/');

  // Auth guard: redirect unauthenticated users to /login
  useEffect(() => {
    if (!authLoading && mode !== 'authenticated' && !isPublic) {
      router.replace('/login');
    }
  }, [authLoading, mode, isPublic, router]);

  // Approval gate: redirect unapproved users to /pending-approval
  // Only enforced when profile has been fetched and approved is explicitly false
  // (if column doesn't exist yet, approved will be undefined — skip the gate)
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
    const isTauri = '__TAURI_INTERNALS__' in window;

    if ('serviceWorker' in navigator && !isDev && !isTauri) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator && (isDev || isTauri)) {
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

  // Full-page routes render without sidebar chrome
  if (isFullPage) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  // While auth is loading or user is not authenticated, show spinner (redirect will fire)
  if (authLoading || mode !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-200',
          // On mobile, no margin - sidebar overlays
          'md:transition-[margin-left]',
          sidebarOpen ? 'md:ml-56' : 'md:ml-16'
        )}
      >
        {children}
      </main>
      <GlobalNotepad />
      <InstallPrompt />
      <WebUpdateBanner />
      <TourOverlay />
    </div>
  );
}
