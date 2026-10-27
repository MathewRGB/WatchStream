import { createContext, useContext } from 'react';

/** What the stage needs to offer full screen. The app shell owns it, because it is the shell's workspace that fills the screen. */
export interface StageFullscreen {
  active: boolean;
  supported: boolean;
  toggle: () => Promise<void>;
}

/** Without an app shell around it a stage has no full screen, and so no button for it. */
export const StageFullscreenContext = createContext<StageFullscreen>({
  active: false,
  supported: false,
  toggle: async () => {},
});

/**
 * What lets a control go when the workspace is idle in full screen, so only the picture is left:
 * it fades out and stops taking clicks. The workspace is the `group/workspace` and carries
 * `data-idle`; outside full screen that is never "true", so these classes do nothing there.
 */
export const HIDE_WHEN_IDLE =
  'group-data-[idle=true]/workspace:pointer-events-none group-data-[idle=true]/workspace:opacity-0';

/** `HIDE_WHEN_IDLE` for a control that has no transition of its own. */
export const FADE_WHEN_IDLE = `transition-opacity duration-300 motion-reduce:transition-none ${HIDE_WHEN_IDLE}`;

export function useStageFullscreen(): StageFullscreen {
  return useContext(StageFullscreenContext);
}
