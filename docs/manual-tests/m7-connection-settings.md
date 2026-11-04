# Manual test: settings for a weak connection (M7)

The automated tests cover what the settings do to the connection (the codec that is really sent,
the weak-connection mode on the sender, the target on the receiver, the length of the sound delay
and how it changes without a scratch), the tracker that measures the picture's buffer, the 500
message chat and the limits on what a viewer may send. They cannot hear a scratch, judge whether
sound and picture are in step, or know what a real long route does. This guide covers those. Read
[architecture.md, section 6](../architecture.md#6-capture-sound-and-quality) first.

## What you need

- A host and one viewer on **different networks**, ideally a long route (another country, a
  mobile connection). A viewer on the same network shows that nothing breaks, not that anything
  helps.
- A tab with a film or a sports match, with sound and fast motion.
- Chrome or Brave on the host; the viewer in Chrome, Brave and Firefox, one after the other.
- The browser console of both tabs open (F12), filtered for `WatchP2PStream`.

## 1. Weak connection (host)

1. Host: share the tab (Weak connection starts at **Steady sharpness**, the default). Open **Settings → Weak connection** and write down how the
   picture looks on the viewer.
2. Choose **Smooth motion**. Expect: nothing breaks and the viewer's picture goes on. On a bad
   route the picture is smaller or blurrier but keeps moving.
3. Choose **Steady sharpness**. Expect: the picture restarts for a moment on the viewer (the
   connection negotiates again) and then plays. On a good line it stays sharp and the frame rate
   drops when the line is short; on a bad line it may stutter, and the description of the choice
   says so.
4. Go back to **Balanced**. Expect: the same restart, and the picture plays.
5. In the console, find the `link reading` lines (every ten seconds). Expect numbers and no
   addresses: `capKbps`, `estimateKbps`, `sentKbps`, `lossPercent`, `rttMs`, `path` and so on.

## 2. Video codec (host, Chrome or Brave)

1. Open **Settings → Video codec**. Expect: Automatic and the codecs the browser knows. In
   Firefox the section is missing, because Firefox takes no preference.
2. Choose **VP9**, then **H.264**, then **Automatic**, while sharing. Expect: each change restarts
   the picture for a moment on the viewer; it never stays black. The `sharing started` and
   `automatic codec` lines in the log say what was chosen.

## 3. Smoothing buffer (viewer)

1. Viewer: open **Settings → Smoothing buffer**. Expect: Standard is chosen.
2. Choose **Short (1 s)**. Expect: the picture is about a second later than the host's. The sound
   must be late by the same time: watch a clap, a goal, a speaking mouth. Expect no sound before
   its picture.
3. Choose **Medium (2 s)**. Expect: two seconds, still in step. While it changes, listen: there
   must be no scratching, no pitch jump and no sound running backwards. A big change is a short
   fade out and in, a small one a slow glide.
4. Leave it on for ten minutes on a long route. Expect: the sound follows the real buffer of the
   picture (it can be larger than 2 s); they must not drift apart.
5. Go back to **Standard**. Expect: the picture catches up and the sound stays in step.
6. Close the page and open it again, join a session. Expect: your choice is still set, and it is
   applied before the picture arrives.
7. Repeat in Firefox. Expect: the same; the buffer works there too.

## 4. Chat limits

1. Send a few messages from the host and a viewer. Expect: all arrive, in one order.
2. Viewer: paste a line and send it twenty times as fast as you can (hold Enter). Expect: about ten
   arrive for everyone, the rest are dropped; the host's log says "dropped a chat message".
   Everyone else can still write at once.
3. Optional, tedious: on the host (which is not limited) send more than 500 messages by holding
   Enter in the chat field. Expect: the list keeps the latest 500, scrolls to the newest message on
   each one, and in full screen the symbol for a new message still shows for each one from others.
   The unit tests (`use-chat-messages.test.tsx`) cover this without the typing.

## 5. If you ever see the error page

1. It cannot be provoked on purpose. If it appears, expect "Something went wrong",
   the technical details without addresses, and that the other side sees the person leave
   (the host's People tab shows one viewer fewer) because the page ended the connections.
