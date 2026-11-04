import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger, describeThrown, scrubMessage } from '@/core/log/logger';
import { Button } from '@/components/ui/button';
import { TechnicalDetails } from '@/features/session/technical-details';

const log = createLogger('ui');

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Runs once when the interface failed; the page ends the sessions that are still running. */
  onError?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Shows what went wrong instead of a blank page when the interface itself fails. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('the interface failed', {
      ...describeThrown(error),
      component: info.componentStack?.split('\n')[1]?.trim() ?? 'unknown',
    });
    this.props.onError?.();
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="grid h-dvh place-items-center overflow-y-auto p-4">
        <div className="flex w-full max-w-md flex-col gap-4" role="alert" data-testid="error-page">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            WatchP2PStream stopped working. Any session on this page has ended. Reload the page to
            start again, and send the technical details to the maintainer if it keeps happening.
          </p>
          <TechnicalDetails details={`Error: ${error.name}: ${scrubMessage(error.message)}`} />
          <div>
            <Button onClick={() => window.location.reload()} data-testid="reload-button">
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
