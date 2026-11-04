# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- In full screen the sidebar opens when the pointer rests on the arrow in the middle of the right
  edge, no longer when it touches the edge anywhere. The arrow is bigger, tinted with the accent colour, half transparent,
  and has a shadow, so that it stands out from the picture.

## [0.2.0] - 2026-11-04

### Added

- A **Weak connection** setting (smooth motion, balanced, steady sharpness) for what the picture
  gives up when the browser's bandwidth estimate to a viewer falls far below the chosen quality,
  as on a long route. Steady keeps the resolution and asks Chromium for a minimum and start bitrate.
- The load control logs the connection numbers of every link every ten seconds (estimate, target,
  sent bitrate, loss, round trip, frame size, frame rate, why the encoder holds back, and how often
  the viewer asked for a full picture or a resend, and the kind of path: direct or relayed).
- A **Smoothing buffer** setting for viewers (Standard, 1 s, 2 s) in a new Settings tab. The
  browser then collects more of the picture before it plays, which calms a stuttering picture on a
  long route at the price of delay. The sound is delayed in the page (Web Audio) by the time the
  picture really waits in the browser's buffer, measured once a second, because the browser holds
  back only the picture: the sound would play seconds early. Chromium and Firefox; remembered
  between sessions.
- The extension logo shows in the window header, left of the title.
- A manual test guide for the settings for a weak connection: [docs/manual-tests/m7-connection-settings.md](docs/manual-tests/m7-connection-settings.md).

### Changed

- The automatic codec is VP9 first where the browser has no hardware H.264 encoder, else H.264.
- The sender no longer insists on `maintain-framerate`; the default is `balanced`.
- The chat keeps the latest 500 messages and forgets the oldest from the 501st on.
- The host passes on at most ten chat messages and thirty reception reports of one viewer in ten
  seconds, so one viewer cannot flood the others.
- The manifest asks for Chrome and Brave 114 or newer (the smoothing buffer and the short codes
  need it), and `package.json` for Node 22 or newer.
- The radio choices in Settings share one component.

### Fixed

- With several Settings sections open the whole window could scroll, giving a second scrollbar
  beside the settings. The hidden group labels (`sr-only`, absolutely positioned) had no
  positioned ancestor, so the panel's overflow did not contain them. Only the panel scrolls now.
- When the interface itself failed, the error page said the session had ended while its
  connections stayed open. The page now ends the host or viewer session it was running.
- A listener that threw stopped the others from getting the event, and could leave a closed link
  with its listeners. The failure is logged and the rest carry on.
- The page no longer stops when the browser refuses to remember the name, and the volume and the
  smoothing buffer are read and written in the same careful way.
- The hint for the smoothing buffer said "Chromium browsers only", but it works in Firefox too.
- The sound delay forgets what it knew about the old sound when the next share has none.

### Security

- The error text on the error page goes through the same filter as the log, so it carries no
  addresses either.

## [0.1.0] - 2026-11-02

First release. How it works is in [docs/architecture.md](docs/architecture.md).

### Added

- Fine-tuning for the picture: next to the four steps (Minimal, Saver, Balanced, Sharp) the host
  can choose **Custom** and set the resolution (240p to 2160p), the frame rate (10 to 60 fps), the
  picture bitrate (automatic, or 0.3 to 20 Mbit/s) and the sound bitrate (32 to 320 kbit/s). The
  settings say what one viewer costs in upload, and the line on the stage shows the frame rate as
  well ("720p · 30 fps · 1.8 of 3.5 Mbit/s · 8 viewers": the bitrate each viewer really gets of the most the quality allows, which shows a bitrate limit at work). The screen capture follows the frame rate that is sent, so 60
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
  shares a tab, window or screen, and the viewers see and hear it. No WatchP2PStream server; video,
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
  video in Settings; WatchP2PStream takes the sound from its video and adds it to the share. When a
  share starts, WatchP2PStream finds the tab that plays sound by itself (once the host allowed it in
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

### Fixed

- Sharing again and again on one connection works: from the fourth share in Chrome and Brave (sixth
  in Firefox) the picture no longer reached a viewer who had stayed in the session.
- From the second share on, the stage line and the People tab read the counters of the current
  picture, not those of the share before it.
- The host's connection to a viewer who left is closed at once.
- A reply code that belongs to no open invitation no longer uses up the card it was pasted into.
- A viewer who waits for an answer is told at once when the host starts to share, and lets go of
  the capture.
- Ending a session while the share picker is open, or while an invitation is being made, leaves no
  capture and no connection running.
- Firefox: a tab whose sound started only after WatchP2PStream gave up on it stops capturing.
- A chat time stamp no date can hold is dropped instead of taking the viewer's page down.

### Security

- The log and the technical details carry no addresses from a browser's error text, which can quote
  a line of a session description.
- Chat text and names from other people are never rendered as HTML; ESLint forbids `innerHTML`,
  `outerHTML` and `dangerouslySetInnerHTML` in the source.

[unreleased]: https://github.com/MathewRGB/WatchStream/compare/v0.2.0...main
[0.2.0]: https://github.com/MathewRGB/WatchStream/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MathewRGB/WatchStream/releases/tag/v0.1.0
