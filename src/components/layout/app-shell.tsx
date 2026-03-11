'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { Sidebar } from './sidebar';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { TourOverlay } from '@/components/onboarding/tour-overlay';
import { GlobalNotepad } from '@/components/notepad/global-notepad';
import { WebUpdateBanner } from './web-update-banner';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setOnline = useAppStore((s) => s.setOnline);

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

  // Register service worker (skip in Tauri — SW intercepts navigation requests
  // and breaks client-side routing in the static export)
  useEffect(() => {
    if ('serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window)) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator && '__TAURI_INTERNALS__' in window) {
      // Unregister any previously registered SW in Tauri to prevent stale caches
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  // Auto-launch tour for first-time users
  useEffect(() => {
    const state = useAppStore.getState();
    if (!state.hasCompletedTour && !state.tourActive) {
      // Small delay to let the app render first
      const timer = setTimeout(() => {
        useAppStore.getState().startTour();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Close sidebar on mobile by default
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setSidebarOpen]);

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
