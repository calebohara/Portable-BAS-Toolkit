'use client';

import { Copy, AlertTriangle } from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';

export function CopyBtn({ value, label }: { value: string; label?: string }) {
  return (
    <button
      onClick={() => { copyToClipboard(value).then(() => toast.success(`Copied ${label || 'value'}`)).catch(() => toast.error('Clipboard access denied')); }}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label || 'value'}`}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export function MonoValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-sm select-all', className)}>{children}</span>;
}

export function SectionCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </h3>
      {children}
    </div>
  );
}

export function ResultRow({ label, value, copyLabel }: { label: string; value: string; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <MonoValue>{value}</MonoValue>
        <CopyBtn value={value} label={copyLabel || label} />
      </div>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-field-warning/10 border border-field-warning/20 px-3 py-2 text-xs text-field-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
