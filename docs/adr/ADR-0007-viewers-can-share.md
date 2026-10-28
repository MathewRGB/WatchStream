---
id: ADR-0007
title: Viewers can share: the host approves and forwards
status: accepted
date: 2026-10-28
deciders: [Mathias Kuhlmey]
amends: [ADR-0005]
---

# ADR-0007: Viewers can share: the host approves and forwards

## Context

ADR-0005 section 5 made it a requirement that viewers can share too, and sketched the design: the
star topology stays, a viewer asks, the host approves, the viewer sends its stream to the host and
the host forwards it. M3 prepared for it (messages carry `sourceId`, negotiation is symmetric,
the stage shows who shares). This ADR fixes the details.

## Decision

### 1. One stream on the stage, host first

At most one stream is shared at a time: the host's own, or one viewer's. A request while something
is shared is answered `busy` at once. When the host starts its own share while a viewer shares,
the host's share wins and the viewer is told (`share-revoked`): the host is authoritative.

### 2. Capture first, then ask

A browser only opens its picker on a fresh user action, and the host's answer can take longer than
that. So the viewer picks the source first and holds the stream, then asks. If the host declines
or is busy, the viewer's tracks are stopped. The picker opening and the host being asked are two
steps the viewer sees one after the other, which is why the viewer's own button says "Share" and the
stage tells them that they wait for the host.

### 3. Messages (additive to protocol v1)

A peer that does not know a message drops it, as the protocol says, so older peers do not break.

| Direction     | Message                        | Meaning                                        |
| ------------- | ------------------------------ | ---------------------------------------------- |
| viewer → host | `share-request`                | the viewer holds a stream and asks to share it |
| viewer → host | `share-stop`                   | the viewer ended its share                     |
| viewer → host | `media-offer {sourceId, sdp}`  | negotiation for the viewer's own stream        |
| host → viewer | `share-granted`                | go ahead: send the stream                      |
| host → viewer | `share-denied {reason}`        | `declined` or `busy`                           |
| host → viewer | `share-revoked`                | the host ended the viewer's share              |
| host → viewer | `media-answer {sourceId, sdp}` | the answer to the viewer's offer               |

In `media-offer` and `media-answer`, `sourceId` is the participant who made the offer, so the
existing check "an answer names the host" keeps its meaning, and a viewer can only offer for itself.
`media-started` and `media-stopped` keep naming the participant whose picture it is: to a viewer
who watches a forwarded share, the offers come from the host and `media-started` names the sharer.

### 4. Forwarding

The host's link to the sharing viewer receives the tracks. When they arrive the host announces
`media-started` to everyone else and puts the same stream on their links, which the links encode
once per viewer, as for the host's own share. The quality limits, the load monitor and the
automatic lowering of ADR-0006 apply to a forwarded share exactly as to the host's own, except that
the sharer's own link is not read: it sends no picture. The sharer never gets its own picture back.
A forwarded share costs the host a decode and a re-encode, as ADR-0005 accepted.

A link can gain tracks one at a time (video, then sound). So that the forwarded stream is complete,
`setOutgoing` compares the stream's current tracks with what a link already sends and updates it
when they differ, instead of returning early for the same stream object.

### 5. Ending

A share ends when the viewer stops it (`share-stop`), when the browser's own stop button ends the
capture, when the host revokes it, when the host starts its own share, when the viewer is removed,
or when its link closes. In each case the other viewers get `media-stopped` and their links stop
sending.

### 6. Who is asked

The host sees a request in the People tab and as a line on the stage, and decides with one click.
There is no standing permission: each share is approved on its own. A setting for "allow without
asking" is future work.

## Consequences

- Viewers still never connect to each other. Nobody learns another viewer's IP address.
- The sharer sends at the quality its browser picks; only the host re-encodes to the chosen limits.
  Telling the sharer what to send (the quality limits in `share-granted`) is future work.
- A viewer on a new build talking to a host on an old one waits for an answer that never comes.
  Both sides come from the same extension, so this is accepted.
- Tests: the fake network covers the message flow and the forwarding with several viewers; an end-to-end
  test in the real extension covers a viewer sharing to the host and another viewer.

## Future work: handing the host role over

Left out for now (maintainer decision, 2026-10-28), to be taken up after the release. The wish: when
the host leaves, the host role passes to one of the viewers and the session goes on. What is known,
so it does not have to be found again.

### Is it possible?

Yes, but not with the star topology alone. The viewers are connected to the host only, and there is
no signalling server, so once the host is gone nobody can make a new connection: that needs codes
that people carry by hand.

### Idea

- While the host is still there, it relays the connection setup between viewers over the data
  channels it already has (new messages). In this way every viewer, or only the successor, gets a
  standby connection to the successor, which carries no media.
- The successor is fixed in advance by a rule everyone can compute (for example the viewer who has
  been connected the longest), so that nobody has to vote.
- A host that leaves on purpose says so. A host that crashes is noticed by the lost connection, a
  few seconds later.
- The successor then becomes the host over the standby connections, and the others follow it. It
  needs a successor of its own, which is set up the same way.

### What makes it hard

- A viewer who loses the host while the others do not (a network problem on that one side, not a
  host that left) must not start a second session. The rule needs a clear answer for this split.
- The state moves with the role: the participant list, who was removed, the chosen quality.
  Invitations that are open are lost, because their connections belong to the old host.
- The share ends with the old host's computer. The session survives, not the picture.
- A `ViewerSession` has to become a `HostSession` in a running page, reusing its connections. This
  is the largest change to the code.
- The successor gets the host's powers (remove, invite, allow sharing). The host may need a way
  to rule out a successor, or to name one.
- The star topology of ADR-0001 changes: this amends it, and the relaying of the picture through
  viewers (ADR-0006, future work) needs the same viewer-to-viewer connections. Both are best
  designed together.
- Protocol version 1 grows by new messages; older peers drop them, so a mixed session does not
  hand over.

### Estimate

More work than M5: its own ADR, new protocol messages, the change of the two session classes,
failure tests with the fake network, end-to-end tests in Chromium and Firefox, and a manual test
guide. A first guess, not a plan.
