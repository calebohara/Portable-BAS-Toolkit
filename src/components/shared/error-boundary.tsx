'use client';

import { Component, type ReactNode } from 'react';
import * as React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error UI to identify which section crashed. */
  section?: string;
  /** Custom fallback UI rendered instead of the default error card. */
  fallback?: ReactNode;
  /** Invoked when a render error is caught (after logging). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /**
   * Recovery affordance:
   * - 'reload' (default): full-page "Reload App" button + error details.
   * - 'retry': inline "Try Again" button that resets the boundary in place.
   */
  mode?: 'retry' | 'reload';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary that catches render errors in child components.
 * Shows a recoverable error UI instead of blanking the entire page.
 *
 * Supports two recovery modes:
 * - `reload` (default): page-level fallback with a "Reload App" button and a
 *   collapsible error detail block. Used at the root in `app/layout.tsx`.
 * - `retry`: compact inline fallback with a "Try Again" button that simply
 *   clears the error state. Used around page content in `AppShell`.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      `[ErrorBoundary] ${this.props.section ?? 'Component'} crashed:`,
      error,
      info.componentStack,
    );
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { section, mode = 'reload' } = this.props;
      const error = this.state.error;

      // Inline retry mode — compact card that resets the boundary in place.
      if (mode === 'retry') {
        return (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium text-sm">
                {section ? `${section} encountered an error` : 'Something went wrong'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error?.message ?? 'An unexpected error occurred.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          </div>
        );
      }

      // Reload mode — page-level fallback with error details.
      return (
        <div
          className="flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ minHeight: '50vh' }}
        >
          <div className="rounded-full bg-field-danger/10 p-4">
            <AlertTriangle className="h-8 w-8 text-field-danger" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {section ? `${section} encountered an error` : 'Something went wrong'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              An unexpected error occurred. Your data is safe — try refreshing the page.
            </p>
            {error && (
              <details className="mt-2 text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground">{error.name}: {error.message}</summary>
                <pre className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">{error.stack}</pre>
              </details>
            )}
          </div>
          <Button onClick={this.handleReload} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reload App
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
