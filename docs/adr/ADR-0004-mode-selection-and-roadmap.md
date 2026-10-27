---
id: ADR-0004
title: Stream mode for all content; sync mode moved to future work; new roadmap
status: accepted
date: 2026-10-27
deciders: [Mathias Kuhlmey]
amends: [ADR-0001]
---

# ADR-0004: Stream mode for all content; sync mode moved to future work; new roadmap

> **Revised 2026-10-27:** this ADR first kept sync mode for protected sites and planned it as M4.
> The maintainer then decided to leave sync mode and protected sites out. The mode decision is now
> stream mode only; sync mode is described under
> [Future work](#future-work-sync-mode-for-protected-sites) at the end, and the roadmap lost its
> sync milestone.

## Context

ADR-0001 offered two modes and made sync mode the default for "anything every viewer can open
themselves", YouTube being the first adapter. Things that came up after M1:

- Videos on YouTube can be blocked for individual viewers (region, age, embedding or licensing
  restrictions). In sync mode each viewer loads the video themselves, so a blocked viewer sees
  nothing while everyone else watches. In stream mode the host's rendered picture reaches everyone.
- Protected services (Netflix, Disney+, Prime Video, Max) cannot be captured; the picture turns
  black. Sync mode would be the only way to support them, at the cost of per-site adapters and of
  every viewer needing their own access.

The maintainer also wants one window with a stage for the shared picture, a sidebar for chat and
options and a full-screen mode. That layout is the stream mode's home.

## Decision

### 1. Stream mode for all content

| Content                                  | Mode                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| Everything that plays in the browser     | Stream only; the host's picture is what everyone sees |
| DRM-protected (`video.mediaKeys` is set) | Not supported; its picture turns black when captured  |

YouTube goes through stream mode. There are no per-site adapters and no sync mode.

### 2. Roadmap (replaces the milestone lists in ADR-0001 and the README)

1. **M1:** connection setup by code, chat (done).
2. **M2:** app shell: one window without page scrolling, stage with full-screen mode, sidebar
   with tabs (chat, participants, invite, settings), reply code copied to the clipboard
   automatically with a visible notice (done).
3. **M3:** stream mode. A short spike first: tab capture into the session page in Chrome and
   Brave, display capture without tab audio in Firefox (done).
4. **M4:** side panel or in-page panel next to the streaming tab (needs its own investigation of
   Chrome, Brave and Firefox), optional TURN service.
5. **Later, required:** viewers can share too (see ADR-0005 section 5). Not scheduled yet.

## Consequences

- Stream mode carries all content, so its quality limits matter: host upload and CPU bound the
  quality, and Firefox hosts have no tab audio. The settings tab needs a quality control early.
- Viewers need no access of their own and cannot be blocked individually.
- Protected services cannot be watched together; the README says so.
- No quality is lossless: every picture is re-encoded.
- The sidebar has to work in a narrow window, because M4 may reuse it next to the streaming tab.
- No per-site adapters to maintain.

## Rejected alternatives

- **Sync mode for YouTube:** a blocked viewer is left out silently.
- **Offering two modes for the same content:** two ways to do the same thing, and more UI choices
  before anyone has used either.

## Future work: sync mode for protected sites

Left out by the maintainer (2026-10-27); the design and what a first, removed slice showed are in
[ADR-0001, Future work](ADR-0001-p2p-watchparty-browser-extension.md#future-work-sync-mode-for-protected-sites).
If it is picked up, the mode selection planned here applies:

| Content                                  | Mode                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| DRM-protected (`video.mediaKeys` is set) | Sync only; every viewer needs their own access        |
| Everything else, including YouTube       | Stream only; the host's picture is what everyone sees |

- Per-site adapters for protected services, Netflix first, on top of a generic `<video>` adapter.
- No YouTube adapter and no ad handling for YouTube.
- Sync mode is never offered for unprotected content. A lossless mode for unprotected content
  would be an explicit opt-in with its own decision.
- It would get its own milestone and its own ADR for the wire format, the clock estimate and the
  way the session page reaches the player tabs.
