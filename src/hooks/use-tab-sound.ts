import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostSession } from '@/core/session/host-session';
import {
  allowTabList,
  autoDetectAllowed,
  detectAudibleTab,
  requestAutoDetect,
  listTabs,
  startTabSound,
  TabSoundError,
  tabSoundSupported,
  type TabChoice,
  type TabSoundHandle,
} from '@/lib/tab-sound';

export interface TabSoundControls {
  /** False where the browser shares tab sound itself. */
  supported: boolean;
  /** The tabs to choose from, or `null` while the list is closed. */
  choices: TabChoice[] | null;
  /** The tab the sound comes from, or `null`. */
  activeTitle: string | null;
  starting: boolean;
  error: string | null;
  openChooser: () => Promise<void>;
  closeChooser: () => void;
  choose: (tab: TabChoice) => Promise<void>;
  stop: () => void;
  /** A track with the tab's sound for a share that starts now, or `null` without a source. */
  soundTrack: () => MediaStreamTrack | null;
  /**
   * Call first thing in the click that starts a share: asks, once, to find the tab on its own.
   * Resolves whether that is allowed; never rejects.
   */
  prepareAuto: () => Promise<void>;
  /** After the share started without sound: finds the playing tab and returns its sound, or `null`. */
  autoSoundTrack: () => Promise<MediaStreamTrack | null>;
}

/**
 * The host can take the sound of a tab's video when the browser will not share it. The sink lives
 * as long as the choice; every share gets its own clone of the track, because ending a share
 * stops its tracks, and the next share needs the sound again.
 */
export function useTabSound(session: HostSession): TabSoundControls {
  const supported = tabSoundSupported();
  const [choices, setChoices] = useState<TabChoice[] | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<TabSoundHandle | null>(null);
  const clones = useRef(new Set<MediaStreamTrack>());
  // `undefined` until asked; a refusal is not asked again while the page stays open.
  const autoAllowed = useRef<boolean | undefined>(undefined);

  const dropClones = useCallback(() => {
    const stream = session.sharedStream;
    const had = [...clones.current].some((track) => stream?.getTracks().includes(track));
    for (const track of clones.current) {
      stream?.removeTrack(track);
      track.stop();
    }
    clones.current.clear();
    if (had) session.refreshSharing();
  }, [session]);

  const soundTrack = useCallback(() => {
    if (!handle.current) return null;
    for (const track of clones.current) {
      if (track.readyState === 'ended') clones.current.delete(track);
    }
    const clone = handle.current.sink.track.clone();
    clones.current.add(clone);
    return clone;
  }, []);

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setActiveTitle(null);
    dropClones();
  }, [dropClones]);

  const openChooser = useCallback(async () => {
    setError(null);
    try {
      if (!(await allowTabList())) {
        setError('WatchStream needs to see your open tabs to offer them.');
        return;
      }
      setChoices(await listTabs());
    } catch {
      setError('The list of tabs could not be read.');
    }
  }, []);

  const attach = useCallback(
    async (tab: TabChoice) => {
      stop();
      const started = await startTabSound(tab, () => {
        handle.current = null;
        setActiveTitle(null);
        dropClones();
      });
      handle.current = started;
      setActiveTitle(started.title);
      setChoices(null);
    },
    [dropClones, stop],
  );

  const prepareAuto = useCallback(async () => {
    if (!supported || handle.current || autoAllowed.current !== undefined) return;
    try {
      autoAllowed.current = (await autoDetectAllowed()) || (await requestAutoDetect());
    } catch {
      autoAllowed.current = false;
    }
  }, [supported]);

  const autoSoundTrack = useCallback(async () => {
    if (!supported || !autoAllowed.current || handle.current) return null;
    try {
      const tab = await detectAudibleTab();
      if (!tab) return null;
      await attach(tab);
      return soundTrack();
    } catch {
      return null; // Nothing found is no failure; the host can still choose a tab in Settings.
    }
  }, [attach, soundTrack, supported]);

  const choose = useCallback(
    async (tab: TabChoice) => {
      setError(null);
      setStarting(true);
      try {
        await attach(tab);
        // A share that is running already gets the sound at once.
        const stream = session.sharedStream;
        if (stream && stream.getAudioTracks().length === 0) {
          const track = soundTrack();
          if (track) stream.addTrack(track);
          session.refreshSharing();
        }
      } catch (caught) {
        setError(
          caught instanceof TabSoundError && caught.failure === 'permission'
            ? 'Without access to that site, its sound cannot be taken.'
            : 'No sound could be taken from that tab. Start the video there and try again. A player that already processes its own sound cannot be used.',
        );
      } finally {
        setStarting(false);
      }
    },
    [attach, session, soundTrack],
  );

  useEffect(() => () => handle.current?.stop(), []);

  return {
    supported,
    choices,
    activeTitle,
    starting,
    error,
    openChooser,
    closeChooser: () => setChoices(null),
    choose,
    stop,
    soundTrack,
    prepareAuto,
    autoSoundTrack,
  };
}
