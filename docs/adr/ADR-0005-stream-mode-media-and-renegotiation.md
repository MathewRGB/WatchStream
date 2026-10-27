---
id: ADR-0005
title: Stream mode adds media to the live connection and renegotiates over the data channel
status: proposed
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
  within 15 s. A static screen produces no frames, so this does not say much either way.
- **Firefox tab audio.** Not available by design (ADR-0001, ADR-0004).

## Decision

### 1. Renegotiation runs over the existing data channel

The host owns the media. When it starts or stops sharing, it creates a new offer for each viewer
and sends it over that viewer's data channel; the viewer answers on the same channel. Viewers
never offer media in M3.

New protocol messages (data-channel protocol stays v1, because unknown types are already dropped
by `parseHostMessage` / `parseViewerMessage`, so an older viewer simply ignores sharing):

| Direction     | Message                         |
| ------------- | ------------------------------- |
| host → viewer | `{ type: "media-offer", sdp }`  |
| viewer → host | `{ type: "media-answer", sdp }` |
| host → viewer | `{ type: "media-stopped" }`     |

The host serializes negotiations per viewer (one at a time) so offers cannot cross.

### 2. `MessageLink` gains media

A link that can carry media is a separate interface that extends `MessageLink`, so chat-only code
and the in-memory fakes keep working. `PeerLink` implements it by exposing track add/remove and
`negotiate()` / `applyRemoteDescription()`; the session classes never touch `RTCPeerConnection`.

### 3. Capture source per browser (to be confirmed by the first manual run)

- **Chrome / Brave:** the user clicks the toolbar icon _on the tab to share_. That grants
  `activeTab` for it. The background script passes that tab id and the session tab id to
  `chrome.tabCapture.getMediaStreamId`, and the session page opens the stream. Permissions:
  `tabCapture` and `activeTab`.
- **Firefox:** `getDisplayMedia` from the session page, without tab audio.

### 4. Quality control

The host chooses a maximum resolution and bitrate (settings tab). It is applied through
`RTCRtpSender.setParameters`, so it can change while sharing.

## Consequences

- Clicking the icon on a video tab now means "share this tab" once a session exists, and "open
  or focus the session page" otherwise.
- Every viewer gets its own encoded copy of the stream; host upload scales with the viewer count
  (max 3).
- Status stays `proposed` until the manual run on Chrome, Brave and Firefox has confirmed section 3.

## Rejected alternatives

- **New handshake codes for media:** repeats the messenger round trip for every share.
- **A second peer connection for media:** more codes or a second negotiation path; renegotiation
  on the existing connection is simpler and the spike shows it works.
- **Viewers offering media:** not needed for watching; keeps the host authoritative (ADR-0002).
