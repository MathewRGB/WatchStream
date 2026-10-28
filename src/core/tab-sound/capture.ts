import { TAB_SOUND_PORT, type PcmMessage } from './relay';

/** Samples per block: about 43 ms at 48 kHz, small enough for little delay. */
const BLOCK_FRAMES = 2048;

/** The slice of an extension port that the capture uses. */
export interface RelayPort {
  postMessage(message: PcmMessage): void;
  disconnect(): void;
  onDisconnect: { addListener(listener: () => void): void };
}

interface Tapped {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
}

/**
 * What survives a second injection into the same page. An element can be taken over by an audio
 * graph only once, so a retry has to find the graph of the first attempt.
 */
export interface CaptureState {
  tapped: WeakMap<HTMLMediaElement, Tapped>;
  stop?: () => void;
}

export function newCaptureState(): CaptureState {
  return { tapped: new WeakMap() };
}

/** The element worth sharing: one that plays now, else the longest one. */
export function pickMediaElement(doc: Document): HTMLMediaElement | null {
  const all = Array.from(doc.querySelectorAll<HTMLMediaElement>('video, audio'));
  const playing = all.filter((m) => !m.paused && !m.ended && m.readyState >= 2);
  const pool = playing.length > 0 ? playing : all;
  return pool.reduce<HTMLMediaElement | null>(
    (best, m) => (!best || (m.duration || 0) > (best.duration || 0) ? m : best),
    null,
  );
}

/**
 * Sends the sound of the page's video to the WatchStream page. The element is routed through a
 * Web Audio graph: to the speakers, so the host keeps hearing it, and to a processor that copies
 * the samples to the port. Stopping removes the copy and leaves the speakers connected, so the
 * video never goes quiet. Returns whether there was something to capture.
 */
export function startCapture(
  doc: Document,
  state: CaptureState,
  connect: (name: string) => RelayPort,
  createContext: () => AudioContext = () => new AudioContext(),
): boolean {
  state.stop?.();
  state.stop = undefined;

  const media = pickMediaElement(doc);
  if (!media) return false;

  let tapped = state.tapped.get(media);
  if (!tapped) {
    const context = createContext();
    // Throws when the page's own player already took the element over.
    const source = context.createMediaElementSource(media);
    source.connect(context.destination);
    tapped = { context, source };
    state.tapped.set(media, tapped);
  }
  const { context, source } = tapped;
  context.resume().catch(() => undefined);

  const port = connect(TAB_SOUND_PORT);
  const processor = context.createScriptProcessor(BLOCK_FRAMES, 2, 2);
  // A processor only runs while it is connected on to the output, and it must not be heard.
  const silence = context.createGain();
  silence.gain.value = 0;
  processor.onaudioprocess = (event) => {
    const { inputBuffer } = event;
    const channels = Array.from({ length: inputBuffer.numberOfChannels }, (_, i) =>
      Float32Array.from(inputBuffer.getChannelData(i)),
    );
    port.postMessage({ kind: 'pcm', sampleRate: inputBuffer.sampleRate, channels });
  };
  source.connect(processor);
  processor.connect(silence);
  silence.connect(context.destination);

  const stop = () => {
    processor.onaudioprocess = null;
    source.disconnect(processor);
    processor.disconnect();
    silence.disconnect();
    port.disconnect();
    if (state.stop === stop) state.stop = undefined;
  };
  state.stop = stop;
  port.onDisconnect.addListener(stop);
  return true;
}
