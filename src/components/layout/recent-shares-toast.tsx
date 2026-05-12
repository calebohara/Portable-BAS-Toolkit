'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { useRecentShares } from '@/hooks/use-recent-shares';

/**
 * Fires a one-shot toast on first session render when the signed-in user has
 * received project shares since their last seen floor. Renders nothing.
 *
 * Mounted once from the root layout. Guarded by a ref so it can't fire twice
 * within the same client lifetime even if the effect re-runs (Strict-Mode
 * double-invoke or React re-render). Hot-reload may re-mount in dev — that's
 * acceptable and not a prod concern.
 */
export function RecentSharesToast() {
  const router = useRouter();
  const { mode } = useAuth();
  const { shares, clearSeen } = useRecentShares();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (toastShownRef.current) return;
    if (mode !== 'authenticated') return;
    if (shares.length === 0) return;
    toastShownRef.current = true;
    const n = shares.length;
    toast.info(
      `${n} new ${n === 1 ? 'project' : 'projects'} shared with you`,
      {
        action: {
          label: 'View',
          onClick: () => {
            router.push('/global-projects');
            clearSeen();
          },
        },
        duration: 8000,
      },
    );
  }, [mode, shares.length, clearSeen, router, shares]);

  return null;
}
