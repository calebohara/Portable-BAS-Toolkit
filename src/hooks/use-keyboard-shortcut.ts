'use client';

import { useEffect, useRef } from 'react';

export function useKeyboardShortcut(key: string, callback: () => void, meta = true) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when focus is in an editable field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      if (meta ? (e.metaKey || e.ctrlKey) && e.key === key : e.key === key) {
        e.preventDefault();
        callbackRef.current();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, meta]);
}
