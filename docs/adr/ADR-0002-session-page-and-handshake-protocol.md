---
id: ADR-0002
title: Session page hosts the connections; handshake codes and data-channel protocol v1
status: accepted
date: 2026-10-26
deciders: [Mathias Kuhlmey]
amends: [ADR-0001]
---

# ADR-0002: Session page hosts the connections; handshake codes and data-channel protocol v1

## Context

ADR-0001 planned to keep the WebRTC connections in an offscreen document (Chrome/Brave) or an
event page (Firefox). Building M1 surfaced two problems with that:

- The manual handshake makes users switch to a messenger and back several times. A popup closes
  as soon as it loses focus, so it cannot hold a connection or the UI for this.
- Offscreen documents exist only in Chromium, need a declared reason and are invisible to the
  user. Firefox would need a different place for the same code.

M1 also had to fix the concrete wire formats that ADR-0001 only sketched.

## Decision

### 1. The connections live in an extension tab page

`session.html` is an extension page opened in a normal tab. It holds the `HostSession` or
`ViewerSession` and all `RTCPeerConnection`s. Clicking the toolbar icon opens this tab, or
focuses it if it is already open (its tab id is kept in `storage.session`). There is no popup.

The page uses no extension APIs, so the same build also runs as a plain web page. The
cross-browser end-to-end test relies on this to run Firefox, into which Playwright cannot load
extensions.

### 2. Handshake codes, format version 1

- Invitation: `WSI1.<payload>`, reply: `WSR1.<payload>`.
- Payload: `base64url(deflate-raw(JSON))`. Invitation JSON:
  `{ kind: "invitation", inviteId, hostName, sdp }`; reply JSON:
  `{ kind: "reply", inviteId, viewerName, sdp }`.
- Non-trickle signaling: all ICE candidates are gathered (at most 3 s) before a code is created.
- Decoding removes all whitespace (messengers wrap long text), checks prefix and version, caps the
  decompressed size at 32 kB and validates every field: `inviteId` matches
  `[A-Za-z0-9_-]{8,64}`, names are 1-40 characters, the SDP starts with `v=0` and is at most
  20 000 characters.
- Measured with the public STUN server: invitations are about 840-880 characters, replies about
  710-880 characters.

Any change to this format increments the version number. An unknown version is rejected with a
message asking both sides to use the same WatchStream version.

### 3. Data-channel protocol v1

One reliable, ordered data channel (`watchstream`) per viewer. JSON messages:

| Direction     | Message                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| viewer → host | `{ type: "chat", text }`                                                |
| host → viewer | `{ type: "welcome", participantId }`                                    |
| host → viewer | `{ type: "roster", participants: [{ id, name, role }] }`                |
| host → viewer | `{ type: "chat", message: { id, senderId, senderName, text, sentAt } }` |

The host is authoritative. It assigns ids and timestamps and relays every chat message to all
viewers, including the sender, so everyone sees the same order. Chat text is trimmed and limited
to 1000 characters. Invalid messages are dropped without a reply.

### 4. Session rules

- An invitation is single-use and reserves one of the three viewer places until it is used or
  cancelled.
- After the host applies a reply, the connection has to open within 20 seconds; otherwise the
  invitation is used up and reported as a failed direct connection.
- A link that has not opened yet is not closed when the browser reports the connection as failed:
  the viewer's ICE starts before the host has the reply and can fail in the meantime (a person
  carries the reply through a chat). Only the host's timeout or leaving ends it. An open link that
  fails is closed.
- Viewer names come from the reply code; no extra hello message is needed.

## Consequences

- Closing the WatchStream tab ends the session. This is visible and predictable for users.
- Content scripts, if any are added (sync mode, which is future work in
  ADR-0001), talk to the session tab through extension messaging.
- M3 has to verify that tab capture can feed a peer connection held by the session tab. If it
  cannot, the stream mode needs its own decision.
- Every participant can see the others' names, but never their network addresses: viewers only
  connect to the host.
- Codes contain the sender's IP addresses (ICE candidates). They should only be shared with the
  people being invited.

## Rejected alternatives

- **Popup UI:** closes while the user copies a code into a messenger.
- **Offscreen document now:** Chromium-only and invisible; can still be added later if a
  background session becomes a requirement.
- **Trickle ICE:** would need a channel for candidates after the first code, which manual
  signaling does not have.
