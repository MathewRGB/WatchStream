import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from './quality';

const script = readFileSync(
  new URL('../../../scripts/measure-host-load.mjs', import.meta.url),
  'utf8',
);

/** The numbers of one step in the script's table, as it writes them (`600_000`). */
function stepInScript(id: string) {
  const block = new RegExp(`\\b${id}: \\{([^}]*)\\}`).exec(script)?.[1];
  if (!block) return null;
  const read = (name: string) => {
    const value = new RegExp(`${name}: ([0-9_]+)`).exec(block)?.[1];
    return value === undefined ? null : Number(value.replaceAll('_', ''));
  };
  return {
    maxBitrate: read('maxBitrate'),
    maxFramerate: read('maxFramerate'),
    maxHeight: read('maxHeight'),
  };
}

describe('scripts/measure-host-load.mjs', () => {
  it.each(QUALITY_PRESETS.map((preset) => [preset.id, preset] as const))(
    'measures the step %s with the caps the app uses',
    (id, preset) => {
      expect(stepInScript(id)).toEqual({
        maxBitrate: preset.maxBitrateBps,
        maxFramerate: preset.maxFramerate,
        maxHeight: preset.maxHeight,
      });
    },
  );

  it('knows no step the app does not have', () => {
    const named = [...script.matchAll(/^ {2}(\w+): \{ maxBitrate/gm)].map((match) => match[1]);

    expect(named).toEqual(QUALITY_PRESETS.map((preset) => preset.id));
  });
});
