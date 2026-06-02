'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogBody,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

interface PwslReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user answers "No" — parent opens the rsssafety overlay. */
  onSelectNo: () => void;
}

export function PwslReminderDialog({ open, onOpenChange, onSelectNo }: PwslReminderDialogProps) {
  const setPwslRemindOnLoad = useAppStore((s) => s.setPwslRemindOnLoad);
  const [dontRemind, setDontRemind] = useState(false);

  // Safety gate: this dialog must NOT close on backdrop click or Escape.
  // base-ui's onOpenChange fires for every implicit close (backdrop/Escape);
  // we swallow all `false` requests here so the only way out is the Yes/No
  // handlers, which call props.onOpenChange(false) directly (bypassing this
  // guard). Combined with showCloseButton={false}, there is no accidental exit.
  const handleGuardedOpenChange = (next: boolean) => {
    if (next) onOpenChange(true);
    // next === false from base-ui (backdrop/Escape) is intentionally swallowed.
  };

  const handleNo = () => {
    onSelectNo();
    onOpenChange(false);
  };

  const handleYes = () => {
    if (dontRemind) setPwslRemindOnLoad(false);
    onOpenChange(false);
    toast.success('Stay safe out there');
  };

  return (
    <Dialog open={open} onOpenChange={handleGuardedOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="bg-field-warning/10 border-field-warning/30">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl',
                'bg-field-warning/15 text-field-warning animate-pulse',
              )}
              aria-hidden="true"
            >
              <ShieldAlert className="size-6" />
            </div>
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-field-warning">
                Pre-Work Safety Log Required
              </DialogTitle>
              <DialogDescription>
                Completing your PWSL is mandatory before any work begins, per company
                safety policy. Please confirm before continuing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Taking a moment to log your safety check keeps you and your team protected on site.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            Have you completed your Pre-Work Safety Log (PWSL) for today?
          </p>

          <label
            htmlFor="pwsl-dont-remind"
            className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground"
          >
            <input
              id="pwsl-dont-remind"
              type="checkbox"
              checked={dontRemind}
              onChange={(e) => setDontRemind(e.target.checked)}
              className={cn(
                'size-4 shrink-0 cursor-pointer rounded border border-border bg-background',
                'accent-primary focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
            />
            Don&apos;t remind me on future logins
          </label>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleNo}
            className="text-field-danger hover:text-field-danger hover:bg-field-danger/10 border-field-danger/30"
          >
            No, not yet
          </Button>
          <Button onClick={handleYes} className="font-semibold">
            Yes, I&apos;ve completed it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
