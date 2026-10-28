---
id: ADR-0005
title: Stream mode adds media to the live connection and renegotiates over the data channel
status: accepted
date: 2026-10-27
deciders: [Mathias Kuhlmey]
amends: [ADR-0002]
---

# ADR-0005: Stream mode adds media to the live connection and renegotiates over the data channel

## Context

M3 is stream mode (ADR-0004). The handshake of ADR-0002 runs once, before anyone shares anything,
and its codes cannot be exchanged again without the users doing the messenger round trip a
second time. So media has to be added to connections that are already open.

A spike (2026-10-27, throwaway script, Playwright with Chromium and Firefox) checked the parts
that can be automated.

## Spike results

| Question                                                                    | Result                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Can a track be added to an open connection and negotiated over the channel? | Yes, in Chromium → Chromium, Chromium → Firefox and Firefox → Chromium.                     |
| Are new ICE candidates needed for that?                                     | No. The existing transport is reused, so non-trickle signaling stays as it is.              |
| Do frames really render at the viewer?                                      | Yes, with a canvas stream in all three pairings (width/height set, playback time advances). |
| Does Chromium `getDisplayMedia` deliver audio and video tracks?             | Yes, both tracks arrive at a Firefox viewer. Rendered frames were not observed (see below). |
| Does Firefox `getDisplayMedia` work in automation?                          | No: the browser demands a real picker interaction. Needs a manual check.                    |

Not established by the spike:

- **`chrome.tabCapture` itself.** It needs the extension to be invoked by the user (toolbar click
  or `activeTab`), which Playwright cannot do. The API shape is known:
  `getMediaStreamId({ targetTabId, consumerTabId })` in the background script, then
  `getUserMedia` with `chromeMediaSource: 'tab'` in the session page.
- **Frames of a screen capture.** In the headless run no frame arrived at the Firefox viewer
  within 15 s. A static screen produces no frames, so this does not say much either way. The
  automated tests therefore replace the picker with a moving canvas.
- **Firefox tab audio.** Not available by design (ADR-0001, ADR-0004).

## Decision

### 1. Renegotiation runs over the existing data channel

A participant who shares creates a new offer for the connection and sends it over the data
channel; the other side answers on the same channel. Stopping a share ends the stream the same
way. In M3 only the host shares, but nothing in the protocol or in the link ties sharing to the
host (see section 5).

New protocol messages (data-channel protocol stays v1, because unknown types are already dropped
by `parseHostMessage` / `parseViewerMessage`, so an older peer simply ignores sharing). `sourceId`
is the participant id of the sharer, so the stage can say who is sharing.

| Direction     | Message                                   |
| ------------- | ----------------------------------------- |
| host → viewer | `{ type: "media-offer", sourceId, sdp }`  |
| viewer → host | `{ type: "media-answer", sourceId, sdp }` |
| host → viewer | `{ type: "media-stopped", sourceId }`     |

`media-started` always comes before the offer of a share and `media-stopped` ends it. A viewer
shows media only between the two. Presence cannot be read from the offers: the offer that removes
the tracks after a stop makes the browser fire track events too (found in the integration test
"shares again after a stop"), and the viewer must not show those.

Negotiation is symmetric on the link: the host side is the impolite peer and the viewer side the
polite one (the "perfect negotiation" pattern), so two offers that cross resolve themselves. In
M3 this never triggers, because only the host offers; it is built in now because it is hard to
add once links are in use. Negotiations on one link run one at a time.

### 2. Links gain media

`MediaLink` extends `MessageLink` with `setOutgoing(stream | null)` and `receiveSignal(description)`.
The link produces descriptions as `signal` events; the session wraps them in the messages above,
so the session classes never touch `RTCPeerConnection`. Everything the other side sends arrives
as one `MediaStream` that lives as long as the link. The streams that come with browser track
events are not handed on: Chrome makes new ones for each negotiation and takes the tracks out
again, which left a `<video>` element with an empty stream after the second share.

### 3. Capture source: `getDisplayMedia` in every browser

The session page calls `getDisplayMedia({ video, audio })`. The browser shows its own picker, so
the user chooses a tab, window or screen. In Chrome and Brave the picker offers "also share tab
audio" for tabs; Firefox shares no audio. This is one code path for all three browsers and needs no
extra permission.

`chrome.tabCapture` was the first idea (the user clicks the icon on the tab to share). It is not
used: it would change what a click on the icon means, needs the `tabCapture` and `activeTab`
permissions, and its only advantage over the picker, tab audio, `getDisplayMedia` already offers
in Chromium. It can be added later as a shortcut if the picker proves too clumsy.

The part that automation cannot cover is the real picker and the real audio. That is a manual
check on Chrome, Brave and Firefox (the step-by-step guide that closes the milestone).

### 3a. Sound

The capture asks for audio without echo cancellation, noise suppression and automatic gain, in
stereo; those filters are made for voices and muffle music and film sound. The media descriptions
are tuned for Opus with `stereo=1`, `sprop-stereo=1`, `maxaveragebitrate=192000` and in-band FEC
(`tuneOpus`). Measured with noise as the source: Chromium sent about 29 kbit/s and Firefox 64 kbit/s
with the browsers' voice defaults; with this tuning both stay between 90 and 160 kbit/s at the
Balanced preset.

### 4. Quality control

The host chooses one of three presets in the Settings tab: Saver (480p, 24 fps, 1.5 Mbit/s),
Balanced (720p, 30 fps, 3.5 Mbit/s, the default) and Sharp (1080p, 30 fps, 6 Mbit/s). They are
applied per viewer link through `RTCRtpSender.setParameters` (`maxBitrate`, `maxFramerate`,
`scaleResolutionDownBy` for the video, `maxBitrate` of 64, 128 or 192 kbit/s for the sound), at once and while sharing. The browser only allows this once the
negotiation is complete, so a link keeps its limits and applies them after every answer. The
integration test reads the values back from the real senders.

## Consequences

- The icon keeps its meaning: it opens or focuses the session page.
- Every viewer gets its own encoded copy of the stream; host upload and CPU scale with the viewer
  count (up to 12; the host's load is watched and the quality lowered, see
  [ADR-0006](ADR-0006-more-than-three-viewers.md)).
- Accepted at the end of M3 (2026-10-27) after the maintainer's manual runs with real pickers, tab
  audio and the quality presets on two devices in one network. Not yet covered: a run across two
  different public networks, which decides whether a relay (TURN) is needed in M4.

### 5. Streaming by clients is planned, not built in M3

Clients must be able to share too (maintainer requirement, later milestone). The planned design
keeps the star topology: a client asks the host, the host approves (the host stays authoritative),
the client sends its stream to the host, and the host forwards it to the other viewers. Mesh
connections between viewers are rejected: they need new codes for every pair and show viewers each
other's IP addresses, which the privacy statement rules out.

Costs, accepted: the host decodes and re-encodes the forwarded stream, so quality drops a little
and the host's CPU and upload rise; at most one stream is on the stage at a time.

What M3 does now to keep this open: messages carry `sourceId`, negotiation is symmetric, and the
stage shows who is sharing. What it does not do: request/approve messages, forwarding, or any
viewer-side capture.

## Rejected alternatives

- **New handshake codes for media:** repeats the messenger round trip for every share.
- **Mesh between viewers for client streams:** see section 5.
- **A second peer connection for media:** more codes or a second negotiation path; renegotiation
  on the existing connection is simpler and the spike shows it works.
