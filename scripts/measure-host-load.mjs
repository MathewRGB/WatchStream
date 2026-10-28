// Measures what one host costs per viewer in stream mode: how many frames a second and bits a
// second each viewer gets, and how much encoder time that takes, for a number of viewers and a
// quality step. These are the numbers in docs/architecture.md, section 7. Run `node scripts/measure-host-load.mjs
// --help` for the options.
//
// How: the host browser sends one animated 1080p canvas to N local connections with the caps of the
// app's quality steps; the viewers run in a second browser process, so the host does not decode
// them. On Linux the host browser can be pinned to a number of cores with `taskset`, to stand in
// for a smaller computer. Software encoding in headless Chromium and a demanding picture make the
// numbers pessimistic; they show the shape (one encode per viewer, finite CPU), not a promise.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// The caps of src/core/media/quality.ts. A test keeps the two in step.
const STEPS = {
  minimal: { maxBitrate: 600_000, maxFramerate: 15, maxHeight: 360 },
  saver: { maxBitrate: 1_500_000, maxFramerate: 24, maxHeight: 480 },
  balanced: { maxBitrate: 3_500_000, maxFramerate: 30, maxHeight: 720 },
  sharp: { maxBitrate: 6_000_000, maxFramerate: 30, maxHeight: 1080 },
};

const DEFAULT_RUNS = ['sharp:1', 'sharp:3', 'balanced:1', 'balanced:3', 'balanced:6', 'saver:12'];

const HELP = `Usage: node scripts/measure-host-load.mjs [options]

  --run <step>:<viewers>   One measurement, e.g. balanced:6. Repeat for several.
                           Steps: ${Object.keys(STEPS).join(', ')}.
                           Default: ${DEFAULT_RUNS.join(' ')}
  --host-cores <list>      Pin the host browser to these cores (taskset syntax, e.g. 0-3).
  --viewer-cores <list>    Pin the viewer browser to these cores, e.g. 4-13.
  --warmup <seconds>       Time to let the browser climb to full resolution (default 20).
  --measure <seconds>      Time to measure (default 6).
  --json                   Print one JSON object per run instead of a table.
  --help                   This text.
`;

function parseArguments(argv) {
  const options = { runs: [], warmup: 20, measure: 6, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`${flag} needs a value.`);
      return argv[i];
    };
    if (flag === '--help') options.help = true;
    else if (flag === '--json') options.json = true;
    else if (flag === '--run') options.runs.push(value());
    else if (flag === '--host-cores') options.hostCores = value();
    else if (flag === '--viewer-cores') options.viewerCores = value();
    else if (flag === '--warmup') options.warmup = Number(value());
    else if (flag === '--measure') options.measure = Number(value());
    else throw new Error(`Unknown option ${flag}. Try --help.`);
  }
  if (options.runs.length === 0) options.runs = DEFAULT_RUNS;
  return options;
}

function parseRun(text) {
  const [step, viewers] = text.split(':');
  const count = Number(viewers);
  if (!(step in STEPS) || !Number.isInteger(count) || count < 1) {
    throw new Error(`"${text}" is not a run: use <step>:<viewers>, e.g. balanced:6.`);
  }
  return { step, count };
}

/** Launches Chromium, pinned to cores through a small wrapper when asked to. */
async function launch(directory, name, cores) {
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (!cores) return chromium.launch({ channel: 'chromium', args });
  const wrapper = join(directory, `${name}.sh`);
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec taskset -c ${cores} "${chromium.executablePath()}" "$@"\n`,
  );
  chmodSync(wrapper, 0o755);
  return chromium.launch({ executablePath: wrapper, args });
}

async function measure(hostBrowser, viewerBrowser, run, options) {
  const step = STEPS[run.step];
  const hostPage = await hostBrowser.newPage();
  const viewerPage = await viewerBrowser.newPage();
  await Promise.all([hostPage.goto('about:blank'), viewerPage.goto('about:blank')]);

  const defineGathered = () => {
    // Resolves once the connection has gathered all its candidates (no trickle).
    window.__gathered = (pc) =>
      new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') resolve();
        else {
          pc.addEventListener(
            'icegatheringstatechange',
            () => pc.iceGatheringState === 'complete' && resolve(),
          );
        }
      });
  };
  await Promise.all([hostPage.evaluate(defineGathered), viewerPage.evaluate(defineGathered)]);

  await hostPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      frame += 1;
      const gradient = context.createLinearGradient((frame * 9) % 1920, 0, 1920, 1080);
      gradient.addColorStop(0, `hsl(${(frame * 3) % 360},70%,45%)`);
      gradient.addColorStop(1, `hsl(${(frame * 3 + 120) % 360},70%,25%)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1920, 1080);
      for (let i = 0; i < 260; i += 1) {
        context.fillStyle = `hsl(${(i * 7 + frame * 5) % 360},80%,${30 + ((i * 13 + frame) % 50)}%)`;
        context.fillRect(
          (i * 97 + frame * (3 + (i % 7))) % 1900,
          (i * 53 + frame * (2 + (i % 5))) % 1060,
          24 + (i % 40),
          18 + (i % 30),
        );
      }
    };
    draw();
    setInterval(draw, 1000 / 30);
    window.__stream = canvas.captureStream(30);
    window.__links = [];
  });
  await viewerPage.evaluate(() => {
    window.__viewers = [];
  });

  for (let i = 0; i < run.count; i += 1) {
    const offer = await hostPage.evaluate(async () => {
      const pc = new RTCPeerConnection();
      const track = window.__stream.getVideoTracks()[0];
      const sender = pc.addTrack(track, window.__stream);
      await pc.setLocalDescription(await pc.createOffer());
      await window.__gathered(pc);
      window.__links.push({ pc, sender });
      return pc.localDescription.sdp;
    });
    const answer = await viewerPage.evaluate(
      async ({ sdp }) => {
        const pc = new RTCPeerConnection();
        pc.ontrack = (event) => {
          const video = document.createElement('video');
          video.autoplay = true;
          video.muted = true;
          video.srcObject = event.streams[0];
          document.body.append(video);
        };
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await window.__gathered(pc);
        window.__viewers.push(pc);
        return pc.localDescription.sdp;
      },
      { sdp: offer },
    );
    await hostPage.evaluate(
      async ({ answer, index, step }) => {
        const { pc, sender } = window.__links[index];
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        const parameters = sender.getParameters();
        for (const encoding of parameters.encodings) {
          encoding.maxBitrate = step.maxBitrate;
          encoding.maxFramerate = step.maxFramerate;
          encoding.scaleResolutionDownBy = Math.max(1, 1080 / step.maxHeight);
        }
        await sender.setParameters(parameters);
      },
      { answer, index: i, step },
    );
  }

  const sample = () =>
    hostPage.evaluate(async () => {
      const rows = [];
      for (const { pc } of window.__links) {
        for (const report of (await pc.getStats()).values()) {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            rows.push({
              now: performance.now(),
              bytes: report.bytesSent,
              frames: report.framesEncoded,
              encode: report.totalEncodeTime,
              width: report.frameWidth,
              height: report.frameHeight,
            });
          }
        }
      }
      return rows;
    });
  await hostPage.waitForTimeout(options.warmup * 1000);
  const before = await sample();
  await hostPage.waitForTimeout(options.measure * 1000);
  const after = await sample();
  const seconds = (after[0].now - before[0].now) / 1000;
  let bytes = 0;
  let frames = 0;
  let encode = 0;
  const sizes = new Set();
  after.forEach((row, i) => {
    bytes += row.bytes - before[i].bytes;
    frames += row.frames - before[i].frames;
    encode += row.encode - before[i].encode;
    sizes.add(`${row.width}x${row.height}`);
  });
  await Promise.all([hostPage.close(), viewerPage.close()]);
  return {
    step: run.step,
    viewers: run.count,
    mbitEach: Math.round((bytes * 8) / seconds / run.count / 10_000) / 100,
    fpsEach: Math.round((frames / seconds / run.count) * 10) / 10,
    targetFps: step.maxFramerate,
    encoderCores: Math.round((encode / seconds) * 100) / 100,
    size: [...sizes].join(' '),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  const runs = options.runs.map(parseRun);
  const directory = mkdtempSync(join(tmpdir(), 'watchstream-load-'));
  const hostBrowser = await launch(directory, 'host', options.hostCores);
  const viewerBrowser = await launch(directory, 'viewer', options.viewerCores);
  const cores = options.hostCores ?? 'all';
  try {
    if (!options.json) {
      console.log(
        '| Host cores | Step (target) | Viewers | Mbit/s each | Frames/s each | Cores used |',
      );
      console.log(
        '| ---------- | ------------- | ------- | ----------- | ------------- | ---------- |',
      );
    }
    for (const run of runs) {
      const result = await measure(hostBrowser, viewerBrowser, run, options);
      if (options.json) console.log(JSON.stringify({ hostCores: cores, ...result }));
      else {
        console.log(
          `| ${cores} | ${result.step} (${result.targetFps}) | ${result.viewers} | ${result.mbitEach} | ${result.fpsEach} | ${result.encoderCores} |`,
        );
      }
    }
  } finally {
    await Promise.all([hostBrowser.close(), viewerBrowser.close()]);
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
