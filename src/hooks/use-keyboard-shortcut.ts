'use client';

import { useEffect } from 'react';

export function useKeyboardShortcut(key: string, callback: () => void, meta = true) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (meta && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        callback();
      } else if (!meta && e.key.toLowerCase() === key.toLowerCase()) {
        // Only trigger if not in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          e.preventDefault();
          callback();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, meta]);
}
