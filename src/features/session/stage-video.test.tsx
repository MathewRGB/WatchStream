// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StageVideo } from './stage-video';

const stream = new MediaStream();

afterEach(() => {
  // @ts-expect-error - remove the stub again
  delete HTMLMediaElement.prototype.play;
});

function stubPlay(play: () => Promise<void>) {
  HTMLMediaElement.prototype.play = vi.fn(play);
}

describe('StageVideo', () => {
  it('plays the stream and names who shares', () => {
    stubPlay(async () => {});

    render(<StageVideo stream={stream} label="user1 is sharing" />);

    expect((screen.getByTestId('stage-video') as HTMLVideoElement).srcObject).toBe(stream);
    expect(screen.getByTestId('stage-label')).toHaveTextContent('user1 is sharing');
    expect(screen.getByTestId('stage-video')).not.toHaveProperty('muted', true);
  });

  it('mutes and unmutes with the sound button', async () => {
    stubPlay(async () => {});
    render(<StageVideo stream={stream} />);
    const button = screen.getByTestId('sound-button');
    expect(button).toHaveAccessibleName('Mute');

    await userEvent.click(button);
    expect(button).toHaveAccessibleName('Turn sound on');
    expect((screen.getByTestId('stage-video') as HTMLVideoElement).muted).toBe(true);

    await userEvent.click(button);
    expect(button).toHaveAccessibleName('Mute');
  });

  it('falls back to muted playback when the browser refuses sound, and says so', async () => {
    const play = vi.fn().mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    play.mockResolvedValue(undefined);
    HTMLMediaElement.prototype.play = play;

    render(<StageVideo stream={stream} />);

    expect(await screen.findByTestId('sound-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('sound-button')).toHaveAccessibleName('Turn sound on');
    expect((screen.getByTestId('stage-video') as HTMLVideoElement).muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('is silent without a sound button for the host preview', () => {
    stubPlay(async () => {});

    render(<StageVideo stream={stream} silent />);

    expect(screen.queryByTestId('sound-button')).toBeNull();
    expect((screen.getByTestId('stage-video') as HTMLVideoElement).muted).toBe(true);
  });
});
