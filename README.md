# WatchStream

Watch streams together, browser to browser, without your own media server.

WatchStream is a browser extension for Chrome, Brave and Firefox. A host invites up to three
viewers, and everyone watches the same thing in sync: Netflix, YouTube or any other video in the
browser.

> **Status:** milestone M1. Host and viewers connect directly and can chat. Watching together
> (sync and stream mode) follows in M2-M4. The extension is not yet published in any store.

## How it works

WatchStream has two modes and picks the right one automatically:

| Mode               | Use case                                                                             | Quality                      | Requirement                                      |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------ |
| **Sync** (default) | Netflix, Disney+, Prime Video, YouTube and anything every viewer can open themselves | Original                     | Every viewer has their own access to the content |
| **Stream**         | Non-DRM content that only the host can open                                          | Re-encoded, near-transparent | Only the host needs access                       |

- **Direct connection:** participants connect to the host directly over WebRTC. Video, audio and
  control data are end-to-end encrypted and never pass through a WatchStream server.
- **Invitation by code:** the host sends an invitation code through any messenger, and the viewer
  sends a reply code back.
- **Host controls:** only the host plays, pauses and seeks; viewers follow automatically.

## Using it (M1)

1. Click the WatchStream icon in the toolbar. The WatchStream page opens in a tab.
2. **Host:** enter your name, choose **Host a session**, then **Invite a viewer**. Send the
   invitation code to one person via any messenger.
3. **Viewer:** enter your name, choose **Join a session**, paste the invitation code and choose
   **Join**. Send the reply code back to the host.
4. **Host:** paste the reply code into the invitation and choose **Connect**.
5. Once connected, everyone sees the participant list and can chat.

Each invitation is for one person; a session holds up to three viewers. Keep the WatchStream tab
open: closing it ends the session.

## Limitations

- For services with copy protection (Netflix, Disney+, etc.) every viewer needs their own
  subscription. WatchStream does not circumvent copy protection.
- In stream mode the host's upload bandwidth limits the quality. It is designed for 2-3 viewers.
- Firefox cannot capture audio as a host in stream mode.
- Behind some routers (e.g. carrier-grade NAT) no direct connection is possible without an
  additional relay server (TURN).
- Firefox 140 or newer is required.

## Privacy

- WatchStream has no server and collects no data.
- A public STUN server (`stun.l.google.com`) is used for address discovery. It sees the
  participants' public IP addresses, but no content.
- Invitation and reply codes contain your IP addresses. Share them only with the people you
  invite.

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
| `npm test`                 | Unit and DOM tests (Vitest, Node and happy-dom)                        |
| `npm run test:integration` | WebRTC integration tests in real Chromium and Firefox (Vitest browser) |
| `npm run test:e2e`         | Builds both targets, then Playwright end-to-end tests                  |
| `npm run check`            | Typecheck, lint, format check, unit and integration tests              |
| `npm run lint:firefox`     | Validates the Firefox package with Mozilla's `web-ext lint`            |

The browser tests need Playwright's browsers once: `npx playwright install chromium firefox`.

### Project layout

```
src/core/        connection, handshake codes, protocol and sessions (no UI, no extension APIs)
src/ui/          the WatchStream page (plain TypeScript and DOM)
src/background/  toolbar icon handling
src/entrypoints/ WXT entry points (background script, session page)
tests/           integration tests in real browsers
e2e/             Playwright end-to-end tests
docs/adr/        architecture decision records
```

## Roadmap

- [ ] **M1:** connection setup by code, chat, tested in Chrome, Brave and Firefox — implemented
      and tested automatically in Chromium and Firefox; Brave and connections across different
      networks still need a manual test
- [ ] **M2:** sync mode with a generic video adapter, YouTube
- [ ] **M3:** Netflix adapter
- [ ] **M4:** stream mode
- [ ] **M5:** more services, optional TURN and signaling service

## Documentation

- [Changelog](CHANGELOG.md)
- [Architecture decision records (ADRs)](docs/adr/)

## Disclaimer

WatchStream is not affiliated with Netflix, YouTube, Disney+, Amazon or any other service
mentioned. All trademarks belong to their respective owners.

## License

[MIT](LICENSE) © 2026 Mathias Kuhlmey
