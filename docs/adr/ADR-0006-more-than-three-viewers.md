---
id: ADR-0006
title: Up to twelve viewers: a load monitor lowers the quality; relaying through viewers is future work
status: accepted
date: 2026-10-28
deciders: [Mathias Kuhlmey]
amends: [ADR-0001, ADR-0005]
---

# ADR-0006: Up to twelve viewers: a load monitor lowers the quality; relaying through viewers is future work

## Context

ADR-0001 fixed "2-3 viewers per session" and the code carries it as one constant
(`DEFAULT_MAX_VIEWERS = 3`). The maintainer wants more (2026-10-28).

What the star topology of ADR-0001 costs the host per viewer, in stream mode (ADR-0005):

| Resource            | Cost per viewer                                                 | Grows with the viewer count |
| ------------------- | --------------------------------------------------------------- | --------------------------- |
| CPU                 | one encode of the whole picture (each connection encodes alone) | linearly or worse           |
| Upload              | the preset's bitrate: Saver 1.5, Balanced 3.5, Sharp 6 Mbit/s   | linearly                    |
| Manual invitations  | one code out, one reply back                                    | linearly                    |
| Chat, people, state | a few bytes per message                                         | negligible                  |

Nothing in the protocol or in the sessions depends on the number three. The limit is a promise
about what a host can carry, and that is decided by the host's machine and connection, which no
constant can know.

## Measurements (2026-10-28)

**Method.** Headless Chromium 156, software encoding (VP8, no hardware encoder in the test
environment). The host sends one animated 1080p canvas (a gradient and 260 moving rectangles, a
demanding picture) to N local connections with the caps of the app's presets (`maxBitrate`,
`maxFramerate`, `scaleResolutionDownBy`). The viewers run in a separate browser process, so the
host does not decode them. The host browser is pinned to a number of cores with `taskset`. 20 s
warm-up (the browser needs about that long to climb to the full resolution), then 6 s measured from
the browser's own `outbound-rtp` statistics. "Cores" is the encoder time per second.

| Host cores | Preset (target) | Viewers | Mbit/s each | Frames/s each | Cores used |
| ---------- | --------------- | ------- | ----------- | ------------- | ---------- |
| 4          | Sharp (30)      | 1       | 3.9         | 18            | 0.4        |
| 4          | Sharp (30)      | 3       | 2.6         | 14            | 2.7        |
| 4          | Sharp (30)      | 5       | 1.4         | 7             | 3.0        |
| 4          | Balanced (30)   | 1       | 3.4         | 24            | 0.2        |
| 4          | Balanced (30)   | 3       | 1.2         | 10            | 3.0        |
| 4          | Balanced (30)   | 6       | 0.7         | 6             | 3.0        |
| 4          | Balanced (30)   | 9       | 0.5         | 4             | 3.0        |
| 4          | Saver (24)      | 6       | 0.55        | 8             | 3.0        |
| 4          | Saver (24)      | 12      | 0.27        | 4             | 3.0        |
| 8          | Sharp (30)      | 3       | 4.1         | 21            | 1.9        |
| 8          | Sharp (30)      | 6       | 2.7         | 13            | 5.7        |
| 8          | Balanced (30)   | 3       | 3.5         | 30            | 0.8        |
| 8          | Balanced (30)   | 6       | 1.9         | 14            | 5.6        |
| 8          | Balanced (30)   | 9       | 1.2         | 9             | 6.9        |
| 8          | Saver (24)      | 12      | 0.54        | 7.5           | 6.9        |

**What the numbers say.**

1. **The host's CPU gives out before its upload does.** With enough cores each viewer gets about
   the bitrate of the preset (Saver 1.35, Balanced 3.1 to 3.5, Sharp 4 to 6 Mbit/s), so the upload
   needed is the preset times the number of viewers. With few cores the encoder uses up all but one
   core and the picture is delivered at a fraction of its frame rate: on 4 cores three viewers at
   Balanced get 10 of 30 frames per second, and twelve viewers at Saver 4 of 24.
2. **The browser does not say so.** `qualityLimitationReason` read `none` while only 2 to 4 frames
   per second came out, and `bandwidth` while the cause was the CPU. It cannot be used to find out
   that the host is overloaded. What is delivered (frames encoded against frames the source
   produced) can.
3. **The load is not linear.** Six viewers cost far more than twice three (8 cores, Balanced:
   0.8 cores for three, 5.6 for six). Each connection scales and encodes the source on its own.
4. **Quality has to come down in steps below Saver.** Pixels times frame rate is the encoder's
   cost; 360p at 15 frames per second costs about an eighth of 720p at 30.

**Limits of these numbers.** The picture is synthetic and hard to encode, and the encoder is
software only; a real screen share is often easier, and a hardware encoder (H.264 on a graphics
chip) changes the cost a lot, within the limit of concurrent sessions the driver allows. So the
numbers show the shape (finite CPU, one encode per viewer, no warning from the browser), not a
limit to build in. They are a reason not to build one.

**Statistics that exist** (checked in Chromium 156 and Firefox 157): in both, `outbound-rtp` has
`framesEncoded` and `bytesSent`, `media-source` has `frames` (what the source produced) and
`remote-inbound-rtp` has `fractionLost` and `roundTripTime`. `availableOutgoingBitrate` on the
candidate pair exists in Chromium only. The monitor must work without it.

## Decision

### 1. Twelve viewers, fixed

A session holds at most **12 viewers**. It is a constant (`MAX_VIEWERS`), not a setting: no choice
for the host to make and no promise about what a machine carries. With many viewers some of them
may get the picture late or at a lower quality; that is accepted. The host is told when it happens
(section 4).

### 2. The chosen quality is a ceiling; the effective quality follows what the host can carry

The host's choice stays, but it means "at most this". A fourth step below Saver, **Minimal**
(360p, 15 frames per second, 0.6 Mbit/s, sound 64 kbit/s), is added so that quality has somewhere
to go. The effective step for all viewers is the chosen step lowered by a `penalty`, which the load
monitor (section 3) raises and lowers. It never goes below Minimal. There is no switch to turn this
off: a host that is not struggling is not touched, and one that is, is better off.

The host's upload speed is not asked for. WatchStream cannot measure it without a server (ADR-0001),
and the monitor sees its effect (squeezed links) anyway.

### 3. A load monitor measures delivery, and only delivery

Every 2 seconds the host reads each link's statistics (`MediaLink.stats()`, section 6) and works on
the change since the last reading, with `expected = min(frames the source produced per second,
the effective step's frame rate)`:

- A link is **behind** when `expected` is at least 5 and the frames encoded per second are under
  80 % of it. Comparing with the source keeps a still picture, which produces few frames, from
  counting.
- A link is **squeezed** when more than 5 % of its packets are lost, or when the available
  outgoing bitrate (where the browser gives it) is under 70 % of the bitrate cap _and_ the link
  already sends at least 70 % of it. A low bitrate alone is no symptom: a still picture is cheap,
  and the browser's estimate does not climb while little is sent, so a low estimate on a quiet link
  means nothing.
- The first 8 seconds of a link are not judged: the browser is still finding its rate. A reading in
  which a counter fell (the sender was replaced) is skipped.
- The **host is struggling** when at least half of the links, and at least two when there are more
  than two (all of them when there are one or two), are behind or squeezed for three readings in a
  row. All links suffering together is the signature of the host's CPU or upload. One viewer on a
  poor connection is affected alone and is left to the browser's rate control for that connection;
  that viewer is shown as slow, and the rest keep their quality. The cause is "the computer" when
  most of the affected links are behind and "the connection" otherwise.
- When the host is struggling, `penalty` goes up by one, and the next decision waits 10 seconds so
  that the effect can show. When the host has not been struggling for 90 seconds (one slow viewer
  does not count), `penalty` goes down by one, and the next step up waits another 90. At Minimal
  with the host still struggling, nothing more is done and the host is told so.

The decision logic is pure (readings in, a decision out) and takes its time from the readings, so
it is tested with simulated sequences and no timers. The constants (80 %, 70 %, 5 %, 8 seconds, 3
readings, 10 and 90 seconds) are first guesses and live in one module.

### 4. The host always sees what is happening

- On the stage, while sharing, one short line: "720p · 8 viewers", and when lowered, why:
  "Lowered to Saver (480p · 8 viewers): your computer is busy" or "... your connection cannot keep
  up". At the lowest step and still struggling: "... cannot keep up. Some viewers may get the
  picture late." It fades with the other controls in full screen and wraps in a narrow window.
- In the People tab a viewer who is not keeping up carries a small "slow" mark, with a title that
  says what it means. Viewers see nothing new.
- The Settings tab says that the chosen quality is the most that is sent and may be lowered by
  itself.

### 5. Many viewers need two small tools

- **Invite several**: create several invitations in one step (up to the free places), each with its
  own code, in compact cards. An invitation that is answered turns into a person as now.
- **Remove a viewer**: a button on each person in the People tab. The host sends `removed`, then
  closes the link. The viewer is told "The host removed you from the session". A peer that does not
  know the message just sees the link close (unknown types are dropped, as for every message).

### 6. Statistics come through the link, as plain numbers

`MediaLink` gains `stats(): Promise<LinkStats | null>` with the counters the monitor needs: frames
encoded, frames the source produced, bytes sent, the available outgoing bitrate (or `null`), the
fraction of packets lost (or `null`) and the round trip time (or `null`). `PeerLink` reads them from
`getStats()` (it already does for the path in the log); `FakeLink` takes them from the test. The
sessions never touch `RTCPeerConnection`, as in ADR-0005. A closed connection answers `null`
(Firefox refuses to read it).

## Plan, in small commits

1. Twelve viewers: `MAX_VIEWERS`, the texts in the Invite tab, README and the ADRs. Tests: sessions
   with 12 viewers; an E2E with a host and four viewer pages.
2. `MediaLink.stats()` in `PeerLink` and `FakeLink`. Integration tests in Chromium and Firefox with
   real connections: the numbers are present and grow.
3. The Minimal step and the pure policy (effective step from chosen step and penalty).
4. The load monitor, driven by readings, wired into `HostSession`, with a `load` event that carries
   the effective step and the reason. Tests with sequences: struggling and recovering, one slow
   viewer that must not lower the rest, a still picture that must not count, no `availableBps`
   (Firefox), the 10-second wait, the stop at Minimal. An integration test that the limits reach
   every sender.
5. The interface of section 4.
6. Invite several, remove a viewer, the `removed` message.
7. The measurement as a script in the repository (`scripts/measure-host-load.mjs`, the one used
   above, cleaned up), a manual test guide for many viewers on several devices, an E2E for the whole
   flow, the documents.

## Consequences

- A host with a weak computer can host six viewers at a lower picture instead of three viewers at
  a picture that does not move. The price is that the picture a host chose may be lowered without
  being asked; the reason is always shown.
- At twelve viewers some of them may get the picture late or at Minimal; accepted.
- Upload stays the host's own business. The monitor reacts to its effect where the browser reports
  it (Chromium: available bitrate; both: lost packets).
- The numbers above come from one machine and a synthetic picture. The monitor reacts to what the
  host really delivers, so it needs no such numbers.
- ADR-0001's requirement "2-3 viewers" and ADR-0005's "(max 3)" are replaced by "up to 12".

## Rejected alternatives

- **Only raise the constant:** a host with a weak computer gets a picture at 4 frames per second
  and no hint why; the browser does not report it (finding 2).
- **A number of viewers as a setting:** the host would have to guess what its machine carries, and
  the numbers say the answer differs by a factor of ten between machines.
- **Fixed limits per quality** ("Sharp up to 2 viewers, Balanced up to 4 ..."): wrong for most hosts
  for the same reason.
- **Reading `qualityLimitationReason`:** it said `none` at 2 frames per second (finding 2).
- **Asking for the upload speed:** WatchStream cannot check the answer without a server.

## Future work: relaying through viewers

Left out for now (maintainer decision, 2026-10-28). Idea and what is known, so it does not have to
be found again.

### Idea

With the star topology every viewer is a copy the host encodes and sends. In a tree, viewers pass
the picture on to other viewers, so the host has a few children and each of those a few more. Each
node then carries about what a host carries today for two or three viewers, and the number of
viewers is no longer bounded by the host's computer and upload alone.

| Children per node | Viewers at depth 1 | Depth 2 | Depth 3 |
| ----------------- | ------------------ | ------- | ------- |
| 2                 | 2                  | 6       | 14      |
| 3                 | 3                  | 12      | 39      |

A broad, shallow tree keeps the delay low (a chain would have as many hops as viewers; a network
that pulls, like BitTorrent, adds delay). The host stays the root and the authority: it knows the
tree and assigns parents. A new viewer goes under the shallowest node with room, and among equals
under the one with the shortest round trip (the data channels measure it). The strongest nodes,
those that delivered best, go near the top.

### What would make it work

- **Pass on encoded frames.** Handing a received track to another connection makes the browser
  decode and encode again: roughly 150 to 300 ms more per hop (an estimate, not measured), a loss
  of quality and exactly the CPU load measured above. The Encoded Transform API
  (`RTCRtpScriptTransform`) would pass the encoded frames on without that, for perhaps 20 to 60 ms
  per hop (also an estimate), and would let the host encode once for its children. Chromium 156 and
  Firefox 157 both have its building blocks (transforms on sender and receiver, encoded video and
  audio frames, key frame requests in the worker). Not shown: forwarding from a receiver to several
  senders, matching codecs, key frames across hops, audio, Chromium to Firefox, the real delay.
- **Connection setup through the host.** The host passes the offers and answers between two
  viewers over the data channels it already has. No new codes by hand, which was the old objection
  to links between viewers. A link between viewers can fail (strict routers); then the viewer asks
  the host for another parent.
- **Capacity-aware placement.** A node with three children sends three copies: 10 Mbit/s at
  Balanced, more than many home connections give. The number of children of a node must follow what
  it has delivered, and the sum of the uploads of the group is the limit of the tree.

### What it costs

- **Privacy.** A viewer and its parent see each other's addresses. It needs a consent ("I may pass
  the picture on"); who declines is a leaf. The README's "end-to-end encrypted" would no longer be
  true: each hop is encrypted, but a relay sees the frames.
- **One quality for all.** Without encoding again nobody can be served at a lower quality. A weak
  branch stutters. A way out is two qualities from the host, with leaves choosing.
- **Failures.** When a relay leaves, its children lose the picture until the host has given them a
  new parent: some seconds.
- **Size.** The largest amount of new code of anything in this document: tree management,
  placement, re-parenting, failure cases.

### How to begin, if it is taken up

1. A spike for the forwarding alone: host to relay to child in Chromium and Firefox, also mixed,
   measuring the delay per hop (a time stamp in the picture), the CPU of the relay, key frames and
   audio. If the delay per hop is well under 100 ms and the relay's load is negligible, build the
   tree; if not, relays that encode again, at depth 1 only, or none.
2. The tree as pure logic (placement, re-parenting, failures), simulated with 12 and 40 viewers.
3. Only then the forwarding for real, the interface and the consent.

The load monitor of this ADR stays useful there: its readings are what places a node.

### Also left out

- **Encode once for the star.** The same API might let the host encode once for all its viewers,
  which would cut the CPU cost to a constant. A spike comes before any promise.
- **A signaling service for invitations** (ADR-0001 allows one, media-free): inviting twelve people
  stays manual until then.
- **Preferring a hardware encoder** where the browser offers one, once the monitor shows what it is
  worth.
