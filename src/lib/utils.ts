import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Escape a string for safe inclusion in HTML content */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize a filename to remove path traversal and unsafe characters */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"|?*\\\/]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')          // no leading dots
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .trim()
    || 'unnamed';
}
