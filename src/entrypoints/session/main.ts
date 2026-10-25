import { createPeerConnector, DEFAULT_ICE_SERVERS } from '@/core/peer/peer-link';
import { mountApp } from '@/ui/app';
import './style.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, {
    connector: createPeerConnector({ iceServers: DEFAULT_ICE_SERVERS }),
    storage: localStorage,
  });
}
