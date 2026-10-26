import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPeerConnector, DEFAULT_ICE_SERVERS } from '@/core/peer/peer-link';
import { SessionApp } from '@/features/session/session-app';
import '@/styles/globals.css';

const connector = createPeerConnector({ iceServers: DEFAULT_ICE_SERVERS });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="mx-auto max-w-3xl p-4 pb-12">
      <SessionApp connector={connector} storage={localStorage} />
    </main>
  </StrictMode>,
);
