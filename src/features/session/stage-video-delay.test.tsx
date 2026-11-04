// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const made: Array<{
  delayMs: number;
  setLevel: ReturnType<typeof vi.fn>;
  setDelay: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];
let resumes = true;

vi.mock('@/core/media/delayed-audio', () => ({
  DelayedAudio: class {
    setLevel = vi.fn();
    setDelay = vi.fn();
    resume = vi.fn(async () => resumes);
    dispose = vi.fn();
    constructor(_stream: MediaStream, delayMs: number) {
      made.push({ delayMs, ...this });
      Object.assign(made[made.length - 1]!, this);
    }
  },
}));

import { StageVideo } from './stage-video';

const stream = new MediaStream();

beforeEach(() => {
  made.length = 0;
  resumes = true;
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  // @ts-expect-error - happy-dom has no AudioContext; the stage only checks that one exists
  globalThis.AudioContext = class {};
});

afterEach(() => {
  // @ts-expect-error - remove the stubs again
  delete HTMLMediaElement.prototype.play;
  // @ts-expect-error - remove the stub again
  delete globalThis.AudioContext;
});

const element = () => screen.getByTestId('stage-video') as HTMLVideoElement;

describe('StageVideo with a delayed sound', () => {
  it('keeps the element muted and plays the sound through the delay instead', () => {
    render(<StageVideo stream={stream} audioDelayMs={2000} />);

    expect(made).toHaveLength(1);
    expect(made[0]!.delayMs).toBe(2000);
    expect(element().muted).toBe(true);
  });

  it('follows the volume slider and the mute button', async () => {
    render(<StageVideo stream={stream} volume={0.4} audioDelayMs={1000} />);
    expect(made[0]!.setLevel).toHaveBeenLastCalledWith(0.4);

    await userEvent.click(screen.getByTestId('sound-button'));

    expect(made[0]!.setLevel).toHaveBeenLastCalledWith(0);
    expect(element().muted).toBe(true);
  });

  it('applies a new length without restarting the sound', () => {
    const { rerender } = render(<StageVideo stream={stream} audioDelayMs={1000} />);
    rerender(<StageVideo stream={stream} audioDelayMs={4000} />);

    expect(made).toHaveLength(1);
    expect(made[0]!.setDelay).toHaveBeenLastCalledWith(4000);
  });

  it('keeps the sound on the delay path at 0 ms when the viewer goes back to Standard', () => {
    const { rerender } = render(<StageVideo stream={stream} audioDelayMs={2000} />);
    rerender(<StageVideo stream={stream} audioDelayMs={0} />);

    // No second jump from the delayed sound to the element's own: same graph, delay 0.
    expect(made).toHaveLength(1);
    expect(made[0]!.dispose).not.toHaveBeenCalled();
    expect(made[0]!.setDelay).toHaveBeenLastCalledWith(0);
    expect(element().muted).toBe(true);
  });

  it('says so when the browser keeps the sound from starting', async () => {
    resumes = false;

    render(<StageVideo stream={stream} audioDelayMs={2000} />);

    expect(await screen.findByTestId('sound-blocked')).toBeInTheDocument();
  });

  it('plays as before with no delay, or where there is no audio context', () => {
    const { unmount } = render(<StageVideo stream={stream} />);
    expect(made).toHaveLength(0);
    unmount();

    // @ts-expect-error - no audio context in this browser
    delete globalThis.AudioContext;
    render(<StageVideo stream={stream} audioDelayMs={2000} />);
    expect(made).toHaveLength(0);
    expect(element().muted).toBe(false);
  });

  it('gives the delayed stage no delay when silent', () => {
    render(<StageVideo stream={stream} silent audioDelayMs={2000} />);

    expect(made).toHaveLength(0);
  });
});
