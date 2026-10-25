import type { PeerConnector } from '../core/peer/message-link';
import { HostSession } from '../core/session/host-session';
import { createHostView } from './views/host-view';
import { createStartView } from './views/start-view';
import { createViewerView } from './views/viewer-view';

export interface AppDependencies {
  connector: PeerConnector;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}

const NAME_KEY = 'watchstream.name';

/** Mounts the WatchStream UI and switches between start, host and viewer views. */
export function mountApp(root: HTMLElement, deps: AppDependencies): void {
  const showStart = () => {
    root.replaceChildren(
      createStartView({
        initialName: deps.storage.getItem(NAME_KEY) ?? '',
        onHost: (name) => {
          deps.storage.setItem(NAME_KEY, name);
          showHost(name);
        },
        onJoin: (name) => {
          deps.storage.setItem(NAME_KEY, name);
          showViewer(name);
        },
      }),
    );
  };

  const showHost = (hostName: string) => {
    const session = new HostSession({ hostName, connector: deps.connector });
    root.replaceChildren(
      createHostView({
        session,
        hostName,
        onEnd: () => {
          session.close();
          showStart();
        },
      }),
    );
  };

  const showViewer = (viewerName: string) => {
    root.replaceChildren(
      createViewerView({ connector: deps.connector, viewerName, onLeave: showStart }),
    );
  };

  showStart();
}
