# Architecture

How WatchP2PStream is built and why. Each section states what is decided, the reasons, and what was
considered and not done. What changed when is in the [changelog](../CHANGELOG.md); the wire
formats are in [protocol.md](protocol.md); ideas for later are in [future-work.md](future-work.md).

## Goal and constraints

WatchP2PStream lets people watch together what plays in one person's browser, with three hard
requirements: it is a **browser extension** (Chrome, Brave, Firefox), participants connect
**directly** with no media server of our own, and the picture reaches the viewers at
**near-transparent quality**. A cloud browser like Hyperbeam is ruled out by the second point.

What the platform imposes:

- **DRM:** Widevine-protected content (Netflix, Disney+, Prime Video, Max) turns black when a tab
  or screen is captured. This is a deliberate protection and WatchP2PStream does not circumvent it,
  which would be a circumvention of technical protection measures and against the services' terms.
- **Re-encoding:** every WebRTC capture is encoded again, so nothing is lossless.
- **NAT:** direct connections need STUN to find public addresses. Symmetric NAT or CGNAT (roughly
  10-20 % of cases) needs a TURN relay. A test between two different public IP addresses connected
  without one.
- **Signalling:** WebRTC needs one exchange of offer and answer. Without a server it has to travel
  over a channel the users already have (a messenger).
- **Extension URLs** differ per browser and installation (Firefox: a random UUID), so a clickable
  invitation link is not possible without a hosted page.
- **Firefox** shares no tab audio through `getDisplayMedia` (see §6 for the way around it). **Brave** limits WebRTC address
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
The price: the host encodes and uploads one copy of the picture per viewer (section 7).

Not done: connections between viewers (a mesh, or a tree that passes the picture on). See
[future-work.md](future-work.md#relaying-through-viewers).

## 3. Invitation by code

The host creates an invitation code, the viewer pastes it and gets a reply code, the host pastes
that. One pair per viewer; an invitation is single use. The codes carry the session description
with all ICE candidates already gathered (non-trickle, at most 3 s of gathering). They are about
200 characters. A first version sent the whole description deflated, 700-900 characters, most of
it text both browsers write the same way; now only the fingerprint, the connection password and
user name, the DTLS role and the addresses are sent, and the rest is written out again on the other
side. A description that is not of that one shape travels in full, so a browser that offers
something unexpected costs length, not a connection. Format and checks are in
[protocol.md](protocol.md#handshake-codes).

Why: no server at all. Trickle ICE would need a second channel for late candidates, which a
manual exchange does not have.

Consequences: two copy-and-paste steps per viewer. Codes contain the sender's IP addresses and
should go only to the invited person. A code without a public address is flagged at once (a VPN,
a firewall or a blocked STUN server), before anyone spends minutes passing codes around. A link
that has not opened yet is not closed when the browser reports it failed: the viewer's ICE starts
before a person has carried the reply to the host. Only the host's 20-second timeout ends it. A
viewer who has waited a minute for the host is told to leave and join again with a new invitation.

Not done: a clickable link or a signalling service (it would need a server; the connector
interface leaves room for a media-free one).

## 4. The session page holds the connections

`session.html` is an extension page in a normal tab; it holds the session and all
`RTCPeerConnection`s. The toolbar icon opens this tab or focuses it if it is open (its id is kept
in `storage.session`), so a second click never starts a second session. Closing the tab ends the
session, which is visible and predictable. Apart from the optional tab sound in Firefox (section 6) the page uses no extension
APIs, so the same build runs as a plain page, which lets the cross-browser tests run Firefox.

Not done: a popup (it closes while the user copies a code into a messenger) and an offscreen
document (Chromium only, invisible).

If the interface itself fails, the error page ends the sessions that are still running
(`open-sessions.ts`: the page registers a host or viewer session when it starts it and forgets it
when it ends in the usual way). The error boundary cannot reach the session objects that live in
state further down, and a session that stayed open would keep its connections and, for a viewer,
go on sending reports while the page says it has ended. The registry is not a place to put
cleanup of the usual kind: ending a session from an effect would end it in React's development
double-mount too.

What a viewer may send as often as it likes is capped by the host (`rate-limit.ts`): ten chat
messages and thirty reports in ten seconds. The host relays a chat message to everyone, so one
viewer could otherwise flood the rest. The window is measured with the page's own clock, not with
the injectable `now` of the session, which only time-stamps messages.

## 5. Media on the open connection

Sharing adds tracks to the connection that is already open and negotiates over its data channel
(`media-offer`, `media-answer`); no new codes. The existing transport is reused, so no new ICE
candidates are needed. Negotiation follows the "perfect negotiation" pattern: the host side is
impolite and the viewer side polite, so offers that cross resolve themselves; this is what lets a
viewer share (section 8).

Details that cost time to find:

- `media-started` comes before a share's offer and `media-stopped` ends it, and a viewer shows media
  only between the two. The offer that removes tracks after a stop fires track events too.
- Everything the other side sends arrives in one `MediaStream` per link that lives as long as the
  link. The streams that come with browser track events are not used: Chrome makes new ones per
  negotiation and empties them again, which left a video element blank after the second share.
- A link can gain tracks one at a time (video, then sound). `setOutgoing` syncs a link with the
  stream's tracks as they are, also for the same stream object, so a forwarded picture gets its
  sound.
- Each outgoing track has a `sendonly` transceiver of its own, which is stopped when the track goes.
  A stopped section is used again by the next offer, so a description stays the same size however
  often someone shares. `addTrack` and `removeTrack` left a section behind for every share: a
  description grew by about 5 kB each time, and the fourth share in Chromium (sixth in Firefox) went
  over the 20 000 characters a message may carry. The message was dropped and the link never
  negotiated again. They also left the old sender's counters in the statistics, which were read
  instead of the new ones.
- A link closes its `RTCPeerConnection` however it ended, also when the other side left. Until
  then the host's connection stayed `connected` with nobody to send to.

The session classes never touch `RTCPeerConnection`: they talk to a `MediaLink`
(`src/core/peer/message-link.ts`), which `PeerLink` implements with WebRTC and `FakeLink` in memory
for the unit tests.

Not done: a second connection for media, or new codes for each share.

## 6. Capture, sound and quality

Capture is `getDisplayMedia` in every browser: the browser's own picker, one code path, no extra
permission. Chrome and Brave offer "also share tab audio"; Firefox shares no sound.
`chrome.tabCapture` would change what a click on the icon means and needs two more permissions for
nothing `getDisplayMedia` does not already give.

**Tab sound in Firefox.** When a share starts without sound, WatchP2PStream finds the tab that plays
sound (`tabs.audible`; one tab, or the only one in the host's own window; `pickAudibleTab`) and
uses it. The host can also pick a tab in Settings. A script is injected into the tab
(`src/entrypoints/tab-sound.content.ts`, Firefox build only, registered at runtime and never
declared in the manifest). It routes the page's `<video>` or `<audio>` through Web Audio
(`createMediaElementSource`): to the speakers, so the host still hears it, and to a processor that
posts blocks of samples on a runtime port (`src/core/tab-sound/capture.ts`). The session page
checks every block (`relay.ts`), schedules it with 100 ms of lead into a
`MediaStreamAudioDestinationNode` (`sink.ts`) and adds that track, cloned per share, to the shared
stream (`refreshSharing` passes a late track on). Why not hand over a stream: a `MediaStream` cannot
leave its tab, and the connection lives in the session tab, so the picture stays with
`getDisplayMedia` and only the sound travels as numbers. `mozCaptureStream` would mute the element
for the host, and tapping the element is the only way that keeps the speakers in our hands.

Costs, and why they are accepted: nothing is granted at install. `tabs` and access to all sites
are optional permissions, asked for once in a single prompt at the first **Share** click, before
the picker (the click is what permits asking; a refusal is not asked again while the page stays
open, and the host can still choose a tab by hand, which asks for that one site); `scripting` is the only
permission added to the manifest. The sound is about 150 ms behind the picture (the lead plus the
port), because a getDisplayMedia picture cannot be delayed to match. `ScriptProcessorNode` is
deprecated but needs no module file, which a content script cannot load into the page's realm;
an `AudioWorklet` is the replacement if it is ever removed. A player that took the element over
itself, DRM media and cross-origin media without CORS give silence or an error. Only the first
frame that delivers sound is used.

Sound is captured without echo cancellation, noise suppression and automatic gain, in stereo:
those filters are made for voices and muffle music. The descriptions ask Opus for stereo, up to
192 kbit/s and in-band error correction (`tuneOpus`). With the browsers' voice defaults Chromium
sent about 29 kbit/s; tuned, both browsers send 90-160 kbit/s at Balanced.

The host's own preview is built from the video track only. With the sound in it the preview would
rely on being muted, and the host could hear the shared tab twice.

The host picks one of four qualities (`src/core/media/quality.ts`): Minimal (360p, 15 fps),
Saver (480p, 24 fps), Balanced (720p, 30 fps, the default) and Sharp (1080p, 30 fps), or
**Custom**. The steps are for those who do not want to think about it; Custom is for those who do.
Its values (`CustomQuality`) are each picked from a short list, so nothing outside what the encoder
and a screen can do is offered (`changeCustomQuality` snaps anything else to the nearest entry):
resolution 240p to 2160p, frame rate 10, 15, 24, 30 or 60, a picture bitrate of 0.3 to 20 Mbit/s,
and a sound bitrate of 32 to 320 kbit/s. The picture bitrate may be left on automatic, which
follows the resolution and the frame rate with bits per pixel that fall as the picture grows
(`autoVideoBitrate`; it reproduces the four steps within 10 %, 1080p at 30 fps comes to 5.7
against the step's 6 Mbit/s). Choosing Custom for the first time starts from the step that was in
use, so fine-tuning begins where the host was; after that its values are kept. What is sent for a
choice is `resolveLimits`, one `MediaLimits` that the links, the load monitor and the line on the
stage all read.

The limits are applied per viewer link with `RTCRtpSender.setParameters`, at once and while
sharing; a link keeps its limits and applies them again after every negotiation, because the
browser only accepts them once one is complete. The capture is asked for 60 frames a second when
the picture is picked, and each link then asks the captured track for the frame rate that is sent
(`applyConstraints`, once for each rate, not once for each viewer): a limit of 60 is only reachable
if the capture produces 60, and capturing 60 to send 15 would be work for nothing. A track that
cannot be asked (a canvas, in the tests) keeps what it has.

**Codec and encoder hints.** The automatic order is decided per computer (`detectAutoCodec`,
`navigator.mediaCapabilities.encodingInfo`): H.264 first where the browser reports a
power-efficient (hardware) encoder for it, otherwise VP9 first, because a software H.264 encoder
needs about a third more data and holds a rate badly on a long route. H.264 and VP8 stay behind
as fallbacks (`preferVideoCodecs`, applied with `setCodecPreferences` when a video track is added;
only the order changes, so a viewer without the first codec still connects; not in Firefox, which
loads its H.264 as a plugin on demand and sent no picture without it, so it keeps VP8 first and
`detectAutoCodec` answers nothing).
The host can choose the codec in Settings (`CodecId`: automatic, H.264, VP9, VP8, AV1; only those
the browser lists, and no section where it takes no preference). The choice goes first and H.264
and VP8 stay behind it, so nothing is removed and a viewer that cannot use it gets the next one.
It reaches every link and later viewers (`setVideoCodec`); while a picture is sent the link
negotiates again. VP9 needs about a third less data for the same picture and costs the processor
more, AV1 even more, which is why the choice is the host's and the default stays automatic. A graphics chip can encode H.264, which
Windows browsers use by default; on Linux, Chrome and Brave encode WebRTC video in software unless
hardware encoding is switched on in the browser, so there the codec alone changes little. The
video track gets `contentHint = 'motion'`.

**Weak connection.** The browser estimates the bandwidth to each viewer itself and, on a long or
lossy route, can fall far below the cap (measured Germany to Kyrgyzstan: 0.1 of 3 to 5 Mbit/s), so
the quality step alone changes little. The host chooses in Settings what the picture gives up then
(`WeakLinkMode`, `weak-link.ts`): _smooth_ (`maintain-framerate`: small and blurry first),
_balanced_ (the default, `balanced`) or _steady_ (`maintain-resolution`: the frame rate drops, and
the description carries Chromium's `x-google-min-bitrate` / `x-google-start-bitrate` at 40 % and
70 % of the cap, written into the offer, the answer and the answer the host receives; other
browsers ignore them). Steady holds a floor the line may not carry, which costs lost packets, so
it is a choice. A change of the floor starts a negotiation while a picture is sent.

Every few seconds the load control logs one `link reading` line per link (cap, the browser's
estimate and target, bitrate sent, loss, round trip, height, frame rate and
`qualityLimitationReason`; numbers and enums only), so a picture that falls apart after a while
can be read in the log afterwards. The line also carries the cumulative `pliCount` (full pictures
the viewer asked for), `nackCount` (resends), `keyFramesEncoded`, the kilobytes sent again and the
path kinds (`srflx/srflx` direct, `relay` through TURN): many full pictures on a lossy route feed
the next loss, and the path says whether the route or the settings are to blame.

**Smoothing buffer (viewer).** The viewer can ask its own browser to buffer longer before it
plays (`PlayoutBufferId`, `playout-buffer.ts`): `RTCRtpReceiver.jitterBufferTarget` of 1 or 2
seconds on the VIDEO receiver, set when the choice changes and again when a track arrives. It is
the counterpart of the host's weak-connection mode: that one changes what is sent, this one how
patiently it is played. The price is delay, which matters little when everyone watches the same
stream. The choice is kept in `localStorage` (`usePlayoutBuffer`).

The sound is delayed by the stage itself, not by the browser. Measured in Chromium and Firefox
(loopback, 2 s and 4 s): the picture sat 1.98 s / 3.97 s in the buffer, the sound 10 ms; with
the target on the audio receiver as well the sound stayed at 10 ms (Chromium caps an audio target
at 3 s anyway), and the browser's lip sync did not close the gap, so the sound played seconds
before its picture. `DelayedAudio` therefore sends the stream's sound through a Web Audio
`DelayNode` (`StageVideo`, prop `audioDelayMs`); the video element stays attached
but muted, because Chromium delivers the sound of a remote stream to a graph only then. Where the
browser does not know `jitterBufferTarget` (`playoutBufferSupported`) nothing is delayed.

The length of that delay is measured, not assumed. A first version delayed the sound by exactly the
target; on a real route the viewer reported the sound seconds EARLY, because the picture's buffer
is larger than the target (jitter, decoding). `AudioDelayTracker` now takes the browser's
`jitterBufferDelay` / `jitterBufferEmittedCount` of the video and the audio receiver once a second,
averages the last round of each, and delays the sound by the picture's wait minus the sound's own
(smoothed, at most five seconds). The asked-for time is used until a measurement exists.

How the delay is changed matters as much as how long it is. A delay node reads its input at 1 minus
the rate at which the delay changes, so a delay that moves by two seconds in about a second plays
the sound backwards or at triple speed: heard as a scratch when the viewer picked 1 s or 2 s, and
as a slow, late catch-up on going back to Standard. `planDelayChange` (`delay-plan.ts`) therefore
glides a correction of up to 0.3 s at no more than 5 % (a pitch shift under a semitone), and makes a
bigger change a cut: the sound fades out in 80 ms, the delay is set, it fades in over 150 ms. The
picture jumps at once anyway. A change that comes during a cut waits for it. Once a stream has been
played through the delay it stays on that path at 0 ms when the viewer returns to Standard, because
swapping to the element's own sound would be a second jump. A 4 s step was removed: it was too long to watch with.

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

So the chosen quality is what is sent, and a **load monitor** tells the host when it cannot keep up
(`src/core/media/load-monitor.ts`, driven by `src/core/session/load-control.ts`). It never changes the
quality itself: the host does that in Settings. Every 2 seconds it reads each link's counters and judges the change:

- A link is **behind** when it encodes under 80 % of the frames it should (the source's frame
  rate, capped by the quality; below 5 a second a picture is too still to judge).
- A link is **squeezed** when it loses more than 5 % of its packets, or when the available bitrate
  (Chromium only) is under 70 % of the cap while the link already uses 70 % of it. A low rate
  alone means nothing: a still picture is cheap.
- The first 8 seconds of a link are not judged, nor a reading whose counters fell.
- The **host struggles** when half of the links (all of one or two) are affected for three
  readings in a row. Then the host is told, on the stage line, that some viewers may get the picture
  late. The line goes back to normal after one reading in which the host keeps up. The cause is
  "your computer" when most affected links are behind, "your connection" otherwise.
- One viewer alone on a poor connection does not affect the rest; that viewer is marked slow.

The host always sees what is sent ("720p · 30 fps · 1.8 of 3.5 Mbit/s · 8 viewers"), and when it
struggles, why. The bitrate is a ceiling, and a quiet picture uses far less of it, so the line says
what each viewer really gets next to the limit: `SendRate` (`src/core/media/send-rate.ts`) takes it
from the `bytesSent` counters the load monitor reads anyway, as the mean over the links, smoothed
by half a reading, and `LoadControl` hands it on as `sendingBps`. Until two readings are in, the
line says "up to 3.5 Mbit/s". It counts the picture only; the sound has no counter there (a few
dozen kbit/s). Without this line a host could change the bitrate and see nothing happen, which is
what it looks like for any picture that needs less than the limit. The thresholds are
first guesses in one place (`LOAD_RULES`). The monitor is pure, readings in and a decision out,
and takes its time from the readings, so it is tested with sequences and no timers.

Many viewers also need two tools: several invitations at once (each a card with its own number;
places are held while their connections are made) and removing a viewer (`removed`, then the link
closes a third of a second later so the message gets out).

**What reaches the viewers.** The host's counters say what it sent, not what arrived. A viewer
that shows the picture therefore reads its own receive counters every two seconds
(`src/core/peer/receive-stats.ts`) and sends the change as a `receive-report`: packets lost, frames
shown a second, jitter, how long a frame waits in the jitter buffer, freezes and the round trip.
The People tab shows them under the viewer's name, and a guess at the cause when the picture does
not arrive well (`describe-receive.ts`: loss first, then a long wait, then freezes). Why: a host
that does not struggle can still have viewers who see a late, stuttering picture, and only the
receiving side can tell a lossy path from a slow computer. The report is information for the host;
the quality is still the host's choice.

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
   (`share-revoked`) and answers any request that still waits with `busy`.
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
  element, waiting off-screen and inert; it slides in over the picture when the pointer rests on
  the handle (an arrow, 28 px wide and 96 px high) at the middle of the right edge, and slides out
  400 ms after the pointer left. The edge as a whole does not open it: a strip along the whole
  edge did, and opened the sidebar whenever the pointer went to the right to reach a scroll bar
  or another window. The handle is tinted with the accent colour (35 % opaque, with a blur behind it) and has a shadow, so that it is found without shouting: the
  highlight has to be there at rest, because the sidebar opens the moment the pointer is on it. The sidebar stays while
  something in it has focus; a click on the picture closes it. A click on the handle and the `S`
  key serve touch screens and a monitor on the right.
- **Only the picture when idle:** after three seconds without a move, key, click or scroll, the
  controls and the mouse pointer fade out (`data-idle` on the workspace; a control joins with the
  classes in `stage-fullscreen.ts`). The pointer resting on the sidebar is not idle. A pointer move
  to the same position is ignored: a browser sends one when the element under a resting pointer
  changes, which fading does.
- **Volume** is a slider next to the viewer's mute button. Moving it while muted turns the sound
  back on, and the level is remembered for the next session; muting is not, so nobody joins the
  next session wondering why there is no sound. The host's preview has no sound controls.
- **A message in full screen** shows a small chat symbol near the right edge for one second, unless
  the open sidebar is in view.
- **The chat keeps the latest 500 messages**; each one after that makes the oldest be forgotten.
  The number of messages from others, which the symbol above rests on, is counted when they come
  in and not taken from the list, because in a full list the count of messages stays the same
  while the news does not. The list scrolls on the id of the newest message for the same reason.
- **Settings the page remembers** (the name, the volume, the smoothing buffer) go through
  `settings-storage.ts`; a browser that refuses to store them costs only the memory, never the
  session.
- Traps that cost time: popups rendered into `body` (Radix portals) are invisible in full screen;
  the handle at the edge must stay in the page, unseen and inert, while the sidebar covers it (an
  element that is gone cannot report that the pointer left, and the sidebar then never closed); and
  the off-screen sidebar must never scroll into view. The workspace uses `overflow: clip`, and
  the chat scrolls only its own list, never with `scrollIntoView`, which scrolled the picture
  sideways.

Not done: a browser side panel next to the shared tab (a prototype worked in Chromium, but it
needed a second UI that mirrors the first, a channel between them, and a window share would show it
to the viewers) and a panel injected into the shared page (it would need access to every website).

## 10. Code and stack

WXT builds one TypeScript codebase for Chrome, Brave and Firefox (Manifest V3). The interface is
React 19 with Tailwind CSS 4 and shadcn/ui (component source copied into `src/components/ui/` and
owned here), icons from `lucide-react`.

The host side of a session is `HostSession` (`src/core/session/host-session.ts`), which owns the
invitations, the roster, the chat and the links, and hands the rest to small classes that it
creates and that know nothing about each other:

- `ShareCoordinator` (`share-coordinator.ts`): who is on the stage. The host's own share, the
  requests of viewers, the one viewer who was allowed and whose picture is passed on. It reaches
  the session only through the closures of `SharingHost` (send a message, guard a link, tell the
  listeners), so it can be read and tested without the rest.
- `MediaChoices` (`media-choices.ts`): the quality, the codec and the weak-connection mode the host
  chose, and what follows from them (the limits, the codec to offer first). The session applies
  them to the links and tells the listeners.
- `LoadControl` (`load-control.ts`): the load monitor on a timer.
- `RateLimit` (`rate-limit.ts`): what a viewer may send as often as it likes.

The public methods of `HostSession` did not change when these were split out; they pass on.

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
- Diagnostics: connection errors and the "session ended" screen offer "Copy technical details"
  (the connection state, what each side's code offered, the latest log lines), and an error page
  with the same details replaces a blank screen when the interface itself fails. Uncaught errors
  and unhandled rejections go to the log. Firefox refuses to read a closed connection, so the
  details are taken from the last state seen before it closed.
- The log (`src/core/log/logger.ts`) takes only plain values and is written to carry counts,
  states and error names, never codes, descriptions, names or chat text. "Copy technical details"
  shows its latest lines.

Not done: plain DOM (did not scale), Preact or Svelte (the maintainer chose React, and shadcn/ui
targets it), MUI or Chakra (heavier, less control over the markup).

## Privacy

- No WatchP2PStream server, no data collected. Video, sound and chat go directly between host and
  viewer, encrypted by WebRTC (DTLS/SRTP).
- A public STUN server (`stun.l.google.com`) sees the participants' public IP addresses, no content.
- Codes contain the sender's IP addresses. Viewers see each other's names, never their addresses.
