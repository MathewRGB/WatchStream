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
4. **M4:** the sidebar in full screen: full screen takes the stage and the sidebar, and the
   sidebar slides in over the picture when the pointer touches the right edge (done, section 3).
5. **M5:** up to 12 viewers: a load monitor lowers the quality when the host cannot keep up,
   several invitations at once, removing a viewer
   ([ADR-0006](ADR-0006-more-than-three-viewers.md); done).
6. **Later:** the optional TURN service (the test across two networks passed without it, so it waits for
   reports of failures); viewers can share
   too, which is required (see ADR-0005 section 5). Not scheduled yet.

### 3. The sidebar in full screen

The host wants chat and the list of people while the picture fills the screen. The answer is the
existing sidebar, not a second one:

- The app shell owns full screen and puts its workspace (stage and sidebar, not the header) into
  it. The sidebar is the same element in and out of full screen, so typed text, scroll position and
  the chosen tab survive.
- In full screen the sidebar waits off-screen, inert. It slides in over the picture, which does not
  move, when the pointer touches a 16 px strip at the right edge, and slides out 400 ms after the
  pointer left. It stays while something inside has focus, and a click on the picture closes it.
- For screens where the pointer cannot reach the edge (touch, a second monitor on the right) a
  handle at the edge, which is a real button, and the `S` key show and hide it. `S` is ignored while
  typing in a field and with Ctrl, Alt or Cmd held.
- Anything that has to be visible in full screen must live inside the workspace: popups that
  render into `body` (Radix portals) would be hidden by full screen. The sidebar has none today.
- Only the picture when idle: three seconds without a pointer move, key, click or scroll make the
  workspace idle (`data-idle`). Every control fades out and stops taking clicks, and the mouse
  pointer is hidden everywhere in the workspace, also over controls that set their own pointer. The
  first sign of activity ends it. The pointer resting on the sidebar or the edge strip is not idle,
  because that is someone reading. A pointer move to the position the pointer already has is
  ignored: a browser sends one when the element under a resting pointer changes, which hiding the
  controls does. A new control that should go with the rest takes the classes in
  `stage-fullscreen.ts`; there is no list to keep.

- A message in full screen: when a message from somebody else comes in, a small round chat symbol
  appears near the right edge for one second. It is shown also when the controls have faded, takes
  no clicks and counts as no activity. It stays away while the sidebar is open and in view (open
  but faded away counts as not in view), and outside full screen. Only messages from others count.
- The off-screen sidebar must never be scrolled into view: the full-screen workspace is clipped
  (`overflow: clip`), and the chat scrolls only its own list, never with `scrollIntoView`, which
  also scrolls every parent. Doing it the other way pushed the picture sideways when a message
  came in.

Not done: a count of unread messages, or a notice that tells who wrote.

## Consequences

- Stream mode carries all content, so its quality limits matter: host upload and CPU bound the
  quality, and Firefox hosts have no tab audio. The settings tab needs a quality control early.
- Viewers need no access of their own and cannot be blocked individually.
- Protected services cannot be watched together; the README says so.
- No quality is lossless: every picture is re-encoded.
- The sidebar still has to work in a narrow window; it takes the whole width there.
- No per-site adapters to maintain.

## Rejected alternatives

- **A browser side panel next to the streaming tab** (Chrome `sidePanel`, Firefox `sidebar_action`),
  mirroring chat and people from the session page. A prototype on 2026-10-28 worked in Chromium
  (chat both ways, history for a late panel, Firefox loaded the manifest) but needed a second UI
  that mirrors the first, a channel between them, a bridge that must keep one session apart from
  another, and a window or screen share would show the panel to the viewers. The maintainer
  preferred the single-window layout. Discarded, not kept.
- **A panel injected into the streaming page** (content script): needs access to arbitrary
  websites, because the host can share any site. Not built.
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
