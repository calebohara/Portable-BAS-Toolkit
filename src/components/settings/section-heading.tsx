'use client';

import { Card, CardContent } from '@/components/ui/card';

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

/** A premium action card for settings controls. */
export function ActionCard({
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  title,
  description,
  children,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
