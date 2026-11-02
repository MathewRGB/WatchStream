# Future work

Ideas that are not planned, with what is known about them, so that nobody has to find it again.
None of them is needed for the first release. How WatchP2PStream works today is in
[architecture.md](architecture.md).

## Handing the host role over

The wish: when the host leaves, one of the viewers becomes the host and the session goes on
(maintainer, 2026-10-28; after the release).

**Is it possible?** Yes, but not with the star alone. Viewers are connected to the host only and
there is no signalling server, so once the host is gone nobody can make a new connection.

**Idea.**

- While the host is there, it relays the connection setup between viewers over the data channels
  it already has (new messages). So every viewer gets a standby connection to the successor, with
  no media.
- The successor is fixed in advance by a rule everyone can compute (for example the viewer
  connected the longest), so nobody has to vote.
- A host that leaves on purpose says so; a host that crashes is noticed by its lost connection, a
  few seconds later.
- The successor becomes the host over the standby connections and gets a successor of its own,
  set up the same way.

**What makes it hard.**

- A viewer who loses the host while the others do not (a network problem on one side) must not
  start a second session. The rule needs a clear answer for this split.
- The state moves with the role: participants, who was removed, the chosen quality. Open
  invitations are lost; their connections belong to the old host.
- The share ends with the old host's computer: the session survives, not the picture.
- A `ViewerSession` has to become a `HostSession` in a running page, reusing its connections. The
  largest change to the code.
- The successor gets the host's powers (remove, invite, allow sharing). The host may need a way
  to rule out or name a successor.
- It needs the same viewer-to-viewer connections as relaying the picture (below); both are best
  designed together.

**Estimate.** More work than the twelve-viewer milestone: new messages, the change of both
session classes, failure tests with the fake network, end-to-end tests in Chromium and Firefox and
a manual test guide. A guess, not a plan.

## Relaying through viewers

In the star every viewer is a copy the host encodes and sends. In a tree, viewers pass the picture
on, so each node carries what a host carries today for two or three viewers, and the viewer count
is no longer bounded by the host alone.

| Children per node | Viewers at depth 1 | Depth 2 | Depth 3 |
| ----------------- | ------------------ | ------- | ------- |
| 2                 | 2                  | 6       | 14      |
| 3                 | 3                  | 12      | 39      |

A broad, shallow tree keeps the delay low. The host stays the root and assigns parents: a new
viewer goes under the shallowest node with room, among equals under the one with the shortest
round trip; nodes that delivered best go near the top.

**What would make it work.**

- **Pass on encoded frames.** Handing a received track to another connection decodes and encodes
  again: roughly 150-300 ms more per hop (estimated), quality loss and the CPU cost measured for
  the load monitor. The Encoded Transform API (`RTCRtpScriptTransform`) would pass the encoded
  frames on for perhaps 20-60 ms per hop (estimated) and might let the host encode once for all its
  children. Chromium 156 and Firefox 157 have its building blocks. Not shown: one receiver to
  several senders, matching codecs, key frames across hops, audio, Chromium to Firefox, the real
  delay.
- **Connection setup through the host**, over the data channels it already has, so no new codes by
  hand. A failed link between viewers (strict routers) means asking the host for another parent.
- **Placement by capacity.** Three children at Balanced need about 10 Mbit/s upload, more than many
  homes have. The number of children follows what a node has delivered.

**What it costs.**

- **Privacy:** a viewer and its parent see each other's addresses, so it needs consent ("I may pass
  the picture on"); who declines is a leaf. A relay sees the frames: "end-to-end encrypted" would no
  longer be true.
- **One quality for all** without encoding again; a weak branch stutters. Way out: two qualities
  from the host.
- **Failures:** when a relay leaves, its children lose the picture for some seconds.
- **Size:** the largest amount of new code of anything here.

**How to begin.** A spike for the forwarding alone (host, relay, child, in Chromium, Firefox and
mixed), measuring delay per hop with a time stamp in the picture, the relay's CPU, key frames and
audio. If a hop costs well under 100 ms and the relay's load is negligible, build the tree as pure
logic first (placement, re-parenting, failures, simulated with 12 and 40 viewers), then for real.
The load monitor's readings are what would place a node.

## Sync mode for protected sites

Left out by the maintainer (2026-10-27). Protected content cannot be captured, so it would be
synchronised instead: everyone plays it in their own tab and only the playback state travels.
Quality is the original; every viewer needs their own access.

**Design.**

- Only DRM-protected content would use it (`video.mediaKeys` is set). Everything else, YouTube
  included, stays in stream mode, because a single viewer can be blocked by region or age.
- The host sends position, play/pause, rate, a time stamp and a content id on every change and
  every second (also while paused, so silence means the host is gone); a joining viewer gets the
  latest state at once.
- Viewers estimate the clock offset by ping and pong (the fastest of the last few round trips) and
  extrapolate. Under 1 s off: a slightly changed playback rate; more: a seek and a short pause.
- Viewers send no control commands; local input is reset to the host's state. A different content
  id (other title or version) shows a warning and changes nothing.
- A generic `<video>` adapter (`play`, `pause`, `seeked`, `ratechange`), and per-site adapters for
  players that do not tolerate it (Netflix through its player API; never verified).

**Learned from the removed slice** (it passed end-to-end tests in the real extension with a local
video page):

- The session page holds the connections and the player lives in another tab, so a content script
  per player tab talks to the session page through extension messaging. Limited to supported
  sites, it does not need access to all websites. Content scripts stay plain TypeScript without
  React or global CSS; if they need UI, a Shadow DOM.
- A viewer's first ping has to wait for `welcome`, or it can arrive before the host listens.
- The load is a small message per viewer and update; sync would not limit the viewer count.

**Costs.** Every viewer needs a subscription; per-site adapters break when services change their
players; different regions or versions of a title disturb the sync; the Netflix adapter cannot be
tested without a subscription. It would need its own wire format, a clock estimate and its own
milestone.

## Sound level independent of the host's volume

The wish: viewers always get the sound at full level and set their own volume; what the host does
with the player's volume slider (or a muted tab) should not reach them (maintainer, 2026-10-29).

**Why it happens.** The viewer's slider only sets `volume` on its own `<video>`; no level travels
over the connection. The coupling is in the capture: sound taken from a media element comes after
that element's `volume` and `muted`. The system volume is probably not part of it (not measured).
Window and screen sharing with system sound depends on the operating system and has not been
looked at.

**Idea.**

- **Firefox (tab sound):** the injected script sets the element to `volume = 1` and takes the
  samples there, and applies the host's wanted level only as a gain on the branch to the host's own
  speakers. The page's own volume slider needs to be followed (`volumechange`) and its value kept
  as that gain. Fragile where a player resets the volume itself.
- **Chrome and Brave:** `getDisplayMedia` tab audio comes after the player's volume and cannot be
  changed. The same element tap as in Firefox would work, at the cost of the single-element and
  protected-media limits. Until then a note for the host: leave the player at 100 % and use the
  system volume.
- **Viewer-side compensation:** the host sends the player level over the data channel and the
  viewer divides it out. Cheap, but it amplifies noise at low levels and can clip; a limiter on the
  viewer side would soften both. Probably a fallback, not the fix.

## Smaller items

- **TURN:** an optional, self-configured relay for symmetric NAT and CGNAT. The test across two
  networks passed without one; add it when users report failures.
- **Quality limits for the sharer:** `share-granted` could carry the host's chosen limits, so a
  viewer does not upload more than the host passes on.
- **"Allow without asking"** for viewer shares, as a host setting.
- **Encode once for the star** with the Encoded Transform API, which would make the host's CPU cost
  constant. A spike comes before any promise.
- **Prefer a hardware encoder** where the browser offers one, once the monitor shows what it is
  worth.
- **Unread count** in full screen, or a notice that says who wrote.
