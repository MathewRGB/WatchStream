import { useState } from 'react';
import type { PeerConnector } from '@/core/peer/message-link';
import { HostSession } from '@/core/session/host-session';
import { trackSession } from '@/core/session/open-sessions';
import { captureDisplay, type CaptureDisplay } from '@/lib/capture';
import { readSetting, writeSetting, type SettingsStorage } from '@/lib/settings-storage';
import { HostView } from './host-view';
import { StartView } from './start-view';
import { ViewerView } from './viewer-view';

export interface SessionAppProps {
  connector: PeerConnector;
  storage: SettingsStorage;
  /** Asks the user what to share; replaced in tests. */
  capture?: CaptureDisplay;
}

type Screen =
  | { kind: 'start' }
  | { kind: 'host'; name: string; session: HostSession; forget: () => void }
  | { kind: 'viewer'; name: string };

/** The WatchP2PStream page: switches between start, host and viewer screens. */
export function SessionApp({ connector, storage, capture = captureDisplay }: SessionAppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });

  const remember = (name: string) => writeSetting(storage, 'name', name);

  switch (screen.kind) {
    case 'start':
      return (
        <div className="grid h-dvh place-items-center overflow-y-auto p-4">
          <div className="w-full max-w-md">
            <StartView
              initialName={readSetting(storage, 'name') ?? ''}
              onHost={(name) => {
                remember(name);
                const session = new HostSession({ hostName: name, connector });
                // If the interface fails, the error page ends the session (see `ErrorBoundary`).
                const forget = trackSession(() => session.close());
                setScreen({ kind: 'host', name, session, forget });
              }}
              onJoin={(name) => {
                remember(name);
                setScreen({ kind: 'viewer', name });
              }}
            />
          </div>
        </div>
      );
    case 'host':
      return (
        <HostView
          session={screen.session}
          hostName={screen.name}
          capture={capture}
          onEnd={() => {
            screen.forget();
            screen.session.close();
            setScreen({ kind: 'start' });
          }}
        />
      );
    case 'viewer':
      return (
        <ViewerView
          connector={connector}
          storage={storage}
          capture={capture}
          viewerName={screen.name}
          onLeave={() => setScreen({ kind: 'start' })}
        />
      );
  }
}
