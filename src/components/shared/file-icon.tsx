'use client';

import { FileText, FileSpreadsheet, FileImage, FileArchive, File, Database, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-red-500' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-600' },
  xls: { icon: FileSpreadsheet, color: 'text-green-600' },
  csv: { icon: FileSpreadsheet, color: 'text-green-500' },
  docx: { icon: FileText, color: 'text-blue-600' },
  doc: { icon: FileText, color: 'text-blue-600' },
  txt: { icon: FileCode, color: 'text-gray-500' },
  png: { icon: FileImage, color: 'text-purple-500' },
  jpg: { icon: FileImage, color: 'text-purple-500' },
  jpeg: { icon: FileImage, color: 'text-purple-500' },
  webp: { icon: FileImage, color: 'text-purple-500' },
  zip: { icon: FileArchive, color: 'text-amber-600' },
  pxc: { icon: Database, color: 'text-primary' },
  bak: { icon: Database, color: 'text-primary' },
  db: { icon: Database, color: 'text-primary' },
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
