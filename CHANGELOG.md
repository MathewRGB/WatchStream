# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A step-by-step manual test guide for stream mode (`docs/manual-tests/m3-stream-mode.md`) and a
  checklist for the open points before the first store submission (Brave Shields, name search,
  privacy text, packaging) in `docs/release-checklist.md`.
- ADR-0001: architecture as a P2P browser extension with stream mode.
- ADR-0002: the session tab page holds the connections; handshake code format and data-channel
  protocol v1.
- ADR-0003: UI stack of React, Tailwind CSS and shadcn/ui on top of WXT, and the source layout
  that goes with it.
- ADR-0004: stream mode for all content (YouTube included) and a new roadmap with the app shell
  and stream mode first.
- ADR-0005 (proposed): stream mode adds media to the open connection and renegotiates over the
  data channel. A spike showed this works between Chromium and Firefox in both directions. It also
  records the plan that viewers can share too, which is required but comes later.
- Data-channel messages `media-started`, `media-offer`, `media-answer` and `media-stopped`,
  validated like all others.
- The host session can share a media stream (`startSharing` / `stopSharing`). Viewers receive it,
  also when they join later or when the host shares again after a stop. Connections negotiate
  media over the data channel, with crossing offers resolved by the viewer yielding. Tested with
  real WebRTC in Chromium and Firefox.
- Logging for everything that matters when a session breaks: connection and ICE states, how
  candidates were gathered (counts only), the path a connection took (`srflx/srflx`, `relay`, …),
  STUN errors, timeouts, dropped viewers, dropped messages and the sharing steps that used to fail
  silently. It goes to the browser console under `[WatchStream]` and to a short in-memory history.
  Codes, session descriptions, IP addresses, names and chat text are never logged; a test pins this.
- **Technical details** with a copy button next to connection errors and on the screen that says
  the session ended: the state of the connection, what each side's code offered and the latest log
  lines. A failed connection now names the likely cause (VPN, firewall, carrier-grade NAT) and the
  details say which side had no public address.
- An error page with the same details instead of a blank page when the interface itself fails, and
  uncaught errors and unhandled promise rejections are written to the log.
- A notice next to invitation and reply codes that hold no public network address (no STUN
  result, no relay, no global IPv6). Such a code cannot be reached from another network; the
  usual causes are a VPN, a firewall or a blocked STUN server.
- A viewer who has waited a minute for the host's reply is told to leave and join again with a
  new invitation.
- Volume control for viewers: a slider next to the mute button on the stage. Moving it while muted
  turns the sound back on, and the level is remembered for the next session. Muting itself is not
  remembered. The host's own preview has no sound controls.
- Settings tab for the host with three picture quality presets (Saver 480p, Balanced 720p,
  Sharp 1080p). They cap bitrate, frame rate and resolution of what goes out to each viewer, also
  while sharing and for viewers who join later.
- Stream mode on the stage: the host chooses **Share** and picks a tab, window or screen in the
  browser's own picker (Chrome and Brave can add tab audio). Viewers see and hear it, with a name
  label, a mute button and a note when the browser had to start it without sound. The host sees a
  silent preview and can stop sharing, also with the browser's own stop button.
- React 19, Tailwind CSS 4 and shadcn/ui (button, input, textarea, label, card, badge,
  scroll-area, alert, separator, tabs) with a dark design-token theme, plus Testing Library for
  component tests.
- The host session reports changes of the free places through a `slots` event, so the UI stays
  correct without polling.
- React hooks that bind sessions to components: `useHostSession`, `useViewerSession` and
  `useChatMessages`.
- React components for the shared parts of the WatchStream page: code box with copy button, code
  input, participant list and chat panel, with plain-language error messages.
- README sections on usage, privacy, development, tests and project layout.
- README, CHANGELOG, MIT license, `.gitignore`, `.editorconfig` and `.gitattributes`.
- Project tooling: WXT with Manifest V3 builds for Chrome/Brave and Firefox, TypeScript (strict),
  ESLint, Prettier and Vitest.
- Invitation and reply codes (`WSI1.…` / `WSR1.…`) that carry a compressed WebRTC session
  description and tolerate line breaks added by messengers.
- Data-channel protocol between host and viewers (welcome, participant list, chat) with strict
  validation of every incoming message.
- Direct WebRTC data channel between two browsers with non-trickle signaling, so one invitation
  and one reply code are enough to connect.
- Host and viewer sessions: single-use invitations for up to three viewers, a shared participant
  list and a chat that the host relays to everyone. A viewer that cannot be reached directly
  within 20 seconds is reported as a failed connection.
- Clicking the toolbar icon opens the WatchStream page, or focuses it if it is already open.
- WatchStream page: host a session or join one with your name, exchange invitation and reply
  codes with copy buttons, see who is in the session and chat. The name is remembered.
- Extension icons, generated by `npm run icons`.
- `npm run lint:firefox` validates the Firefox package with Mozilla's `web-ext lint`. Firefox 140
  or newer is required.
- End-to-end tests with Playwright: the real Chrome extension, and Chromium ↔ Firefox sessions
  with chat between all participants.
- One-window layout: header, a stage with a full-screen button on the left and a sidebar with tabs
  on the right (Invite, People, Chat for the host; People and Chat for viewers). The page never
  scrolls, only the chat list and the tab contents do. The sidebar can be hidden, and in a narrow
  window an open sidebar takes the whole width. Tabs keep their content while another tab is shown.
- End-to-end layout tests at three window sizes, including a control that proves the scroll check
  detects a page that is too tall or too wide.
- The viewer's reply code is copied to the clipboard as soon as they join, with a visible notice
  ("Reply code copied to your clipboard. Paste it into your chat with <host>."). If the browser
  refuses, the notice asks them to copy it by hand and the copy button stands out.

### Security

- ESLint forbids `innerHTML`, `outerHTML` and `dangerouslySetInnerHTML` in the source, so chat text
  and names from other people can never be rendered as HTML.

### Changed

- Sync mode and services with copy protection (Netflix, Disney+, Prime Video, Max) are no longer
  planned. ADR-0001 and ADR-0004 describe stream mode only and keep sync mode as future work at
  their end; M4 is now the panel next to the streaming tab and the optional TURN service.
- The stage and the sidebar are inset panels with a thin border, rounded corners and a small gap
  to the window edge, so scrolling content visibly ends there instead of looking cut off.
- Invitation and reply codes are shown in compact fields that scroll inside instead of growing to
  fill the sidebar.
- The WatchStream page is now built with React, Tailwind CSS and shadcn/ui instead of hand-written
  DOM code. It keeps all behavior and gets a consistent look: cards, badges, a copy button with
  icon and an Enter key shortcut for sending chat and starting a session.

### Fixed

- The shared sound is much cleaner. It used to arrive at about 29 kbit/s (Chromium) or 64 kbit/s
  (Firefox) in the voice setup the browsers use for calls. Now the capture is asked for sound
  without echo cancellation, noise suppression and automatic gain (they muffle music and make the
  level pump), the connection asks for stereo Opus with a music bitrate, and the quality presets
  set the sound bitrate too: 64, 128 and 192 kbit/s. Measured in Chromium and Firefox in the
  integration test.
- The "session ended" screen no longer fails in Firefox. Firefox refuses to read the state of a
  closed connection, so the details are now taken from the last state seen before it closed.
- A failed media negotiation was an unhandled promise rejection; it is logged now.
- A viewer no longer sees "The session has ended" while the host is still about to paste the
  reply code. The viewer's connection starts testing paths as soon as it has the invitation, long
  before the reply arrives (it travels through a chat), and that early failure used to end the
  session. A connection that has not opened yet is now only ended by the host's timeout or by
  leaving; an open connection that fails still ends.
- The host's own preview of the shared picture is built from the video track only. It used to
  carry the audio track as well and relied on the element being muted, which risked the host
  hearing the shared tab twice.
- A viewer whose data channel is closing can no longer keep the host from relaying chat messages
  to the other viewers. The failing link is closed and drops out of the session.
- A place in the session stays reserved while a reply is still connecting. Before, the host could
  create a fourth invitation during those up to 20 seconds and end up with too many viewers.

[unreleased]: https://github.com/MathewRGB/WatchStream/commits/main
