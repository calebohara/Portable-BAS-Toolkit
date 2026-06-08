// Tiny event bus so the share dialog can tell the local project page to
// recompute its "unshared changes" count (e.g. drop it to 0 after a share).

export const UNSHARED_CHANGED_EVENT = 'bau-unshared-changed';

/** Notify that a project's unshared-changes count may have changed. */
export function emitUnsharedChanged(projectId: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNSHARED_CHANGED_EVENT, { detail: { projectId } }));
  }
}

/** Subscribe to unshared-changed events. Returns an unsubscribe function. */
export function onUnsharedChanged(cb: (projectId: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const id = (e as CustomEvent<{ projectId: string }>).detail?.projectId;
    if (id) cb(id);
  };
  window.addEventListener(UNSHARED_CHANGED_EVENT, handler);
  return () => window.removeEventListener(UNSHARED_CHANGED_EVENT, handler);
}
