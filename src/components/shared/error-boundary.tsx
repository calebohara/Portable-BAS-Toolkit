'use client';

import { Component, type ReactNode } from 'react';
import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const error = this.state.error;

      return (
        <div
          className="flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ minHeight: '50vh' }}
        >
          <div className="rounded-full bg-field-danger/10 p-4">
            <AlertTriangle className="h-8 w-8 text-field-danger" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
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
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload App
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
