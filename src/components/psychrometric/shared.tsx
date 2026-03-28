import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function SectionCard({ title, icon: Icon, children, className }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export function PropertyCard({ label, value, unit, icon: Icon }: {
  label: string;
  value: string;
  unit: string;
  icon?: React.ElementType;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(`${value} ${unit}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error('Copy failed'));
  }, [value, unit]);

  return (
    <div className="rounded-lg border border-border bg-background p-2.5 sm:p-3 group relative min-w-0">
      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground leading-tight mb-1">
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="text-base sm:text-lg font-semibold font-mono tabular-nums truncate">{value}</span>
        <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">{unit}</span>
      </div>
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy value"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

export function ComfortBadge({ inComfortZone, reason }: { inComfortZone: boolean; reason: string }) {
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-medium',
      inComfortZone
        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', inComfortZone ? 'bg-green-500' : 'bg-amber-500')} />
      <span className="truncate">{reason}</span>
    </div>
  );
}
