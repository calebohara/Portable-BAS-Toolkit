'use client';

import { FileText, FileSpreadsheet, FileImage, FileArchive, File, Database, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-[var(--color-field-danger)]' },
  xlsx: { icon: FileSpreadsheet, color: 'text-[var(--color-field-success)]' },
  xls: { icon: FileSpreadsheet, color: 'text-[var(--color-field-success)]' },
  csv: { icon: FileSpreadsheet, color: 'text-[var(--color-field-success)]' },
  docx: { icon: FileText, color: 'text-[var(--color-field-info)]' },
  doc: { icon: FileText, color: 'text-[var(--color-field-info)]' },
  txt: { icon: FileCode, color: 'text-muted-foreground' },
  png: { icon: FileImage, color: 'text-[var(--color-field-info)]' },
  jpg: { icon: FileImage, color: 'text-[var(--color-field-info)]' },
  jpeg: { icon: FileImage, color: 'text-[var(--color-field-info)]' },
  webp: { icon: FileImage, color: 'text-[var(--color-field-info)]' },
  zip: { icon: FileArchive, color: 'text-[var(--color-field-warning)]' },
  pxc: { icon: Database, color: 'text-primary' },
  bak: { icon: Database, color: 'text-primary' },
  db: { icon: Database, color: 'text-primary' },
  p2: { icon: Database, color: 'text-primary' },
  pcl: { icon: FileCode, color: 'text-muted-foreground' },
};

export function FileIcon({ fileType, className }: { fileType: string; className?: string }) {
  const ext = fileType.toLowerCase().replace('.', '');
  const entry = iconMap[ext] || { icon: File, color: 'text-muted-foreground' };
  const Icon = entry.icon;
  return <Icon className={cn('h-5 w-5', entry.color, className)} />;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
