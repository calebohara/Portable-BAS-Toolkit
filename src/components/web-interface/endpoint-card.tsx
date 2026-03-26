'use client';

import { format } from 'date-fns';
import { Star, Play, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildUrl, type WebEndpoint } from '@/store/web-interface-store';

export function EndpointCard({ endpoint: ep, projectName, onLaunch, onEdit, onDelete, onToggleFavorite, onFillForm }: {
  endpoint: WebEndpoint;
  projectName: string;
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onFillForm: () => void;
}) {
  const url = buildUrl(ep);

  return (
    <div className="group rounded-lg border border-border px-3 py-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        <button onClick={onToggleFavorite} className="mt-0.5 shrink-0">
          <Star className={cn('h-3.5 w-3.5 transition-colors', ep.favorite ? 'text-field-warning fill-field-warning' : 'text-muted-foreground/30 hover:text-field-warning')} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium truncate">{ep.friendlyName || ep.host}</p>
            {ep.lastKnownEmbedSupport === 'blocked' && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 text-field-warning border-yellow-300">ext only</Badge>
            )}
            {ep.lastKnownEmbedSupport === 'supported' && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 text-field-success border-green-300">embed ok</Badge>
            )}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground truncate">{url}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {ep.panelName && <span className="text-[10px] text-muted-foreground">{ep.panelName}</span>}
            {projectName && <span className="text-[10px] text-primary/70">{projectName}</span>}
            {ep.lastOpenedAt && (
              <span className="text-[10px] text-muted-foreground/50">
                {format(new Date(ep.lastOpenedAt), 'MMM d')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onLaunch} className="p-1 rounded hover:bg-primary/10 hover:text-primary" title="Launch">
            <Play className="h-3 w-3" />
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-muted" title="Edit">
            <Edit className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive" title="Delete">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
