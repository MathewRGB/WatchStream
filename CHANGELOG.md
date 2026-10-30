# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

First release. How it works is in [docs/architecture.md](docs/architecture.md).

### Added

- Fine-tuning for the picture: next to the four steps (Minimal, Saver, Balanced, Sharp) the host
  can choose **Custom** and set the resolution (240p to 2160p), the frame rate (10 to 60 fps), the
  picture bitrate (automatic, or 0.3 to 20 Mbit/s) and the sound bitrate (32 to 320 kbit/s). The
  settings say what one viewer costs in upload, and the line on the stage shows the frame rate as
  well ("720p · 30 fps · 8 viewers"). The screen capture follows the frame rate that is sent, so 60
  fps is reachable and a low rate does not capture frames that would be dropped.
- The settings tab is made of sections that open and close on their own (picture quality, video
  codec, sound from a tab). Only the picture quality is open at first; a closed section names what
  is set in it.
- Short invitation and reply codes: about 200 characters instead of 800 to 900. A code now holds
  only what two browsers cannot guess (the certificate fingerprint, the connection password and
  the addresses); the rest of the description is written out again when it is read. A description
  of any other shape still travels in full. See [docs/protocol.md](docs/protocol.md#handshake-codes).
- Viewers report how the picture arrives (packets lost, frames a second, wait before showing,
  freezes, round trip). The host sees it under each viewer's name in the People tab, with a hint
  at the cause when the picture does not arrive well.
- The host can choose the video codec in Settings (automatic, H.264, VP9, VP8, AV1, as far as the
  browser offers them). The other codecs stay behind the choice, so a viewer that cannot use it
  still gets a picture.
- The host offers H.264 before VP8 (a graphics chip can encode it; not in Firefox), and the shared picture is
  marked as motion with a preference for keeping the frame rate, so an overloaded host lowers the
  resolution instead of stuttering.
- Watch together, browser to browser, in Chrome, Brave and Firefox (Firefox 140 or newer): the host
  shares a tab, window or screen, and the viewers see and hear it. No WatchStream server; video,
  sound and chat go directly between host and viewers.
- Joining by code: the host sends an invitation code through any messenger, the viewer sends a
  reply code back. A code with no public network address, which cannot be reached from another
  network, is flagged at once. A reply pasted into the card of another invitation is refused with
  a hint, and both invitations stay open.
- Up to twelve viewers. The host can invite several at once and remove a viewer.
- Sharing: the picture quality is chosen in Settings (Minimal, Saver, Balanced, Sharp) and is what
  is sent. When the host's computer or connection cannot keep up, the stage says so; the quality is
  never changed by itself. Sound is sent in stereo at a music
  bitrate. Viewers have a mute button and a volume slider.
- Viewers can share too: a viewer picks a source and asks, the host allows it with one click and
  passes the picture on to everyone else. One picture is on the stage at a time; the host can end a
  viewer's share and its own share takes the stage back.
- Firefox: sound from a tab. Firefox shares no tab sound, so the host can choose the tab with the
  video in Settings; WatchStream takes the sound from its video and adds it to the share. When a
  share starts, WatchStream finds the tab that plays sound by itself (once the host allowed it in
  one prompt at the first Share, not at install); the list in Settings remains for the cases where
  it cannot tell.
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
