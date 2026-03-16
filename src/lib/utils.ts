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

/** Copy text to clipboard with fallback for non-HTTPS contexts */
export async function copyToClipboard(text: string): Promise<void> {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to legacy method
    }
  }
  // Legacy fallback using textarea + execCommand
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

/** Sanitize a filename to remove path traversal and unsafe characters */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"|?*\\\/]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')          // no leading dots
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .trim()
    .substring(0, 200)
    || 'unnamed';
}
