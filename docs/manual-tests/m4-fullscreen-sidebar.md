# Manual test: the sidebar in full screen (M4)

The automated tests drive a real mouse and keyboard in Chromium (unit tests, and Playwright end to
end). Firefox is covered by hand: its extension cannot be loaded by the test tool. The tests cannot
judge how it feels: how wide the edge strip is, whether 400 ms before it slides out is right, or
whether it covers the picture where you look. They also cannot test a touch screen or a second
monitor. This guide covers those.

## What you need

- A host and a viewer connected as in `m3-stream-mode.md`, with something shared (a moving
  picture helps).
- Chrome, Brave and Firefox, each at least once as the browser that goes into full screen.

## 1. Into full screen

1. On the viewer (and later on the host) choose the full-screen button at the top right of the
   stage.
2. Expect: the stage fills the screen, the header is gone, the sidebar is not visible, and a small
   handle sits at the middle of the right edge.
3. Press `Esc`. Expect: the normal window is back, with the sidebar in its column where it was.

## 2. The edge

1. In full screen, move the pointer to the right edge of the screen and let it touch it.
2. Expect: the sidebar slides in over the picture. The picture does not move or shrink.
3. Move the pointer into the sidebar and use it: switch tabs, read the chat, the people list. On
   the host the Invite and Settings tabs work too.
4. Move the pointer away. Expect: the sidebar slides out shortly after (about half a second).
5. Move the pointer across the right edge quickly, and slip off the sidebar and back. Expect: it
   does not flicker shut while you are still near it.

Judge, and write down if it needs changing: is the strip easy enough to hit and hard enough to
trigger by accident? Is the delay too short or too long? Does the sidebar cover something you need?

## 3. Typing

1. Open the sidebar, click into the chat field and type half a message.
2. Move the pointer far away and wait a few seconds. Expect: the sidebar stays.
3. Click on the picture. Expect: it closes. Touch the edge again. Expect: your half-typed text is
   still in the field.
4. Send the message. Expect: the other side receives it.

## 4. Without the edge

1. In full screen, press `S`. Expect: the sidebar opens and stays open with no pointer near it.
   Press `S` again. Expect: it closes.
2. Type the letter `s` in the chat field. Expect: it is typed, and the sidebar does not close.
3. With the sidebar closed, press `Tab` until the handle has focus, then `Enter`. Expect: the
   sidebar opens.
4. Click the handle with the mouse. Expect: the same.

## 5. A second monitor on the right (if you have one)

1. Put the browser on the left monitor and go into full screen.
2. Expect: moving right takes the pointer onto the other monitor, so the edge cannot be touched.
   The handle and `S` still work.

## 6. A touch screen (if you have one)

1. In full screen, tap the handle. Expect: the sidebar opens and does not close when the finger
   lifts.
2. Tap the picture. Expect: it closes.

## 7. The shared picture in full screen

1. While the host shares a window or the whole screen, go into full screen on the host. Note
   whether the viewers see anything odd (sharing a window that is itself in full screen).
2. Tab sharing is the case this was built for; it should show no sign of the sidebar to viewers.

## 8. Only the picture

1. In full screen, leave the pointer still and do not touch anything for about three seconds.
2. Expect: the full-screen button, the Share or Stop sharing button, the sound controls, the name
   of who shares and the handle fade out, and so does the mouse pointer.
3. Move the pointer a little. Expect: everything is back at once. Wait again: it goes again.
4. Leave it hidden and press a key (not `S`). Expect: the controls come back.
5. Open the sidebar and rest the pointer on it without moving. Expect: nothing fades, even after
   ten seconds. Move the pointer off it. Expect: after a moment everything fades, the sidebar too.
6. Let it fade with the pointer over the picture. Expect: the pointer really is gone, not just
   invisible: nothing flickers back by itself while you do not touch the mouse.
7. Watch for the opposite: does the pointer or a control come back without you touching anything?
   (Some systems send a mouse move when the picture under the pointer changes.)
8. Leave full screen. Expect: nothing fades in the normal window.

Judge: is three seconds right? Does fading feel smooth and not abrupt?

## 9. A message in full screen

1. On the viewer, go into full screen with the sidebar closed, and let everything fade (section 8).
2. Send a chat message from the other side.
3. Expect: a small round chat symbol appears near the right edge, stays about one second and goes.
   The controls and the pointer do not come back, and the picture does not move.
4. Send a few messages in a row. Expect: the symbol stays while they keep coming and goes a second
   after the last one.
5. Open the sidebar (edge or `S`) and send another message. Expect: no symbol, the message is
   right there in the chat.
6. Write a message yourself from the sidebar. Expect: no symbol for your own message.
7. Leave full screen and send a message. Expect: no symbol in the normal window.

Judge: is the symbol quiet enough, and noticeable enough on a bright picture? Is one second right?

## Record the result

| Browser | Edge | Delay feels right | Typing keeps it open | `S` | Handle | Fades when idle | Message symbol | Notes |
| ------- | ---- | ----------------- | -------------------- | --- | ------ | --------------- | -------------- | ----- |
| Chrome  |      |                   |                      |     |        |                 |                |       |
| Brave   |      |                   |                      |     |        |                 |                |       |
| Firefox |      |                   |                      |     |        |                 |                |       |
