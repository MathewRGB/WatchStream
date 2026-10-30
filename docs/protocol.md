# Protocol

What travels between host and viewers: the two handshake codes, and the messages on the data
channel. The reasons behind it are in [architecture.md](architecture.md). The code is in
`src/core/handshake/` and `src/core/protocol/messages.ts`.

## Handshake codes

Format version 2.

| Code       | Text             | Carries                                                    |
| ---------- | ---------------- | ---------------------------------------------------------- |
| Invitation | `WSI2.<payload>` | invite id, the host's name, the host's session offer       |
| Reply      | `WSR2.<payload>` | the same invite id, the viewer's name, the viewer's answer |

`payload` is `base64url(body)`. The first byte of the body says how the rest is written:

- **0, compact** (every code the browsers make today): the invite id as 6 bytes (it is 8
  base64url characters), the name as a one-byte length and UTF-8 text, and the packed session
  description, in this order:
  - one byte for the DTLS role (`actpass`, `active`, `passive`);
  - 32 bytes, the SHA-256 fingerprint of the certificate;
  - the ICE user name and the ICE password, each a one-byte length, then 6 bits for each
    character (they are made of `A-Za-z0-9+/`);
  - one byte for the number of candidates (at most 16), then for each one byte (bits 0-1 the type:
    host, srflx, prflx, relay; bits 2-3 the address: IPv4, IPv6 or an mDNS name), 4 or 16 bytes
    of address, and 2 bytes of port.
- **1, full**: `deflate-raw` of a JSON object `{ kind, inviteId, hostName | viewerName, sdp }` with
  the whole description, as version 1 wrote it. Used when the description cannot be packed (see
  below) and when the invite id is not 8 characters long.

A packed description is written out again when the code is read, in the shape Chromium makes:
one `m=application` section for the data channel (`mid` 0, SCTP port 5000, message size 262 144),
every candidate as UDP component 1 with a priority made from its type and its place in the list
(hosts first), reflexive and relayed ones with the related address `0.0.0.0:0`, and
`a=end-of-candidates` (the codes carry every candidate there will be: non-trickle). Only a
description of exactly that shape is packed. Anything else (another section, an attribute the
packer does not know, a fingerprint that is not SHA-256, a candidate with a host name, a
message size below 65 536) is sent in full, so nothing is lost silently. The one thing left out on
purpose is Firefox's active TCP candidates: they name no port to reach and no browser offers the
passive half, so they never form a pair.

- Decoding removes all whitespace first (messengers wrap long text), then checks the prefix and
  the version, and reads the body: a compact body must be read exactly to its end; a full body is
  capped at 32 kB once inflated. Every field is checked: `inviteId` matches
  `[A-Za-z0-9_-]{8,64}`, names are 1-40 characters, `sdp` starts with `v=0` and is at most 20 000
  characters. Anything else is "damaged".
- **Any change to the format increments the version.** A code of another version is refused with
  a message that both sides need the same WatchStream version.
- A usual code is 150 to 200 characters (the fingerprint alone is 43; with public addresses found
  through STUN a Chromium code measured 187 and a Firefox code 199), where version 1 needed 830 to
  880 for the same.

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

### Reception reports

| Direction     | Message                              |
| ------------- | ------------------------------------ |
| viewer → host | `{ type: "receive-report", report }` |

- Sent about every two seconds while a viewer shows a picture, and not before the second reading
  (a report is the change between two readings). `report` has the fields `loss` (0 to 1), `fps`,
  `kbps`, `jitterMs`, `bufferMs`, `freezes`, `freezeMs`, `height` and `rttMs`. Each is a number
  from 0 to 1 000 000, or `null` when the browser does not report it; a missing field reads as
  `null`, extra fields are cut, and a report with any other value is dropped as a whole.
- The host keeps the latest report of each viewer while a picture goes out, shows it in the People
  tab and forgets it when the picture ends or the viewer leaves. It changes nothing by itself.
- The numbers contain no address or name; they are the viewer's counters, summarised.

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
