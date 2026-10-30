# Manual test: a viewer who shares (M6)

The automated tests cover the messages, the forwarding with several viewers, and a viewer sharing
to the host and four others in the real extension and in Chromium and Firefox, with a moving
picture and a tone in place of the browser's picker. They cannot press a real picker, hear real
sound or judge how the delay feels. This guide covers those. Read [architecture.md, section 8](../architecture.md#8-viewers-who-share) first.

## What you need

- A host and at least two viewers (other devices, other browsers, other profiles).
- A mix of Chrome, Brave and Firefox. Try each browser as the sharing viewer at least once.
- A tab with a video and sound for the viewer to share.

## 1. Ask, allow, watch

1. Viewer A: choose **Share** on the stage and pick a tab (in Chrome and Brave tick "Also share tab
   audio"). Expect: the stage says "Waiting for <host> to allow it" and there is a **Cancel**.
2. Host: expect a line on the stage "A wants to share" with **Allow** and **Decline**, and in the
   People tab a "wants to share" mark on A with the same two buttons.
3. Host: choose **Allow**. Expect: the picture and sound of A appear on the host's stage with
   "A is sharing" and a volume slider; on the other viewers the same; A sees "You are sharing"
   and hears nothing from its own picture. The People tab marks A as **sharing**.
4. Judge the delay, the sound level and whether the picture is smooth.

## 2. Say no, cancel, busy

1. Viewer B: ask while nothing is shared; the host chooses **Decline**. Expect: B sees "<host> did
   not allow sharing." and the browser's sharing indicator goes out.
2. Viewer B: ask again, then choose **Cancel** before the host answers. Expect: the request
   disappears from the host.
3. While A shares, B chooses **Share**. Expect at once: "Something is already being shared." and
   the browser's sharing indicator goes out.
4. Two viewers ask at the same time. The host allows one. Expect: the other is told "already
   being shared".

## 3. Stopping

1. A: choose **Stop sharing**. Expect: the stage is empty for everyone and A's browser indicator is
   gone. A can share again at once, and the picture comes back for everyone (do it twice).
2. A: use the browser's own "Stop sharing" button instead. Expect: the same.
3. Host: while A shares, choose **Stop A's share**. Expect: A sees "<host> ended your share."; the
   others see an empty stage.
4. Host: while A shares, choose **Share** and pick a tab. Expect: A is told the share ended, the
   others see the host's picture.
5. A closes the tab while sharing. Expect: the stage is empty for the others, and the host can
   allow someone else.
6. Host: remove A while A shares. Expect: A is told it was removed, the others see an empty stage.

## 4. Late joiners and quality

1. While A shares, invite a new viewer. Expect: the picture is there as soon as they are connected.
2. With six or more viewers, watch the host's line next to the buttons. Expect: the same text as
   for the host's own share ("720p · 30 fps · X of 3.5 Mbit/s · N viewers"), and the picture gets lighter when the host's
   computer cannot keep up. The sharing viewer is not counted as slow.
3. Change the picture quality in **Settings** during A's share. Expect: it applies to the others at
   once.

## 5. Privacy

Open the People tab and the technical details on a viewer. Expect: nothing shows another viewer's
address; viewers still only connect to the host.
