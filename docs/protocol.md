# Protocol

What travels between host and viewers: the two handshake codes, and the messages on the data
channel. The reasons behind it are in [architecture.md](architecture.md). The code is in
`src/core/handshake/` and `src/core/protocol/messages.ts`.

## Handshake codes

Format version 1.

| Code       | Text             | JSON inside                                       |
| ---------- | ---------------- | ------------------------------------------------- |
| Invitation | `WSI1.<payload>` | `{ kind: "invitation", inviteId, hostName, sdp }` |
| Reply      | `WSR1.<payload>` | `{ kind: "reply", inviteId, viewerName, sdp }`    |

- `payload` is `base64url(deflate-raw(JSON))`.
- `sdp` is a complete session description with all ICE candidates (non-trickle).
- Decoding removes all whitespace first (messengers wrap long text), then checks the prefix and
  the version, caps the decompressed size at 32 kB and checks every field: `inviteId` matches
  `[A-Za-z0-9_-]{8,64}`, names are 1-40 characters, `sdp` starts with `v=0` and is at most 20 000
  characters. Anything else is "damaged".
- **Any change to the format increments the version.** A code of another version is refused with
  a message that both sides need the same WatchStream version.

## Data channel

One reliable, ordered data channel per viewer, labelled `watchstream`. Every message is a JSON
object with a `type`. A message that does not parse, has an unknown `type` or a field that does
not check out is dropped without a reply; extra fields are dropped. This is what lets a peer
ignore messages that a newer version added.

### Session and chat

| Direction     | Message                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| host → viewer | `{ type: "welcome", participantId }`, right after the link opens          |
| host → viewer | `{ type: "roster", participants: [{ id, name, role }] }`, on every change |
| viewer → host | `{ type: "chat", text }`                                                  |
| host → viewer | `{ type: "chat", message: { id, senderId, senderName, text, sentAt } }`   |
| host → viewer | `{ type: "removed" }`; the host closes the link 300 ms later              |

- `role` is `host` or `viewer`. The host assigns every id and time stamp.
- Chat text is trimmed and at most 1000 characters. The host relays each message to every viewer,
  the sender included, so everyone sees one order.
- Names come from the codes; there is no separate hello.

### Media

| Direction     | Message                                   |
| ------------- | ----------------------------------------- |
| host → viewer | `{ type: "media-started", sourceId }`     |
| host → viewer | `{ type: "media-stopped", sourceId }`     |
| either way    | `{ type: "media-offer", sourceId, sdp }`  |
| either way    | `{ type: "media-answer", sourceId, sdp }` |

- In `media-started` and `media-stopped`, `sourceId` is the participant whose picture it is (the
  host, or the viewer whose share the host passes on). A viewer shows media only between the two.
- In `media-offer` and `media-answer`, `sourceId` is the participant who made the **offer**. So a
  viewer's answer to the host names the host, and a viewer's own offer names the viewer. The host
  drops an answer that does not name it and an offer that does not name its sender.
- Negotiations run on the link that is already open ("perfect negotiation": the host side is
  impolite, the viewer side polite).

### Viewer shares

| Direction     | Message                                                  |
| ------------- | -------------------------------------------------------- |
| viewer → host | `{ type: "share-request" }`                              |
| viewer → host | `{ type: "share-stop" }`, also to cancel a request       |
| host → viewer | `{ type: "share-granted" }`                              |
| host → viewer | `{ type: "share-denied", reason }`: `declined` or `busy` |
| host → viewer | `{ type: "share-revoked" }`                              |

After `share-granted` the viewer adds its tracks and sends a `media-offer`; the host answers and
passes the picture on with `media-started` naming the viewer. The host answers every viewer's
offer, also after a share ended, so the offer that removes the tracks completes; it only passes on
the picture of the viewer it allowed.

## Session rules

- A session holds at most 12 viewers. An invitation holds a place from the moment it is asked for
  until it is used or cancelled.
- After the host applies a reply, the link has to open within 20 seconds; otherwise the invitation
  is used up and reported as a failed direct connection.
- One picture is on the stage at a time.
