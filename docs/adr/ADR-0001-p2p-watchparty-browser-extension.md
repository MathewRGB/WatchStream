---
id: ADR-0001
title: P2P watch party as a browser extension with sync and stream modes
status: proposed
date: 2026-10-25
deciders: [Mathias Kuhlmey]
---

# ADR-0001: P2P watch party as a browser extension with sync and stream modes

## Context

WatchStream enables watching streams together (Netflix, YouTube and more), similar to Hyperbeam,
but with three hard differences:

1. Delivered first as a **browser extension**, not a web app.
2. **Direct connections** between participants, no media server of our own.
3. One **host** controls playback and the viewers follow, ideally **without quality loss**.

Hyperbeam runs a virtual browser in the cloud and streams its picture. That contradicts point 2
and is therefore not adopted.

### Requirements (from shaping, 2026-10-25)

| Topic                                       | Decision                               |
| ------------------------------------------- | -------------------------------------- |
| Viewers per session                         | 2-3 (plus host)                        |
| DRM services (Netflix, Disney+, Prime, Max) | Required                               |
| Non-DRM content that only the host can open | Required                               |
| Invitation                                  | Copied code, manual handshake accepted |
| Control                                     | Host only                              |
| Browsers                                    | Chrome, Brave, Firefox                 |

### Technical constraints

- **DRM:** Widevine-protected content turns black when a tab or screen is captured. This is a
  deliberate protection by the platforms and will not be circumvented.
- **Re-encoding:** every WebRTC capture is re-encoded. Only playing the original at the viewer's
  end is lossless.
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

### 1. Two operating modes, chosen automatically

|             | Sync mode                                                                      | Stream mode                                                 |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Principle   | Everyone plays the content themselves, only the playback state is synchronized | The host captures the tab and sends video/audio over WebRTC |
| Use         | DRM services, plus anything every viewer can open themselves (e.g. YouTube)    | Non-DRM content that only the host can open                 |
| Quality     | Original, no loss                                                              | Re-encoded, goal: near-transparent                          |
| Requirement | Every viewer has their own access to the content                               | Only the host needs access                                  |
| Load        | Negligible (control messages)                                                  | Host upload x number of viewers, one encode per viewer      |

The extension detects DRM through the `<video>` element (`video.mediaKeys !== null`). With DRM
only sync mode is offered; otherwise the host can choose. Sync mode is the default.

### 2. Topology: mesh, host at the center

Star topology with the host as the hub. Each viewer has exactly one `RTCPeerConnection` to the
host. With 2-3 viewers no relaying between viewers is needed.

### 3. Transport

- **Data channel** (reliable, ordered) for sync messages, chat and session management.
- **Media tracks** in stream mode only.
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

### 5. Sync protocol (host is authoritative)

- On every state change, and periodically (e.g. every second), the host sends: position,
  play/pause, playback rate, host timestamp, content identifier.
- Viewers estimate the clock offset via ping/pong and extrapolate the target position.
- Drift correction: small deviations (guideline: < 1 s) through a slightly adjusted playback
  rate, large deviations through a seek.
- Viewers send no control commands. Local input on a viewer is reset to the host state.
- If the content identifier differs (different title, different version), the viewer shows a
  warning.

### 6. Player adapters

- **Generic adapter:** finds the relevant `<video>` element and uses `play`, `pause`, `seeked`,
  `ratechange`, `waiting`.
- **Dedicated adapters** for services whose players do not tolerate direct manipulation:
  - Netflix: control through the player API in the page context, not through `currentTime`.
  - YouTube: detect ads and pause sync while they play.
  - Later: Disney+, Prime Video, Max.

### 7. Stream mode

- Capture: Chrome/Brave through `chrome.tabCapture` (video + tab audio). Firefox through
  `getDisplayMedia`, video only. The host is told about this.
- Quality: `RTCRtpSender.setParameters` with a high `maxBitrate` (guideline: 8-15 Mbit/s for
  1080p), `contentHint = "motion"`, `degradationPreference = "maintain-resolution"`, preferring
  hardware-accelerated codecs (H.264, AV1 where available).
- The host tab keeps playing locally; viewers see it with roughly 200-500 ms latency.

### 8. Platform and build

- TypeScript, one codebase, built for Chrome, Brave and Firefox with WXT.
- Manifest V3. Chrome/Brave: WebRTC and capture in an offscreen document, because the service
  worker cannot hold an `RTCPeerConnection`. Firefox: event page with DOM access.
  **Amended by [ADR-0002](ADR-0002-session-page-and-handshake-protocol.md):** the connections
  live in an extension tab page in all browsers.

## Consequences

### Positive

- No operation of our own media servers, no running infrastructure costs, no content on third
  party systems.
- In sync mode: original quality and practically no bandwidth load.
- DRM services work legitimately, without circumventing protection measures.

### Negative and limitations

- For DRM services **every viewer needs their own access**. Passing content to people without a
  subscription is excluded.
- Stream mode is **never lossless** and limited by the host's upload
  (guideline: 3 x 8 Mbit/s = 24 Mbit/s).
- **Firefox hosts** have no audio in stream mode.
- Without TURN, some connections fail (CGNAT, strict firewalls).
- Manual handshake: two copy/paste steps per viewer and session.
- A public STUN server learns the participants' public IP addresses.
- Dedicated adapters break when services change their players. This is ongoing maintenance.
- Different regions or versions of the same title can disturb the sync.

## Rejected alternatives

- **Cloud browser like Hyperbeam:** contradicts the requirement "no external servers".
- **Stream mode only:** DRM services would be unusable.
- **Sync mode only:** content that only the host can open could not be shared.
- **Circumventing DRM capture:** legally impermissible (circumvention of technical protection
  measures) and violates the services' terms of use.
- **Clickable invitation link:** needs a hosted web page or a signaling service. Postponed,
  can be added through the signaling interface.
- **Viewers relay streams (relay chains):** unnecessary complexity for 2-3 viewers.

## Milestones

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
  trademarks in name or icon; mention supported services only factually in the description.
