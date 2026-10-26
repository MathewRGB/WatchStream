import { useState } from 'react';
import type { PeerConnector } from '@/core/peer/message-link';
import { HostSession } from '@/core/session/host-session';
import { HostView } from './host-view';
import { StartView } from './start-view';
import { ViewerView } from './viewer-view';

export interface SessionAppProps {
  connector: PeerConnector;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}

const NAME_KEY = 'watchstream.name';

type Screen =
  | { kind: 'start' }
  | { kind: 'host'; name: string; session: HostSession }
  | { kind: 'viewer'; name: string };

/** The WatchStream page: switches between start, host and viewer screens. */
export function SessionApp({ connector, storage }: SessionAppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });

  const remember = (name: string) => storage.setItem(NAME_KEY, name);

  switch (screen.kind) {
    case 'start':
      return (
        <StartView
          initialName={storage.getItem(NAME_KEY) ?? ''}
          onHost={(name) => {
            remember(name);
            setScreen({
              kind: 'host',
              name,
              session: new HostSession({ hostName: name, connector }),
            });
          }}
          onJoin={(name) => {
            remember(name);
            setScreen({ kind: 'viewer', name });
          }}
        />
      );
    case 'host':
      return (
        <HostView
          session={screen.session}
          hostName={screen.name}
          onEnd={() => {
            screen.session.close();
            setScreen({ kind: 'start' });
          }}
        />
      );
    case 'viewer':
      return (
        <ViewerView
          connector={connector}
          viewerName={screen.name}
          onLeave={() => setScreen({ kind: 'start' })}
        />
      );
  }
}
