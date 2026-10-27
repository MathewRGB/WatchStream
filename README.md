# WatchStream

Watch streams together, browser to browser, without your own media server.

WatchStream is a browser extension for Chrome, Brave and Firefox. A host invites up to three
viewers, and everyone watches the same thing: YouTube, Netflix or any other video in the browser.

> **Status:** milestone M2. Host and viewers connect directly, chat, and have a one-window layout
> with a stage and a sidebar. Watching together (stream and sync mode) follows in M3 and M4. The
> extension is not yet published in any store.

## How it works

WatchStream has two modes and picks the right one automatically:

| Mode       | Content                                                          | Quality                      | Requirement                                      |
| ---------- | ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| **Stream** | Everything unprotected, including YouTube                        | Re-encoded, near-transparent | Only the host needs access                       |
| **Sync**   | Protected services such as Netflix, Disney+, Prime Video and Max | Original                     | Every viewer has their own access to the content |

Protected content cannot be captured (the picture turns black), so it is synchronized instead:
everyone plays it in their own tab. YouTube goes through stream mode on purpose, because videos can
be blocked for individual viewers by region or age. See
[ADR-0004](docs/adr/ADR-0004-mode-selection-and-roadmap.md).

- **Direct connection:** participants connect to the host directly over WebRTC. Video, audio and
  control data are end-to-end encrypted and never pass through a WatchStream server.
- **Invitation by code:** the host sends an invitation code through any messenger, and the viewer
  sends a reply code back.
- **Host controls:** only the host plays, pauses and seeks; viewers follow automatically.

## Using it

1. Click the WatchStream icon in the toolbar. The WatchStream page opens in a tab.
2. **Host:** enter your name, choose **Host a session**, open the **Invite** tab in the sidebar and
   choose **Invite a viewer**. Send the invitation code to one person via any messenger.
3. **Viewer:** enter your name, choose **Join a session**, paste the invitation code and choose
   **Join**. The reply code is copied to your clipboard automatically and a notice says so; paste
   it into your chat with the host.
4. **Host:** paste the reply code into the invitation and choose **Connect**.
5. Once connected, the sidebar shows **People** and **Chat**.

The window is one screen: the stage on the left (it has a full-screen button) and a sidebar with
tabs on the right, which you can hide with the button in the header. Nothing is shared on the stage
yet; that arrives with stream mode.

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
| `npm test`                 | Unit and component tests (Vitest, Testing Library, happy-dom)          |
| `npm run test:integration` | WebRTC integration tests in real Chromium and Firefox (Vitest browser) |
| `npm run test:e2e`         | Builds both targets, then Playwright end-to-end tests                  |
| `npm run check`            | Typecheck, lint, format check, unit and integration tests              |
| `npm run lint:firefox`     | Validates the Firefox package with Mozilla's `web-ext lint`            |

The browser tests need Playwright's browsers once: `npx playwright install chromium firefox`.

`npm run lint:firefox` reports two `innerHTML` warnings. They come from React DOM inside the
bundle, not from this repository: ESLint forbids `innerHTML` and `dangerouslySetInnerHTML` in our
own code, because chat text and names come from other people.

### Tech stack

[WXT](https://wxt.dev) (Manifest V3, one codebase for Chrome, Brave and Firefox), TypeScript,
React 19, Tailwind CSS 4 and [shadcn/ui](https://ui.shadcn.com). Connections use WebRTC. See
[ADR-0003](docs/adr/ADR-0003-react-tailwind-shadcn-ui-stack.md) for the reasons and the rules
that keep the stack tidy.

### Project layout

```
src/core/          connection, handshake codes, protocol and sessions (no React, no extension APIs)
src/background/    toolbar icon handling (no React)
src/entrypoints/   thin WXT entry points: background script, session page
src/features/      product UI, one folder per feature (session: app shell, stage, sidebar tabs,
                   start, host and viewer screens, chat)
src/components/ui/ shadcn/ui components
src/hooks/         React hooks that bind core objects to components
src/lib/           small helpers such as cn()
src/styles/        Tailwind import and design tokens (globals.css)
tests/             integration tests in real browsers
e2e/               Playwright end-to-end tests
docs/adr/          architecture decision records
```

Add a shadcn/ui component with `npx shadcn@latest add <name>`. It lands in `src/components/ui/`.
The CLI currently imports `cn` from an unrelated npm package named `cn` and adds it to
`package.json`. Point the import at `@/lib/utils` and run `npm uninstall cn` afterwards.

## Roadmap

- [ ] **M1:** connection setup by code, chat — tested automatically in Chromium and Firefox and
      manually by the maintainer in Chrome, Brave and Firefox; a test across two different
      networks is still to be confirmed
- [x] **M2:** app shell: one window without page scrolling, stage with full-screen mode, sidebar
      with tabs, reply code copied automatically
- [ ] **M3:** stream mode
- [ ] **M4:** sync mode for protected sites: generic adapter, Netflix
- [ ] **M5:** more protected sites, panel next to the streaming tab, optional TURN service

## Documentation

- [Changelog](CHANGELOG.md)
- [Architecture decision records (ADRs)](docs/adr/)

## Disclaimer

WatchStream is not affiliated with Netflix, YouTube, Disney+, Amazon or any other service
mentioned. All trademarks belong to their respective owners.

## License

[MIT](LICENSE) © 2026 Mathias Kuhlmey
