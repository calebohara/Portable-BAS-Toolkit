'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon | React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

function isLucideIcon(value: unknown): value is LucideIcon {
  return typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in (value as object));
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className={cn('flex flex-col items-center justify-center py-16 text-center', className)}
    >
      <div className="mb-4 rounded-xl bg-muted p-4">
        {isLucideIcon(icon)
          ? React.createElement(icon as LucideIcon, { className: 'h-8 w-8 text-muted-foreground' })
          : (icon as React.ReactNode)}
      </div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
