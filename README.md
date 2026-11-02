# WatchP2PStream

Watch streams together, browser to browser, without your own media server.

(The repository is still called `WatchStream`; the product is WatchP2PStream.)

WatchP2PStream is a browser extension for Chrome, Brave and Firefox. A host invites up to twelve
viewers, and everyone watches the same thing: YouTube or any other video that plays in the host's
browser.

## Why WatchP2PStream

- **No server at all.** No WatchP2PStream server carries the picture, the sound or the chat, and
  none introduces the participants to each other: even the connection setup travels as codes
  through a messenger you already use. Nothing to run, nothing to sign up for, no data collected.
- **No account, no subscription for viewers.** Only the host needs access to the content. A viewer
  needs the extension and a code, nothing else.
- **Everyone sees exactly the same picture.** The host's picture and sound are sent, not a playback
  position, so nobody drifts out of step, and different regions or versions of a title do not
  matter.
- **Works with any video the host can play** that has no copy protection, including sites that
  watch-together tools cannot steer, and with a whole window or screen.
- **The host is in control.** Up to twelve viewers, one invitation per person, removing a viewer,
  a quality choice from Minimal to 4K, and a load monitor that says when the host's computer or
  connection cannot keep up. A viewer can share too, once the host allows it.
- **Private by design.** Every connection is encrypted between two browsers. The only outside party
  is a public STUN server that sees participants' public IP addresses (see [Privacy](#privacy)).

## How it works

The host shares a tab, window or screen, and the viewers see and hear it (stream mode). Only the
host needs access to the content; the picture is re-encoded at near-transparent quality.

Services with copy protection (Netflix, Disney+, Prime Video, Max) are not supported: their
picture turns black when it is shared, and WatchP2PStream does not circumvent that. Syncing everyone's
own player for such services is future work, see
[future work](docs/future-work.md#sync-mode-for-protected-sites).

- **Direct connection:** participants connect to the host directly over WebRTC. Video, audio and
  control data are encrypted on each connection and never pass through a WatchP2PStream server. A
  viewer's share reaches the other viewers through the host's browser.
- **Invitation by code:** the host sends an invitation code through any messenger, and the viewer
  sends a reply code back.
- **The host decides:** who is in the session and what is on the stage. A viewer can share too,
  once the host allows it.

## Using it

1. Click the WatchP2PStream icon in the toolbar. The WatchP2PStream page opens in a tab.
2. **Host:** enter your name, choose **Host a session**, open the **Invite** tab in the sidebar and
   choose **Invite a viewer**. Send the invitation code to one person via any messenger. To invite
   several people, set the number next to the button first; each invitation is numbered and is for
   one person.
3. **Viewer:** enter your name, choose **Join a session**, paste the invitation code and choose
   **Join**. The reply code is copied to your clipboard automatically and a notice says so; paste
   it into your chat with the host.
4. **Host:** paste the reply code into the invitation and choose **Connect**.
5. Once connected, the sidebar shows **People** and **Chat**.
6. **Host:** choose **Share** on the stage and pick a tab, window or screen in the browser's own
   picker. In Chrome and Brave, tick "Also share tab audio" to send the sound as well. Viewers see
   it on their stage, with a mute button and a volume slider; **Stop sharing** (or the browser's own stop button) ends it. The host can
   choose the picture quality in the **Settings** tab; that is what is sent. Four steps from
   Minimal to Sharp cover most cases; **Custom** sets the resolution (240p to 2160p), the frame
   rate (10 to 60 fps), the picture bitrate and the sound bitrate one by one. Each group of
   settings opens and closes on its own. A
   line on the stage says what is sent and to how many viewers ("720p · 30 fps · 1.8 of 3.5 Mbit/s · 8 viewers": the bitrate each viewer really gets of the most the quality allows). With many
   viewers, if your computer or connection cannot keep up, the line says so; the quality stays as
   you chose it, so you can lower it yourself. The **People** tab marks a viewer who is not
   keeping up; viewers see none of this. The host can remove a viewer there, after one question;
   that viewer can come back with a new invitation.
7. **Viewer:** to share something yourself, choose **Share** on the stage and pick a tab, window or
   screen. The host sees "<name> wants to share" on the stage and in the People tab and decides
   with **Allow** or **Decline**. Once allowed, the host and all other viewers see your picture,
   with your sound. You can stop at any time; the host can end it too, and starting a share of
   their own takes the stage back. One picture is on the stage at a time.

The window is one screen: the stage on the left (it has a full-screen button) and a sidebar with
tabs on the right, which you can hide with the button in the header.

In full screen the sidebar is hidden. Move the pointer to the right edge of the screen and it
slides in over the picture; it slides out again a moment after the pointer left. It stays open
while you are typing in it, and a click on the picture closes it. If the pointer cannot reach the
edge (touch screen, a second monitor on the right), use the small handle at the right edge, or
press `S` to show and hide the sidebar.

In full screen, three seconds without moving the pointer, pressing a key, clicking or scrolling
leave only the picture: all controls fade out and the mouse pointer disappears. Moving the pointer
brings them back. The sidebar stays while the pointer rests on it.

A message from somebody else shows a small chat symbol near the right edge for one second, also
when everything else has faded. It does not appear while the sidebar is open.

Each invitation is for one person; a session holds up to twelve viewers. Keep the WatchP2PStream tab
open: closing it ends the session.

## Limitations

- Services with copy protection (Netflix, Disney+, etc.) cannot be watched together: shared, their
  picture is black. WatchP2PStream does not circumvent copy protection.
- In stream mode the host sends a separate copy to each viewer, so its computer and upload limit
  the quality: Sharp needs about 6 Mbit/s of upload and one encode per viewer. A session holds up
  to twelve viewers; with many of them some may get the picture late. The
  sound adds 32 to 320 kbit/s, depending on the quality.
- Firefox cannot share the sound of a tab itself. WatchP2PStream takes it from the video in the tab
  instead: when you choose **Share**, it asks once for the tab list and access to your sites, then
  looks for the tab that is playing sound and adds that sound to your share. If it cannot tell
  which tab (nothing plays yet, or several do), choose the tab under **Settings → Sound from a
  tab**. The sound can be a fraction of a second behind the picture, and protected streams and
  players that process their own sound do not work.
- The sound a viewer hears is the sound as the host's player delivers it: if the host lowers the
  player's volume, the viewers get less. Letting viewers hear it at full level is
  [future work](docs/future-work.md#sound-level-independent-of-the-hosts-volume).
- Behind some routers (e.g. carrier-grade NAT) no direct connection is possible without an
  additional relay server (TURN).
- Firefox 140 or newer is required.

## When something goes wrong

- **Connection errors** come with a **Technical details** section. It shows the state of the
  connection, what each side's code offered (local, STUN, relay, IPv6 addresses by count) and the
  latest log lines. **Copy technical details** puts it on the clipboard for a bug report.
- **The log** is also in the browser console of the WatchP2PStream tab (press F12, then Console, and
  filter for `WatchP2PStream`). It records connection states, how a link came up (`Path: srflx/srflx`
  means a direct connection through STUN, `relay` means through a relay), timeouts, dropped
  messages and failed sharing steps.
- **What is never logged:** invitation and reply codes, session descriptions, IP addresses, names
  and chat text. The log only carries states, counts and error names. It stays in memory and in
  the console; nothing is sent anywhere.
- If the page itself fails, an error page with the same details replaces the blank screen.
- A code with no public address shows a warning next to it. It is the most common reason why two
  people on different networks cannot connect: a VPN, a firewall or a blocked STUN server.

## Privacy

- WatchP2PStream has no server and collects no data.
- A public STUN server (`stun.l.google.com`) is used for address discovery. It sees the
  participants' public IP addresses, but no content.
- Invitation and reply codes contain your IP addresses. Share them only with the people you
  invite.

The full privacy policy is in [PRIVACY.md](PRIVACY.md).

## Development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev            # Chrome with live reload
npm run dev:firefox    # Firefox with live reload
npm run build          # .output/chrome-mv3 (Chrome and Brave)
npm run build:firefox  # .output/firefox-mv3
```

To load a build manually:

- **Chrome / Brave:** open `chrome://extensions` (`brave://extensions`), enable developer mode,
  choose **Load unpacked** and select `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**
  and select `.output/firefox-mv3/manifest.json`.

### Tests and checks

| Command                    | What it runs                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm test`                 | Unit and component tests (Vitest, Testing Library, happy-dom)          |
| `npm run test:integration` | WebRTC integration tests in real Chromium and Firefox (Vitest browser) |
| `npm run test:e2e`         | Builds both targets, then Playwright end-to-end tests                  |
| `npm run check`            | Typecheck, lint, format check, unit and integration tests              |
| `npm run lint:firefox`     | Validates the Firefox package with Mozilla's `web-ext lint`            |
| `npm run measure:load`     | Measures what a host costs per viewer (see below)                      |

The browser tests need Playwright's browsers once: `npx playwright install chromium firefox`.

`npm run measure:load` is not a test. It sends one animated 1080p picture from one Chromium to N
local connections in another, at the quality steps of the app, and prints a table: Mbit/s and frames
per second each viewer gets, and how much encoder time that takes. Use it to see what your computer
carries; on Linux `-- --host-cores 0-3 --viewer-cores 4-13` pins the host browser to a few cores,
and `-- --run balanced:6 --run saver:12` picks the runs (`-- --help` lists everything). The numbers
in [architecture.md](docs/architecture.md#7-up-to-twelve-viewers-and-a-load-monitor) come from it. Software encoding in a headless browser and a demanding picture make them
pessimistic: they show the shape, not what your host will do.

`npm run lint:firefox` reports two `innerHTML` warnings. They come from React DOM inside the
bundle, not from this repository: ESLint forbids `innerHTML` and `dangerouslySetInnerHTML` in our
own code, because chat text and names come from other people.

### Tech stack

[WXT](https://wxt.dev) (Manifest V3, one codebase for Chrome, Brave and Firefox), TypeScript,
React 19, Tailwind CSS 4 and [shadcn/ui](https://ui.shadcn.com). Connections use WebRTC. See
[architecture.md](docs/architecture.md#10-code-and-stack) for the reasons and the rules that keep
the stack tidy.

### Project layout

```
src/core/          connection, handshake codes, protocol and sessions (no React, no extension APIs)
src/background/    toolbar icon handling (no React)
src/entrypoints/   thin WXT entry points: background script, session page, tab sound script
src/features/      product UI, one folder per feature (session: app shell, stage, sidebar tabs,
                   start, host and viewer screens, chat)
src/components/ui/ shadcn/ui components
src/hooks/         React hooks that bind core objects to components
src/lib/           small helpers such as cn()
src/styles/        Tailwind import and design tokens (globals.css)
tests/             integration tests in real browsers
e2e/               Playwright end-to-end tests
docs/              architecture, protocol, future work, manual test guides
```

Add a shadcn/ui component with `npx shadcn@latest add <name>`. It lands in `src/components/ui/`.
The CLI currently imports `cn` from an unrelated npm package named `cn` and adds it to
`package.json`. Point the import at `@/lib/utils` and run `npm uninstall cn` afterwards.

## Roadmap

- [x] **M1:** connection setup by code, chat — tested automatically in Chromium and Firefox and
      manually by the maintainer in Chrome, Brave and Firefox, and between two different public IP
      addresses (2026-10-28, one side through a VPN)
- [x] **M2:** app shell: one window without page scrolling, stage with full-screen mode, sidebar
      with tabs, reply code copied automatically
- [x] **M3:** stream mode: share a tab, window or screen, sound in stereo, quality presets,
      volume control, technical details for connection problems
- [x] **M4:** the sidebar in full screen: it slides in at the right edge, only the picture shows
      when idle, a quiet symbol for a message
- [x] **M5:** up to 12 viewers, a load monitor tells the host when it cannot keep up,
      several invitations at once, removing a viewer
- [x] **M6:** viewers can share too: a viewer picks a source and asks, the host allows it with one
      click and passes the picture on to everyone else
- [ ] **Release:** the open points in the [release checklist](docs/release-checklist.md)
- **Future work (not planned, after the release):** handing the host role to a viewer when the
  host leaves, viewers passing the picture on to other viewers, sync mode for services with copy
  protection, an optional TURN service; see [future work](docs/future-work.md)

## Documentation

- [Changelog](CHANGELOG.md)
- [Architecture: how it is built and why](docs/architecture.md)
- [Protocol: handshake codes and data-channel messages](docs/protocol.md)
- [Future work](docs/future-work.md)
- [Manual test guide for stream mode](docs/manual-tests/m3-stream-mode.md)
- [Manual test guide for the sidebar in full screen](docs/manual-tests/m4-fullscreen-sidebar.md)
- [Manual test guide for many viewers](docs/manual-tests/m5-many-viewers.md)
- [Manual test guide for a viewer who shares](docs/manual-tests/m6-viewer-share.md)

## Disclaimer

WatchP2PStream is not affiliated with Netflix, YouTube, Disney+, Amazon or any other service
mentioned. All trademarks belong to their respective owners.

## License

[MIT](LICENSE) © 2026 Mathias Kuhlmey
