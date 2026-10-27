// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('plays the host preview from a stream without audio tracks', () => {
    stubPlay(async () => {});
    const video = { kind: 'video' } as MediaStreamTrack;
    const withAudio = Object.assign(new MediaStream(), {
      getVideoTracks: () => [video],
      getAudioTracks: () => [{ kind: 'audio' } as MediaStreamTrack],
    });

    render(<StageVideo stream={withAudio} silent />);

    const shown = (screen.getByTestId('stage-video') as HTMLVideoElement).srcObject;
    expect(shown).not.toBe(withAudio);
  });

  describe('volume', () => {
    const element = () => screen.getByTestId('stage-video') as HTMLVideoElement;
    const slider = () => screen.getByTestId('volume-slider') as HTMLInputElement;
    const moveTo = (value: number) =>
      fireEvent.change(slider(), { target: { value: String(value) } });

    it('starts at the given level', () => {
      stubPlay(async () => {});

      render(<StageVideo stream={stream} volume={0.4} />);

      expect(element().volume).toBe(0.4);
      expect(slider().value).toBe('0.4');
      expect(slider()).toHaveAccessibleName('Volume');
    });

    it('plays at full volume by default', () => {
      stubPlay(async () => {});

      render(<StageVideo stream={stream} />);

      expect(element().volume).toBe(1);
    });

    it('follows the slider and reports the level so it can be remembered', () => {
      stubPlay(async () => {});
      const onChange = vi.fn();
      render(<StageVideo stream={stream} onVolumeChange={onChange} />);

      moveTo(0.3);

      expect(element().volume).toBe(0.3);
      expect(onChange).toHaveBeenCalledWith(0.3);
    });

    it('turns the sound back on when the slider is moved while muted', async () => {
      stubPlay(async () => {});
      render(<StageVideo stream={stream} />);
      await userEvent.click(screen.getByTestId('sound-button'));
      expect(element().muted).toBe(true);
      expect(slider().value).toBe('0');

      moveTo(0.6);

      expect(element().muted).toBe(false);
      expect(element().volume).toBe(0.6);
      expect(screen.getByTestId('sound-button')).toHaveAccessibleName('Mute');
    });

    it('shows the sound as off at volume 0 and brings back a usable level on the button', async () => {
      stubPlay(async () => {});
      const onChange = vi.fn();
      render(<StageVideo stream={stream} onVolumeChange={onChange} />);
      moveTo(0);
      expect(screen.getByTestId('sound-button')).toHaveAccessibleName('Turn sound on');

      await userEvent.click(screen.getByTestId('sound-button'));

      expect(element().volume).toBe(0.5);
      expect(element().muted).toBe(false);
      expect(onChange).toHaveBeenLastCalledWith(0.5);
    });

    it('keeps the level when muting and unmuting', async () => {
      stubPlay(async () => {});
      render(<StageVideo stream={stream} volume={0.7} />);

      await userEvent.click(screen.getByTestId('sound-button'));
      await userEvent.click(screen.getByTestId('sound-button'));

      expect(element().volume).toBe(0.7);
      expect(element().muted).toBe(false);
    });

    it('has no slider for the host preview', () => {
      stubPlay(async () => {});

      render(<StageVideo stream={stream} silent />);

      expect(screen.queryByTestId('volume-slider')).toBeNull();
    });
  });
});
