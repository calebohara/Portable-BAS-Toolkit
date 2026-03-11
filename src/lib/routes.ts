/**
 * Centralized route constants for the BAU Suite app.
 * All navigation targets should reference these constants
 * to prevent route string drift and ease future refactoring.
 */

export const ROUTES = {
  DASHBOARD: '/',
  PROJECTS: '/projects',
  PROJECT_DETAIL: (id: string) => `/projects/${id}`,
  REPORTS: '/reports',
  REPORT_NEW: '/reports/new',
  REPORT_DETAIL: (id: string) => `/reports/${id}`,
  REPORT_EDIT: (id: string) => `/reports/${id}/edit`,
  SEARCH: '/search',
  NETWORK_DIAGRAM: '/network-diagram',
  TERMINAL: '/terminal',
  WEB_INTERFACE: '/web-interface',
  PING: '/ping',
  DOCUMENTS: '/documents',
  OFFLINE: '/offline',
  HELP: '/help',
  SETTINGS: '/settings',
} as const;
