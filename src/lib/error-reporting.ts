/**
 * Centralized error handling utilities.
 *
 * Use `reportError` for unexpected failures that should be visible to the user.
 * Use `silently` as a `.catch()` handler for operations where failure is
 * genuinely acceptable (e.g. service worker registration, optional API calls).
 */

import { toast } from 'sonner';

/**
 * Report an error with context. Logs to console and optionally shows a toast.
 *
 * @param operation - Short description of what failed (e.g. "load storage estimate")
 * @param error - The caught error
 * @param options.silent - If true, only logs to console without showing a toast (default: false)
 */
export function reportError(
  operation: string,
  error: unknown,
  options?: { silent?: boolean },
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${operation}:`, error);

  if (!options?.silent) {
    toast.error(`Failed to ${operation}`, {
      description: message,
      duration: 5000,
    });
  }
}

/**
 * Explicit no-op catch handler. Use this instead of `.catch(() => {})` to
 * signal that the failure is intentionally ignored.
 *
 * Example: `navigator.serviceWorker.register('/sw.js').catch(silently);`
 */
export function silently(): void {
  // Intentionally empty — failure is acceptable for this operation.
}
