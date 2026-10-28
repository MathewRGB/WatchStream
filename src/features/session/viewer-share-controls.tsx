import { MonitorUp, MonitorX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShareEnd, ShareState } from '@/core/session/viewer-session';
import type { ViewerShareControls as Controls } from '@/hooks/use-viewer-share';
import { StageNote } from './stage-note';

/** What the viewer is told when the host did not let them share, or ended it. */
const SHARE_END_TEXT: Record<ShareEnd, (host: string) => string> = {
  declined: (host) => `${host} did not allow sharing.`,
  busy: () => 'Something is already being shared.',
  revoked: (host) => `${host} ended your share.`,
};

interface ViewerShareControlsProps {
  share: ShareState;
  shareEnd: ShareEnd | null;
  hostName: string;
  /** Somebody's picture is on the stage, so a request would only be answered "busy". */
  stageTaken: boolean;
  controls: Controls;
}

/** The viewer's own share, on the stage: ask, wait, stop, and what the host answered. */
export function ViewerShareControls({
  share,
  shareEnd,
  hostName,
  stageTaken,
  controls,
}: ViewerShareControlsProps) {
  return (
    <>
      {share === 'idle' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void controls.start()}
          // The picker would be wasted on an answer that is clear already.
          disabled={controls.starting || stageTaken}
          title={stageTaken ? 'Something is already being shared.' : undefined}
          data-testid="share-button"
        >
          <MonitorUp /> Share
        </Button>
      )}
      {share === 'requested' && (
        <>
          <StageNote role="status" data-testid="share-waiting">
            Waiting for {hostName} to allow it
          </StageNote>
          <Button variant="secondary" size="sm" onClick={controls.stop} data-testid="share-cancel">
            Cancel
          </Button>
        </>
      )}
      {share === 'sharing' && (
        <Button variant="secondary" size="sm" onClick={controls.stop} data-testid="stop-share">
          <MonitorX /> Stop sharing
        </Button>
      )}
      {share === 'idle' && shareEnd && (
        <StageNote role="status" data-testid="share-notice">
          {SHARE_END_TEXT[shareEnd](hostName)}
        </StageNote>
      )}
      {controls.error && (
        <StageNote role="alert" className="text-destructive" data-testid="share-error">
          {controls.error}
        </StageNote>
      )}
    </>
  );
}
