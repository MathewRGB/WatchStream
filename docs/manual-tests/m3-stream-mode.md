# Manual test: stream mode (M3)

Automated tests cover the connection, the messages and the extension in Chromium and Firefox with a
fake picker. They cannot cover the browser's real picker, real tab audio, how the picture looks or
a connection between different networks. This guide covers those.

## What you need

- Two browsers on two devices (or two profiles on one device for a first run). Chrome, Brave and
  Firefox should each appear at least once, as host and as viewer.
- A tab with a video that has sound, for example a YouTube video.
- A way to exchange text, such as a messenger.
- Each browser has the extension loaded (`README.md`, "Development").

## 1. Connect

1. Both: click the WatchStream icon. The WatchStream page opens in a tab.
2. Host: enter a name, choose **Host a session**, open the **Invite** tab, choose **Invite a
   viewer** and send the code to the viewer.
3. Viewer: enter a name, choose **Join a session**, paste the code, choose **Join**.
4. Viewer: paste the reply code (already on the clipboard; a notice says so) into the chat with
   the host.
5. Host: paste it into the invitation and choose **Connect**.

Expect: both sides show **People** with both names; the viewer reads "Connected to <host>".
Send a chat message each way; both arrive.

## 2. Share a tab with sound

1. Host: choose **Share**, pick the video tab in the browser's picker. In Chrome and Brave tick
   "Also share tab audio".
2. Expect on the viewer: the picture appears on the stage with a label saying who is sharing, and
   you hear the sound. The host sees a silent preview.
3. Play, pause and seek in the shared tab. Expect the viewer to follow within a moment (stream
   latency is roughly 200 to 500 ms).
4. Viewer: use the mute button and the volume slider. Expect: moving the slider while muted turns
   the sound back on. Reload the page and join again: the volume is remembered, muting is not.
5. Host: choose **Stop sharing**. Expect the stage on the viewer to empty. Share again: it works
   again.

Firefox as host has no tab audio; expect a note on the viewer that the share started without
sound. Sharing a whole screen or window works the same way.

## 3. Quality

1. Host: open **Settings** and choose **Saver**, then **Balanced**, then **Sharp** while sharing a
   moving picture.
2. Expect: the change applies at once; Saver is visibly softer than Sharp. Note the upload of the
   host if you can see it (about 6 Mbit/s per viewer at Sharp).

## 4. Late joiner and several viewers

1. While the host shares, invite a further viewer (a session holds up to twelve). Expect them to see the share as
   soon as they are connected.
2. Close one viewer's WatchStream tab. Expect the others to keep watching and the host's People
   list to drop that viewer.

## 5. The session ends

- Host: choose **End session**. Expect every viewer to read "The session has ended." with
  **Technical details**.
- Closing the host's WatchStream tab does the same.

## 6. When it does not connect

If the viewer waits and the host's connect step fails, the page shows **Technical details**.
Choose **Copy technical details** on both sides and keep them: the connection state, what each
code offered (local, STUN, relay, IPv6 by count) and the latest log lines. The warning next to a
code ("no public address") points to a VPN, a firewall or a blocked STUN server.

## Record the result

| Host \ Viewer | Chrome | Brave | Firefox |
| ------------- | ------ | ----- | ------- |
| Chrome        |        |       |         |
| Brave         |        |       |         |
| Firefox       |        |       |         |

Write down for each pair: connected, picture, sound, quality presets. Run every pair first in one
network, then across two different networks (phone hotspot or another person's connection).
