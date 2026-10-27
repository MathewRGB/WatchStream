---
id: ADR-0004
title: Sync mode only for protected sites; stream mode for everything else; new roadmap
status: accepted
date: 2026-10-27
deciders: [Mathias Kuhlmey]
amends: [ADR-0001]
---

# ADR-0004: Sync mode only for protected sites; stream mode for everything else; new roadmap

## Context

ADR-0001 offered two modes and made sync mode the default for "anything every viewer can open
themselves", YouTube being the first adapter. Two things came up after M1:

- Videos on YouTube can be blocked for individual viewers (region, age, embedding or licensing
  restrictions). In sync mode each viewer loads the video themselves, so a blocked viewer sees
  nothing while everyone else watches. In stream mode the host's rendered picture reaches everyone.
- Protected services (Netflix, Disney+, Prime Video, Max) cannot be captured; the picture turns
  black. For them sync mode is the only option.

The maintainer also wants one window with a stage for the shared picture, a sidebar for chat and
options and a full-screen mode. That layout is the stream mode's home.

## Decision

### 1. Mode selection

| Content                                  | Mode                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| DRM-protected (`video.mediaKeys` is set) | Sync only; every viewer needs their own access        |
| Everything else, including YouTube       | Stream only; the host's picture is what everyone sees |

Sync mode is no longer the default and is not offered for unprotected content. If a lossless mode
for unprotected content is wanted later, it becomes an explicit opt-in and gets its own decision.

### 2. Scope of sync mode

- Per-site adapters for protected services, Netflix first. A generic `<video>` adapter remains as
  the base they build on.
- No YouTube adapter and no ad handling for YouTube.

### 3. Roadmap (replaces the milestone lists in ADR-0001 and the README)

1. **M1:** connection setup by code, chat (done).
2. **M2:** app shell: one window without page scrolling, stage with full-screen mode, sidebar
   with tabs (chat, participants, invite, settings), reply code copied to the clipboard
   automatically with a visible notice.
3. **M3:** stream mode. A short spike first: tab capture into the session page in Chrome and
   Brave, display capture without tab audio in Firefox.
4. **M4:** sync mode for protected sites: generic adapter, Netflix adapter.
5. **M5:** more protected sites, side panel or in-page panel next to the streaming tab (needs its
   own investigation of Chrome, Brave and Firefox), optional TURN service.

## Consequences

- Stream mode now carries all unprotected content, so its quality limits matter more: host upload
  and CPU bound the quality, and Firefox hosts have no tab audio. The settings tab needs a quality
  control early.
- YouTube viewers need no access of their own and cannot be blocked individually.
- The goal "no quality loss" holds only for protected services in sync mode.
- The sidebar has to work in a narrow window, because M5 may reuse it next to the streaming tab.
- Fewer per-site adapters to maintain.

## Rejected alternatives

- **Stream mode only:** drops Netflix and the other protected services, which the maintainer
  wants.
- **Sync mode for YouTube:** a blocked viewer is left out silently.
- **Offering both modes for unprotected content:** two ways to do the same thing, and more UI
  choices before anyone has used either.
