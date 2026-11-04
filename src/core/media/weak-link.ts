/**
 * What the sender does when the connection to a viewer cannot carry the whole picture. The browser
 * estimates the bandwidth itself and can fall far below the cap on a long or lossy route; this
 * decides what suffers then, and whether the estimate may sink all the way.
 *
 * - `smooth`: keep the frame rate, let the picture get smaller and softer (the browser's default
 *   for video).
 * - `balanced`: trade frame rate and resolution against each other.
 * - `steady`: keep the resolution and let the frame rate drop, and ask the encoder to hold a floor
 *   of bitrate. On a link that really cannot carry the floor this costs lost packets, so it is
 *   the default, because it turned out that sharpness is quite important for most of the cases.
 */
export type WeakLinkMode = 'smooth' | 'balanced' | 'steady';

export const DEFAULT_WEAK_LINK: WeakLinkMode = 'steady';

export interface WeakLinkOption {
  id: WeakLinkMode;
  label: string;
  description: string;
}

export const WEAK_LINK_OPTIONS: readonly WeakLinkOption[] = [
  {
    id: 'smooth',
    label: 'Smooth motion',
    description: 'Keeps the frame rate; the picture gets small and blurry first.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Gives up some frame rate and some sharpness. Right for most hosts.',
  },
  {
    id: 'steady',
    label: 'Steady sharpness',
    description:
      'Keeps the picture sharp and lets the frame rate drop, and holds a minimum bitrate. For a long route with a good line; on a bad one it can stutter.',
  },
];

export type Degradation = 'maintain-framerate' | 'balanced' | 'maintain-resolution';

const DEGRADATION: Record<WeakLinkMode, Degradation> = {
  smooth: 'maintain-framerate',
  balanced: 'balanced',
  steady: 'maintain-resolution',
};

export function degradationFor(mode: WeakLinkMode): Degradation {
  return DEGRADATION[mode];
}

/** Where the encoder starts and the least it is asked to keep, as shares of the cap. */
const STEADY_START_SHARE = 0.7;
const STEADY_FLOOR_SHARE = 0.4;
/** Below this a floor says nothing (kbit/s). */
const MIN_FLOOR_KBPS = 150;

export interface BitrateHints {
  minKbps: number;
  startKbps: number;
}

/** The hints written into the description for a mode and a cap; `null` where there are none. */
export function bitrateHints(mode: WeakLinkMode, capBps: number): BitrateHints | null {
  if (mode !== 'steady') return null;
  const cap = Math.round(capBps / 1000);
  const minKbps = Math.max(MIN_FLOOR_KBPS, Math.round(cap * STEADY_FLOOR_SHARE));
  const startKbps = Math.max(minKbps, Math.round(cap * STEADY_START_SHARE));
  return { minKbps, startKbps };
}

/**
 * Adds Chromium's `x-google-min-bitrate` and `x-google-start-bitrate` to the format line of every
 * video codec in the description (not the retransmission and error-correction entries). Other
 * browsers ignore the parameters. Unchanged without hints.
 */
export function applyBitrateHints(sdp: string, hints: BitrateHints | null): string {
  if (!hints) return sdp;
  const lines = sdp.split('\r\n');
  const out: string[] = [];
  let inVideo = false;
  const payloads = new Set<string>();
  // First pass: which payload types are real video codecs.
  for (const line of lines) {
    if (line.startsWith('m=')) inVideo = line.startsWith('m=video');
    const match = /^a=rtpmap:(\d+) ([^/]+)\//.exec(line);
    if (inVideo && match && !/^(rtx|red|ulpfec|flexfec-03)$/i.test(match[2]!)) {
      payloads.add(match[1]!);
    }
  }
  const extra = `x-google-min-bitrate=${hints.minKbps};x-google-start-bitrate=${hints.startKbps}`;
  const seen = new Set<string>();
  inVideo = false;
  for (const line of lines) {
    if (line.startsWith('m=')) inVideo = line.startsWith('m=video');
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (inVideo && fmtp && payloads.has(fmtp[1]!)) {
      seen.add(fmtp[1]!);
      const kept = fmtp[2]!
        .split(';')
        .filter((part) => !/^\s*x-google-(min|start)-bitrate=/.test(part))
        .join(';');
      out.push(`a=fmtp:${fmtp[1]} ${kept ? `${kept};` : ''}${extra}`);
      continue;
    }
    out.push(line);
    // A codec without a format line gets one right behind its rtpmap line.
    const rtpmap = /^a=rtpmap:(\d+) /.exec(line);
    if (
      inVideo &&
      rtpmap &&
      payloads.has(rtpmap[1]!) &&
      !lines.some((l) => l.startsWith(`a=fmtp:${rtpmap[1]} `))
    ) {
      out.push(`a=fmtp:${rtpmap[1]} ${extra}`);
    }
  }
  return out.join('\r\n');
}
