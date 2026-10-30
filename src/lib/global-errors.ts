import { createLogger, describeThrown, scrubMessage } from '@/core/log/logger';

const log = createLogger('page');

/** Writes errors that nothing caught to the log, so they show up next to everything else. */
export function installGlobalErrorLogging(target: Window = window): () => void {
  const onError = (event: ErrorEvent) =>
    log.error('uncaught error', { message: scrubMessage(event.message), line: event.lineno });
  const onRejection = (event: PromiseRejectionEvent) =>
    log.error('unhandled promise rejection', describeThrown(event.reason));
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
