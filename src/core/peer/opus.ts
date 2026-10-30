import { CUSTOM_AUDIO_BITRATES_BPS } from '../media/quality';

/**
 * Browsers set Opus up for voice calls: mono and about 32 kbit/s. What the host
 * shares is mostly music and film sound, so the description asks for stereo and
 * a higher rate. `stereo=1` and `maxaveragebitrate` in the receiver's line tell
 * the sender what it may send; the sender's own limit is set separately (the host's
 * choice). The receiver takes the highest rate the host can choose, so that its line
 * never says less than what the host may send.
 */
export const OPUS_MAX_AVERAGE_BITRATE_BPS = Math.max(...CUSTOM_AUDIO_BITRATES_BPS);

const OPUS_PARAMETERS: Record<string, string> = {
  stereo: '1',
  'sprop-stereo': '1',
  maxaveragebitrate: String(OPUS_MAX_AVERAGE_BITRATE_BPS),
  // Forward error correction makes a lost packet sound like a short gap, not a crackle.
  useinbandfec: '1',
};

/** Returns the description with the Opus format line tuned for music; unchanged without Opus. */
export function tuneOpus(sdp: string): string {
  const payload = /^a=rtpmap:(\d+) opus\/48000\/2\s*$/im.exec(sdp)?.[1];
  if (!payload) return sdp;

  const lines = sdp.split('\r\n');
  const fmtp = lines.findIndex((line) => line.startsWith(`a=fmtp:${payload} `));
  if (fmtp === -1) {
    const rtpmap = lines.findIndex((line) => line.startsWith(`a=rtpmap:${payload} `));
    lines.splice(rtpmap + 1, 0, `a=fmtp:${payload} ${format(OPUS_PARAMETERS)}`);
    return lines.join('\r\n');
  }

  const existing = parse(lines[fmtp]!.slice(`a=fmtp:${payload} `.length));
  lines[fmtp] = `a=fmtp:${payload} ${format({ ...existing, ...OPUS_PARAMETERS })}`;
  return lines.join('\r\n');
}

function parse(parameters: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of parameters.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key) result[key] = value.join('=');
  }
  return result;
}

function format(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([key, value]) => (value === '' ? key : `${key}=${value}`))
    .join(';');
}
