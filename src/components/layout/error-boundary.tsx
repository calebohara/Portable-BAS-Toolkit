'use client';

/**
 * Thin wrapper around the canonical {@link SharedErrorBoundary}.
 *
 * This layout-flavored boundary historically rendered a compact "Try Again"
 * card that resets in place. That behavior now lives in the shared component's
 * `mode="retry"` path; this wrapper just pins that default so existing call
 * sites (e.g. `AppShell`) keep their original behavior.
 *
 * Prefer importing `ErrorBoundary` from `@/components/shared/error-boundary`
 * directly in new code.
 */

import type { ComponentProps } from 'react';
import { ErrorBoundary as SharedErrorBoundary } from '@/components/shared/error-boundary';

type Props = ComponentProps<typeof SharedErrorBoundary>;

export function ErrorBoundary({ mode = 'retry', ...props }: Props) {
  return <SharedErrorBoundary mode={mode} {...props} />;
}
