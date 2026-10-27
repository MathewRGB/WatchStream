---
id: ADR-0001
title: P2P watch party as a browser extension with stream mode
status: proposed
date: 2026-10-25
deciders: [Mathias Kuhlmey]
---

# ADR-0001: P2P watch party as a browser extension with stream mode

> **Revised 2026-10-27:** the maintainer decided to leave sync mode and protected sites (Netflix,
> Disney+, Prime Video, Max) out of WatchStream. Everything about them moved to
> [Future work](#future-work-sync-mode-for-protected-sites) at the end; nothing above it depends
> on that section.

## Context

WatchStream enables watching streams together (YouTube and anything else that plays in the
browser), similar to Hyperbeam, but with three hard differences:

1. Delivered first as a **browser extension**, not a web app.
2. **Direct connections** between participants, no media server of our own.
3. One **host** shares what plays in their browser and the viewers watch it, at
   **near-transparent quality**.

Hyperbeam runs a virtual browser in the cloud and streams its picture. That contradicts point 2
and is therefore not adopted.

### Requirements (from shaping, 2026-10-25, revised 2026-10-27)

| Topic                                       | Decision                               |
| ------------------------------------------- | -------------------------------------- |
| Viewers per session                         | 2-3 (plus host)                        |
| Content that plays in the host's browser    | Required                               |
| DRM services (Netflix, Disney+, Prime, Max) | Not supported (see Future work)        |
| Invitation                                  | Copied code, manual handshake accepted |
| Control                                     | Host only                              |
| Browsers                                    | Chrome, Brave, Firefox                 |

### Technical constraints

- **DRM:** Widevine-protected content turns black when a tab or screen is captured. This is a
  deliberate protection by the platforms and will not be circumvented. It is why protected
  services cannot be shared in stream mode.
- **Re-encoding:** every WebRTC capture is re-encoded, so stream mode is never lossless.
- **NAT:** direct connections need STUN for address discovery. With symmetric NAT or CGNAT
  (roughly 10-20 % of cases) no direct connection works without a TURN relay.
- **Signaling:** WebRTC needs a one-time exchange of offer/answer. Without a server this has to
  travel over a channel the users provide themselves (a messenger).
- **Firefox:** no `chrome.tabCapture`. `getDisplayMedia` provides no tab audio there.
- **Brave:** restrictive default WebRTC IP handling policy, which can limit local candidates.
- **Extension URLs:** extension pages have a different address per browser or per installation
  (Firefox: random UUID per installation). A clickable invitation link without a web server is
  therefore not possible across browsers.

## Decision

### 1. One operating mode: stream mode

The host captures what plays in their browser and sends video and audio over WebRTC. Only the
host needs access to the content; viewers see the host's picture.

| Stream mode |                                                             |
| ----------- | ----------------------------------------------------------- |
| Principle   | The host captures the tab and sends video/audio over WebRTC |
| Use         | Everything that plays in the host's browser without DRM     |
| Quality     | Re-encoded, goal: near-transparent                          |
| Requirement | Only the host needs access                                  |
| Load        | Host upload x number of viewers, one encode per viewer      |

Protected content (DRM) is not supported: its picture turns black when captured, and WatchStream
does not circumvent that.

### 2. Topology: star, host at the center

Star topology with the host as the hub. Each viewer has exactly one `RTCPeerConnection` to the
host. With 2-3 viewers no relaying between viewers is needed.

### 3. Transport

- **Data channel** (reliable, ordered) for chat, session management and media negotiation.
- **Media tracks** for the shared picture and sound.
- **STUN:** a public STUN server by default, configurable. No media flows through it.
- **TURN:** not part of the default. A self-configurable TURN server is planned as an optional
  fallback.
- Encryption by WebRTC (DTLS/SRTP), end to end between host and viewer.

### 4. Signaling: manual handshake by code

1. The host creates an **invitation code** (compressed SDP offer with gathered ICE candidates,
   Base64url) and sends it through any messenger.
2. The viewer pastes it into the extension popup and receives a **reply code**, which they send
   back.
3. The host pastes the reply code and the connection is established.

One code pair per viewer. Signaling is encapsulated behind an interface so that an optional,
media-free signaling service can be added later without changing the rest.

### 5. Stream mode

- Capture: Chrome/Brave through `chrome.tabCapture` (video + tab audio). Firefox through
  `getDisplayMedia`, video only. The host is told about this.
  **Amended by [ADR-0005](ADR-0005-stream-mode-media-and-renegotiation.md):** `getDisplayMedia`
  in every browser.
- Quality: `RTCRtpSender.setParameters` with a high `maxBitrate` (guideline: 8-15 Mbit/s for
  1080p), `contentHint = "motion"`, `degradationPreference = "maintain-resolution"`, preferring
  hardware-accelerated codecs (H.264, AV1 where available).
- The host tab keeps playing locally; viewers see it with roughly 200-500 ms latency.

### 6. Platform and build

- TypeScript, one codebase, built for Chrome, Brave and Firefox with WXT.
- Manifest V3. Chrome/Brave: WebRTC and capture in an offscreen document, because the service
  worker cannot hold an `RTCPeerConnection`. Firefox: event page with DOM access.
  **Amended by [ADR-0002](ADR-0002-session-page-and-handshake-protocol.md):** the connections
  live in an extension tab page in all browsers.

## Consequences

### Positive

- No operation of our own media servers, no running infrastructure costs, no content on third
  party systems.
- Viewers need no access of their own: whatever the host can play, everyone sees.
- One mode, one code path: no per-site adapters to maintain.

### Negative and limitations

- **Protected services** (Netflix, Disney+, Prime Video, Max) cannot be watched together.
- Stream mode is **never lossless** and limited by the host's upload
  (guideline: 3 x 8 Mbit/s = 24 Mbit/s).
- **Firefox hosts** have no audio in stream mode.
- Without TURN, some connections fail (CGNAT, strict firewalls).
- Manual handshake: two copy/paste steps per viewer and session.
- A public STUN server learns the participants' public IP addresses.

## Rejected alternatives

- **Cloud browser like Hyperbeam:** contradicts the requirement "no external servers".
- **Circumventing DRM capture:** legally impermissible (circumvention of technical protection
  measures) and violates the services' terms of use.
- **Clickable invitation link:** needs a hosted web page or a signaling service. Postponed,
  can be added through the signaling interface.
- **Viewers relay streams (relay chains):** unnecessary complexity for 2-3 viewers.

## Milestones

> **Superseded by [ADR-0004](ADR-0004-mode-selection-and-roadmap.md):** the current roadmap is
> there. The list below is the original plan, kept for the record.

1. **M1:** connection setup by code, data-channel chat, tested in Chrome, Brave and Firefox,
   including NAT scenarios. Settles the biggest risks first.
2. **M2:** sync mode with the generic adapter, YouTube as the first real case.
3. **M3:** Netflix adapter.
4. **M4:** stream mode (Chrome/Brave as host, all three browsers as viewers).
5. **M5:** more adapters, optional TURN and signaling service, polish.

## Open points

- Concrete public STUN server and a note about it in the privacy policy. M1 uses
  `stun:stun.l.google.com:19302`.
- ~~Check the maximum code length in messengers.~~ Measured in M1: invitation and reply codes are
  below 900 characters (see ADR-0002).
- Measure Brave's behavior with default Shields (not automated in M1; part of the manual test).
- Name "WatchStream": a web search (2026-10-25) found neither an extension of the same name nor a
  trademark, but it was not exhaustive. Before submitting, search the Chrome Web Store and AMO
  directly, as well as TMview and the USPTO. The name will not be protected. No third-party
  trademarks in name or icon; mention services only factually in the description.

## Future work: sync mode for protected sites

Not part of WatchStream (maintainer decision, 2026-10-27). Kept here so the idea, the design and
what was learned do not have to be found again if it is ever picked up.

### Idea

Protected content cannot be captured, so it would be synchronized instead: everyone plays the
content in their own tab and only the playback state travels.

|             | Sync mode                                                                      |
| ----------- | ------------------------------------------------------------------------------ |
| Principle   | Everyone plays the content themselves, only the playback state is synchronized |
| Use         | DRM services (Netflix, Disney+, Prime Video, Max)                              |
| Quality     | Original, no loss                                                              |
| Requirement | Every viewer has their own access to the content                               |
| Load        | Negligible (control messages)                                                  |

DRM would be detected through the `<video>` element (`video.mediaKeys` is set). Only protected
content would use sync mode; YouTube stays in stream mode, because a video can be blocked for a
single viewer by region or age and that viewer would be left out silently.

### Sync protocol (host is authoritative)

- On every state change, and periodically (every second, also while paused, so silence means the
  host is gone), the host sends: position, play/pause, playback rate, host timestamp, content
  identifier. A viewer who joins gets the latest state at once.
- Viewers estimate the clock offset via ping/pong (offset of the fastest round trip of the last
  few) and extrapolate the target position.
- Drift correction on the viewer's machine: small deviations (guideline: < 1 s) through a slightly
  adjusted playback rate, large deviations through a seek, with a pause after a seek so the
  player can settle.
- Viewers send no control commands. Local input on a viewer is reset to the host state.
- If the content identifier differs (different title, different version), the viewer shows a
  warning and is not changed.

### Player adapters

- **Generic adapter:** finds the relevant `<video>` element and uses `play`, `pause`, `seeked`,
  `ratechange`.
- **Dedicated adapters** for services whose players do not tolerate direct manipulation:
  - Netflix: control through the player API in the page context, not through `currentTime`
    (its API shape was never verified).
  - Later: Disney+, Prime Video, Max.

### Learned from a first slice (built in M4, then removed, 2026-10-27)

A working slice with the generic adapter existed and passed end-to-end tests in the real
extension (local page with a real video: play, seek, pause, a late joiner, a different title).
It was removed with the decision above. What it showed:

- The session page holds the connections and the player lives in another tab, so a content script
  per player tab is needed. It talked to the session page through the extension's own messaging;
  the session page asked every tab whether it has a player and the person chose one ("Sync this
  tab"). A script only on the supported sites keeps the extension from asking for access to all
  websites.
- A viewer's first ping has to wait for `welcome`: sent when the link merely opens, it can arrive
  before the host listens and get lost.
- The load grows linearly with the viewers (one small message per viewer and update; the
  correction runs on each viewer's machine), so sync mode would not limit the viewer count.

### Costs to weigh before picking it up

- Every viewer needs their own access to the content; passing it to people without a subscription
  is excluded.
- Dedicated adapters break when services change their players: ongoing maintenance.
- Different regions or versions of the same title can disturb the sync.
- The Netflix adapter could not be tested without a subscription.
