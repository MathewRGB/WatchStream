# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

First release. How it works is in [docs/architecture.md](docs/architecture.md).

### Added

- Watch together, browser to browser, in Chrome, Brave and Firefox (Firefox 140 or newer): the host
  shares a tab, window or screen, and the viewers see and hear it. No WatchStream server; video,
  sound and chat go directly between host and viewers.
- Joining by code: the host sends an invitation code through any messenger, the viewer sends a
  reply code back. A code with no public network address, which cannot be reached from another
  network, is flagged at once.
- Up to twelve viewers. The host can invite several at once and remove a viewer.
- Sharing: the picture quality is chosen in Settings (Minimal, Saver, Balanced, Sharp) and is the
  most that is sent. When the host's computer or connection cannot keep up, the quality is lowered
  step by step and raised again later, and the stage says so. Sound is sent in stereo at a music
  bitrate. Viewers have a mute button and a volume slider.
- Viewers can share too: a viewer picks a source and asks, the host allows it with one click and
  passes the picture on to everyone else. One picture is on the stage at a time; the host can end a
  viewer's share and its own share takes the stage back.
- Firefox: sound from a tab. Firefox shares no tab sound, so the host can choose the tab with the
  video in Settings; WatchStream takes the sound from its video and adds it to the share. Access
  to the tab list and to the one site is asked for at that moment, not at install.
- Chat, a list of the people in the session, and the host's view of who is not keeping up.
- One window without page scrolling: the stage with full screen, and a sidebar with tabs (Invite,
  People, Chat, Settings). In full screen the sidebar slides in at the right edge, only the picture
  is left when nothing happens, and a quiet symbol tells of a new message.
- Technical details with a copy button for connection problems, and an error page with the same
  details if the interface itself fails.
- Development tools: `npm run measure:load` shows what a host costs per viewer, and `npm run lint:firefox`
  checks the Firefox package. Manual test guides for stream mode, full screen, many viewers and
  viewer shares are in `docs/manual-tests/`.

### Security

- Chat text and names from other people are never rendered as HTML; ESLint forbids `innerHTML`,
  `outerHTML` and `dangerouslySetInnerHTML` in the source.

[unreleased]: https://github.com/MathewRGB/WatchStream/commits/main
