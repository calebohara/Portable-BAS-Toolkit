import type { FileCategory } from '@/types';

/**
 * Per-category accepted file types, shared by the local and global upload
 * dialogs so file ingestion validation can't drift between the two paths.
 *
 * `accept` is the `<input accept="...">` value; `extensions` is the canonical
 * allow-list (lowercased, dot-prefixed) used for explicit validation; `'*'`
 * accept means "any type allowed".
 */
export const ACCEPTED_TYPES: Record<FileCategory, { extensions: string[]; accept: string; description: string }> = {
  'panel-databases': { extensions: ['.p2'], accept: '.p2', description: 'P2 files' },
  'wiring-diagrams': { extensions: ['.pdf'], accept: '.pdf', description: 'PDF files' },
  'sequences': { extensions: ['.txt', '.pdf'], accept: '.txt,.pdf', description: 'TXT or PDF files' },
  'backups': { extensions: ['.p2'], accept: '.p2', description: 'P2 files' },
  'ip-plan': { extensions: ['.xlsx', '.csv', '.pdf'], accept: '.xlsx,.csv,.pdf', description: 'XLSX, CSV, or PDF files' },
  'device-list': { extensions: ['.xlsx', '.csv'], accept: '.xlsx,.csv', description: 'XLSX or CSV files' },
  'general-documents': { extensions: [], accept: '*', description: 'Any file (PDF, DOCX, XLSX, images, etc.)' },
  'other': { extensions: [], accept: '*', description: 'Any file' },
};

/** Lowercased extension without the dot, or '' when the name has none. */
export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

/**
 * Returns an error message when the file's extension is not allowed for the
 * given category, or null when the file is acceptable. Categories whose accept
 * is `'*'` allow any extension.
 */
export function validateFileForCategory(fileName: string, category: FileCategory): string | null {
  const accepted = ACCEPTED_TYPES[category];
  if (!accepted || accepted.accept === '*') return null;
  const ext = '.' + getFileExtension(fileName);
  if (!accepted.extensions.includes(ext)) {
    return `"${fileName}" — invalid type. Expected: ${accepted.description}`;
  }
  return null;
}
