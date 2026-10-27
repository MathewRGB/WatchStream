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

Negotiation is symmetric on the link: the host side is the impolite peer and the viewer side the
polite one (the "perfect negotiation" pattern), so two offers that cross resolve themselves. In
M3 this never triggers, because only the host offers; it is built in now because it is hard to
add once links are in use. Negotiations on one link run one at a time.

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
