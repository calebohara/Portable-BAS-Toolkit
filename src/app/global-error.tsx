'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0A1628', color: '#e2e8f0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', maxWidth: 400, margin: 0, lineHeight: 1.6 }}>
            BAU Suite encountered an unexpected error. Your data is safe in local storage.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: 8 }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Go to Dashboard
            </button>
            <button
              onClick={reset}
              style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
