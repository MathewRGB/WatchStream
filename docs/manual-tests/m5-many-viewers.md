# Manual test: many viewers (M5)

The automated tests cover twelve real connections, the load monitor with simulated counters, and a
host with five viewers in the real extension. They cannot say how a real host's computer and
connection behave with many people, how the quality changes feel, or whether the host's hints are
clear. This guide covers those. Read [architecture.md, section 7](../architecture.md#7-up-to-twelve-viewers-and-a-load-monitor) first for what is meant to happen.

## What you need

- A host computer, and as many viewers as you can get: other devices, other browsers on the same
  computer, and other profiles or private windows all count. Six is a good start, twelve the limit.
- Chrome, Brave and Firefox, each at least once as the host.
- Something with fast movement to share (a sports clip, a game), and for a second round something
  still (a document).

## 1. Invite many at once

1. Host: open the **Invite** tab, set the number next to **Invite a viewer** to 5 (the field shows
   the number that counts when you leave it), and choose the button.
2. Expect: five cards, **Invitation 1** to **Invitation 5**, each with its own code. **Places
   left** drops by five.
3. Send the codes to five viewers, one each. Paste every reply into the card of that invitation and
   choose **Connect**. Expect: a card disappears when its person has joined, the others keep their
   numbers, and **People** lists everybody.
4. Type a number higher than the places left. Expect: it is cut down to the places left when you
   leave the field.
5. Fill all twelve places. Expect: "The session is full." and the button is off.

## 2. Share with many

1. Host: choose **Share** and pick a tab with fast movement. Keep the quality on Balanced.
2. Expect: every viewer sees the picture within a few seconds, and a line next to **Stop sharing**
   says "720p · N viewers".
3. Add viewers up to eight or more while sharing. Expect: each new viewer sees the picture when
   they are connected; the number in the line follows.
4. On a viewer, note how smooth it is. On the host, look at the line.

## 3. The host cannot keep up

Do this with enough viewers that your computer is under load (eight or more at Balanced or Sharp;
fewer on a weak computer). You can also run `npm run measure:load` first to see what your computer
does (see the README, "Development").

1. Host: choose **Sharp** in **Settings** and share fast movement.
2. Wait a minute. Expect, once the computer cannot keep up: the line turns red and says "720p ·
   N viewers: your computer cannot keep up. Some viewers may get the picture late." (or "your
   connection cannot keep up" when the upload is the limit). The quality stays at Sharp.
3. Look at **People**. Expect: a viewer on a poor connection carries a **slow** mark; the others
   do not, and one slow viewer alone does not make the line appear for everybody.
4. Remove viewers until the computer copes. Expect: after a few readings the line is grey again,
   at the same quality. Nothing changes by itself.
5. Choose another quality in **Settings** while the line is red. Expect: the quality applies at
   once, and the monitor starts over.

Judge: does the line appear soon enough, and not too eagerly? Is the text on the line clear enough
for the host to lower the quality by hand?

## 4. A still picture is not a problem

1. Host: share a document or a still page with many viewers.
2. Expect: the line stays at what you chose, and nobody is marked slow, even though few frames are
   sent.

## 5. Remove a viewer

1. Host: in **People**, choose the small button on a viewer. Expect: a question with **Remove** and
   **Cancel**. Choose **Cancel**: nothing happens.
2. Choose the button again and **Remove**. Expect: the viewer disappears from the list on every
   screen at once, **Places left** goes up by one, and the others keep watching.
3. On the removed viewer: "The host removed you from the session." and a note that they can join
   again with a new invitation. No technical details.
4. Invite that person again with a new code. Expect: they join and see the picture.

## 6. Late and leaving viewers

1. While sharing with many viewers, close the WatchStream tab of two of them. Expect: the others
   keep watching, the list and **Places left** follow, and the line shows the new number.
2. Join again with a new invitation while sharing. Expect: the picture arrives, at the quality that
   is chosen in Settings.

## Record the result

| Host browser | Viewers | Chosen quality | What the line said after a minute | Slow marks | Notes |
| ------------ | ------- | -------------- | --------------------------------- | ---------- | ----- |
| Chrome       |         |                |                                   |            |       |
| Brave        |         |                |                                   |            |       |
| Firefox      |         |                |                                   |            |       |

Write down your computer (cores, whether it has a graphics chip that encodes video) and your upload
speed: the load monitor reacts to them, and they are what makes the numbers differ.
