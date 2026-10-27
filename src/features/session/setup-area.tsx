import type { ReactNode } from 'react';

/**
 * Centers a setup step (joining, sending a reply, an ended session) in the
 * stage. Only this area scrolls if the window is very small; the page never does.
 */
export function SetupArea({ children }: { children: ReactNode }) {
  return (
    <div className="size-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-4 p-4">
        {children}
      </div>
    </div>
  );
}
