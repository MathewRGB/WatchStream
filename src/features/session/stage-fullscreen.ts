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

export function useStageFullscreen(): StageFullscreen {
  return useContext(StageFullscreenContext);
}
