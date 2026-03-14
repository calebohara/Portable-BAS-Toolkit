/**
 * Centralized route constants and navigation helpers for BAU Suite.
 *
 * STATIC EXPORT PROBLEM:
 * In Tauri desktop mode, Next.js generates a static export where only
 * catch-all fallback pages exist for dynamic routes:
 *   /projects/_/index.html   (for all project detail pages)
 *   /reports/_/index.html    (for all report detail pages)
 *   /reports/_/edit/index.html
 *
 * Client-side router.push('/projects/{uuid}') fails because no pre-rendered
 * data exists for that route. The fix: in static-export mode, navigate using
 * window.location to the catch-all fallback with ?_id= query param.
 *
 * In web/dev mode, normal router.push works fine.
 */

import { isTauri } from './tauri-bridge';

// ─── Static route constants ─────────────────────────────────
export const ROUTES = {
  DASHBOARD: '/',
  PROJECTS: '/projects',
  REPORTS: '/reports',
  REPORT_NEW: '/reports/new',
  SEARCH: '/search',
  NETWORK_DIAGRAM: '/network-diagram',
  TERMINAL: '/terminal',
  WEB_INTERFACE: '/web-interface',
  PING: '/ping',
  DOCUMENTS: '/documents',
  OFFLINE: '/offline',
  HELP: '/help',
  SETTINGS: '/settings',
  GLOBAL_PROJECTS: '/global-projects',
} as const;

// ─── Dynamic route helpers ──────────────────────────────────
// These return the correct URL based on runtime context.
// In Tauri (static export): /projects/_/?_id={id}
// In browser (server mode): /projects/{id}

export function projectDetailHref(id: string, tab?: string): string {
  if (isTauri()) {
    const params = new URLSearchParams({ _id: id });
    if (tab) params.set('tab', tab);
    return `/projects/_/?${params.toString()}`;
  }
  return tab ? `/projects/${id}?tab=${tab}` : `/projects/${id}`;
}

export function reportDetailHref(id: string): string {
  if (isTauri()) {
    return `/reports/_/?_id=${encodeURIComponent(id)}`;
  }
  return `/reports/${id}`;
}

export function reportEditHref(id: string): string {
  if (isTauri()) {
    return `/reports/_/edit/?_id=${encodeURIComponent(id)}`;
  }
  return `/reports/${id}/edit`;
}

// ─── Navigation helper ──────────────────────────────────────
// In Tauri static export, we MUST use window.location for dynamic routes
// because Next.js client router can't resolve pre-rendered data for them.
// For static routes, router.push works fine in both modes.

type RouterLike = { push: (url: string) => void };

export function navigateToProject(router: RouterLike, id: string, tab?: string): void {
  const href = projectDetailHref(id, tab);
  if (isTauri()) {
    window.location.href = href;
  } else {
    router.push(href);
  }
}

export function navigateToReport(router: RouterLike, id: string): void {
  const href = reportDetailHref(id);
  if (isTauri()) {
    window.location.href = href;
  } else {
    router.push(href);
  }
}

export function navigateToReportEdit(router: RouterLike, id: string): void {
  const href = reportEditHref(id);
  if (isTauri()) {
    window.location.href = href;
  } else {
    router.push(href);
  }
}

// ─── Global Project route helpers ──────────────────────────
export function globalProjectDetailHref(id: string, tab?: string): string {
  if (isTauri()) {
    const params = new URLSearchParams({ _id: id });
    if (tab) params.set('tab', tab);
    return `/global-projects/_/?${params.toString()}`;
  }
  return tab ? `/global-projects/${id}?tab=${tab}` : `/global-projects/${id}`;
}

export function navigateToGlobalProject(router: RouterLike, id: string, tab?: string): void {
  const href = globalProjectDetailHref(id, tab);
  if (isTauri()) {
    window.location.href = href;
  } else {
    router.push(href);
  }
}
