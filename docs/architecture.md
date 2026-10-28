# Architecture

How WatchStream is built and why. Each section states what is decided, the reasons, and what was
considered and not done. What changed when is in the [changelog](../CHANGELOG.md); the wire
formats are in [protocol.md](protocol.md); ideas for later are in [future-work.md](future-work.md).

## Goal and constraints

WatchStream lets people watch together what plays in one person's browser, with three hard
requirements: it is a **browser extension** (Chrome, Brave, Firefox), participants connect
**directly** with no media server of our own, and the picture reaches the viewers at
**near-transparent quality**. A cloud browser like Hyperbeam is ruled out by the second point.

What the platform imposes:

- **DRM:** Widevine-protected content (Netflix, Disney+, Prime Video, Max) turns black when a tab
  or screen is captured. This is a deliberate protection and WatchStream does not circumvent it,
  which would be a circumvention of technical protection measures and against the services' terms.
- **Re-encoding:** every WebRTC capture is encoded again, so nothing is lossless.
- **NAT:** direct connections need STUN to find public addresses. Symmetric NAT or CGNAT (roughly
  10-20 % of cases) needs a TURN relay. A test between two different public IP addresses connected
  without one.
- **Signalling:** WebRTC needs one exchange of offer and answer. Without a server it has to travel
  over a channel the users already have (a messenger).
- **Extension URLs** differ per browser and installation (Firefox: a random UUID), so a clickable
  invitation link is not possible without a hosted page.
- **Firefox** shares no tab audio through `getDisplayMedia`. **Brave** limits WebRTC address
  handling by default; tested with default Shields, it connects.

## 1. Stream mode only

The host captures a tab, window or screen and sends video and sound over WebRTC. Everything that
plays in the host's browser without DRM works, YouTube included; only the host needs access.

Not done: **sync mode**, where everyone plays the content themselves and only the playback state
travels. It is the only way to support protected services, but needs per-site adapters and every
viewer's own subscription, and a viewer who is blocked by region or age is left out silently. It
was built as a first slice and removed (2026-10-27); its design is in
[future-work.md](future-work.md#sync-mode-for-protected-sites).

## 2. Star topology, the host decides

Each viewer has exactly one connection, to the host. The host is authoritative: it assigns ids and
time stamps, relays every chat message to everyone (also the sender, so everyone sees one order),
decides who is in the session and what is on the stage.

Why: no viewer learns another viewer's IP address, and nobody needs new codes for each pair.
The price: the host encodes and uploads one copy of the picture per viewer (section 6).

Not done: connections between viewers (a mesh, or a tree that passes the picture on). See
[future-work.md](future-work.md#relaying-through-viewers).

## 3. Invitation by code

The host creates an invitation code, the viewer pastes it and gets a reply code, the host pastes
that. One pair per viewer; an invitation is single use. The codes carry the session description
with all ICE candidates already gathered (non-trickle, at most 3 s of gathering), compressed. They
are about 700-900 characters, which every messenger carries. Format and checks are in
[protocol.md](protocol.md#handshake-codes).

Why: no server at all. Trickle ICE would need a second channel for late candidates, which a
manual exchange does not have.

Consequences: two copy-and-paste steps per viewer. Codes contain the sender's IP addresses and
should go only to the invited person. A code without a public address is flagged at once (a VPN,
a firewall or a blocked STUN server), before anyone spends minutes passing codes around. A link
that has not opened yet is not closed when the browser reports it failed: the viewer's ICE starts
before a person has carried the reply to the host. Only the host's 20-second timeout ends it.

Not done: a clickable link or a signalling service (it would need a server; the connector
interface leaves room for a media-free one).

## 4. The session page holds the connections

`session.html` is an extension page in a normal tab; it holds the session and all
`RTCPeerConnection`s. The toolbar icon opens this tab or focuses it if it is open (its id is kept
in `storage.session`), so a second click never starts a second session. Closing the tab ends the
session, which is visible and predictable. The page uses no extension APIs, so the same build runs
as a plain page, which lets the cross-browser tests run Firefox.

Not done: a popup (it closes while the user copies a code into a messenger) and an offscreen
document (Chromium only, invisible).

## 5. Media on the open connection

Sharing adds tracks to the connection that is already open and negotiates over its data channel
(`media-offer`, `media-answer`); no new codes. The existing transport is reused, so no new ICE
candidates are needed. Negotiation follows the "perfect negotiation" pattern: the host side is
impolite and the viewer side polite, so offers that cross resolve themselves; this is what lets a
viewer share (section 7).

Details that cost time to find:

- `media-started` comes before a share's offer and `media-stopped` ends it, and a viewer shows media
  only between the two. The offer that removes tracks after a stop fires track events too.
- Everything the other side sends arrives in one `MediaStream` per link that lives as long as the
  link. The streams that come with browser track events are not used: Chrome makes new ones per
  negotiation and empties them again, which left a video element blank after the second share.
- A link can gain tracks one at a time (video, then sound). `setOutgoing` syncs a link with the
  stream's tracks as they are, also for the same stream object, so a forwarded picture gets its
  sound.

The session classes never touch `RTCPeerConnection`: they talk to a `MediaLink`
(`src/core/peer/message-link.ts`), which `PeerLink` implements with WebRTC and `FakeLink` in memory
for the unit tests.

Not done: a second connection for media, or new codes for each share.

## 6. Capture, sound and quality

Capture is `getDisplayMedia` in every browser: the browser's own picker, one code path, no extra
permission. Chrome and Brave offer "also share tab audio"; Firefox shares no sound.
`chrome.tabCapture` would change what a click on the icon means and needs two more permissions for
nothing `getDisplayMedia` does not already give.

Sound is captured without echo cancellation, noise suppression and automatic gain, in stereo:
those filters are made for voices and muffle music. The descriptions ask Opus for stereo, up to
192 kbit/s and in-band error correction (`tuneOpus`). With the browsers' voice defaults Chromium
sent about 29 kbit/s; tuned, both browsers send 90-160 kbit/s at Balanced.

The host picks one of four qualities (`src/core/media/quality.ts`): Minimal (360p, 15 fps),
Saver (480p, 24 fps), Balanced (720p, 30 fps, the default) and Sharp (1080p, 30 fps). They are
applied per viewer link with `RTCRtpSender.setParameters`, at once and while sharing; a link keeps
its limits and applies them again after every negotiation, because the browser only accepts them
once one is complete.

## 7. Up to twelve viewers, and a load monitor

A session holds at most **12 viewers** (`MAX_VIEWERS`), a ceiling and not a setting. What a host
carries depends on its computer and connection, which no constant can know.

What was measured (2026-10-28, `npm run measure:load`: headless Chromium, software VP8, a hard
synthetic 1080p picture, the host pinned to a number of cores):

- **The CPU gives out before the upload.** Each connection encodes on its own. On 4 cores three
  viewers at Balanced got 10 of 30 frames a second; on 8 cores, 30.
- **The load is not linear.** 8 cores at Balanced: 0.8 cores for three viewers, 5.6 for six.
- **The browser does not say so.** `qualityLimitationReason` read `none` at 2 frames a second.
  What is delivered (frames encoded against frames the source produced) shows it.
- 360p at 15 frames a second costs about an eighth of 720p at 30, hence the Minimal step.

The numbers show a shape, not a limit to build in: a real screen is often easier, and a hardware
encoder changes the cost a lot.

So the chosen quality is the most that is sent, and a **load monitor** lowers it when the host
cannot keep up (`src/core/media/load-monitor.ts`, driven by `src/core/session/load-control.ts`).
Every 2 seconds it reads each link's counters and judges the change:

- A link is **behind** when it encodes under 80 % of the frames it should (the source's frame
  rate, capped by the quality; below 5 a second a picture is too still to judge).
- A link is **squeezed** when it loses more than 5 % of its packets, or when the available bitrate
  (Chromium only) is under 70 % of the cap while the link already uses 70 % of it. A low rate
  alone means nothing: a still picture is cheap.
- The first 8 seconds of a link are not judged, nor a reading whose counters fell.
- The **host struggles** when half of the links (all of one or two) are affected for three
  readings in a row. Then the quality goes down one step, and the next step waits 10 seconds. After
  90 calm seconds it goes up one step. It never goes below Minimal; struggling there, the host is
  told that some viewers may get the picture late. The cause is "your computer" when most affected
  links are behind, "your connection" otherwise.
- One viewer alone on a poor connection does not lower the rest; that viewer is marked slow.

The host always sees what is sent ("720p · 8 viewers", and why it was lowered). The thresholds are
first guesses in one place (`LOAD_RULES`). The monitor is pure, readings in and a decision out,
and takes its time from the readings, so it is tested with sequences and no timers.

Many viewers also need two tools: several invitations at once (each a card with its own number;
places are held while their connections are made) and removing a viewer (`removed`, then the link
closes a third of a second later so the message gets out).

Not done: a viewer count or fixed limits per quality as settings (the host would have to guess;
machines differ by a factor of ten), reading `qualityLimitationReason`, asking for the upload speed
(it cannot be checked without a server).

## 8. Viewers who share

A viewer can share too; the star stays (section 2):

1. The viewer picks the source first and holds the stream, then asks (`share-request`). A browser
   opens its picker only on a fresh click, and the host's answer can take longer than that.
2. The host sees "<name> wants to share" on the stage and in the People tab and answers with one
   click. There is no standing permission.
3. Allowed (`share-granted`), the viewer sends its stream to the host. The host shows it with its
   sound and puts the same stream on every other viewer's link, which encodes it as it would the
   host's own picture; quality limits and the load monitor apply, except that the sharer's link is
   not read. The sharer does not get its picture back.
4. One picture is on the stage at a time. A request while something is shared is answered `busy`
   at once, and a viewer is not offered the picker then. The host's own share takes the stage back
   (`share-revoked`).
5. A share ends when the viewer stops it, the browser's stop button ends the capture, the host
   revokes it or removes the viewer, or the link closes. The others get `media-stopped`. The
   viewer's captured tracks are stopped whenever the share is over, also when the host said no.

The host decodes and encodes the forwarded picture again, which costs a little quality and its
CPU. The sharer sends at the quality its browser picks; only the host applies the chosen limits.

## 9. The interface

- **One window, no page scrolling:** header, the stage on the left, a sidebar with tabs (Invite,
  People, Chat, Settings) on the right; only inner areas scroll. In a narrow window an open
  sidebar takes the whole width. Tabs stay mounted, so typed text and scroll positions survive a
  switch.
- **Full screen** takes the workspace (stage and sidebar, not the header). The sidebar is the same
  element, waiting off-screen and inert; it slides in over the picture when the pointer touches a
  16 px strip at the right edge and slides out 400 ms after the pointer left. It stays while
  something in it has focus; a click on the picture closes it. A handle at the edge and the `S` key
  serve touch screens and a monitor on the right.
- **Only the picture when idle:** after three seconds without a move, key, click or scroll, the
  controls and the mouse pointer fade out (`data-idle` on the workspace; a control joins with the
  classes in `stage-fullscreen.ts`). The pointer resting on the sidebar is not idle. A pointer move
  to the same position is ignored: a browser sends one when the element under a resting pointer
  changes, which fading does.
- **A message in full screen** shows a small chat symbol near the right edge for one second, unless
  the open sidebar is in view.
- Traps that cost time: popups rendered into `body` (Radix portals) are invisible in full screen;
  and the off-screen sidebar must never scroll into view. The workspace uses `overflow: clip`, and
  the chat scrolls only its own list, never with `scrollIntoView`, which scrolled the picture
  sideways.

Not done: a browser side panel next to the shared tab (a prototype worked in Chromium, but it
needed a second UI that mirrors the first, a channel between them, and a window share would show it
to the viewers) and a panel injected into the shared page (it would need access to every website).

## 10. Code and stack

WXT builds one TypeScript codebase for Chrome, Brave and Firefox (Manifest V3). The interface is
React 19 with Tailwind CSS 4 and shadcn/ui (component source copied into `src/components/ui/` and
owned here), icons from `lucide-react`.

```
src/
  core/         no React, no extension APIs: handshake, protocol, peer links, sessions, media
  background/   the toolbar click (no React)
  entrypoints/  thin WXT entry points
  components/ui shadcn/ui building blocks without product knowledge
  features/     the product UI (session: start, host and viewer views, stage, sidebar)
  hooks/        React bindings for core objects
  lib/          small helpers
```

- `core/` never imports React or anything from the UI folders, so the logic is tested without a
  DOM.
- Sessions are plain objects with an event emitter. Hooks read them through
  `useSyncExternalStore` with a change counter as snapshot (`useChangeCounter`), because the
  getters hand out fresh arrays. Sessions are created in event handlers, not in effects: Strict
  Mode runs effects twice and would drop open invitations.
- The log (`src/core/log/logger.ts`) takes only plain values and is written to carry counts,
  states and error names, never codes, descriptions, names or chat text. "Copy technical details"
  shows its latest lines.

Not done: plain DOM (did not scale), Preact or Svelte (the maintainer chose React, and shadcn/ui
targets it), MUI or Chakra (heavier, less control over the markup).

## Privacy

- No WatchStream server, no data collected. Video, sound and chat go directly between host and
  viewer, encrypted by WebRTC (DTLS/SRTP).
- A public STUN server (`stun.l.google.com`) sees the participants' public IP addresses, no content.
- Codes contain the sender's IP addresses. Viewers see each other's names, never their addresses.
