import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPeerConnector, DEFAULT_ICE_SERVERS } from '@/core/peer/peer-link';
import { endAllSessions } from '@/core/session/open-sessions';
import { ErrorBoundary } from '@/components/error-boundary';
import { SessionApp } from '@/features/session/session-app';
import { installGlobalErrorLogging } from '@/lib/global-errors';
import '@/styles/globals.css';

installGlobalErrorLogging();
const connector = createPeerConnector({ iceServers: DEFAULT_ICE_SERVERS });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary onError={endAllSessions}>
      <SessionApp connector={connector} storage={localStorage} />
    </ErrorBoundary>
  </StrictMode>,
);
