# WatchStream

Watch streams together, browser to browser, without your own media server.

WatchStream is a browser extension for Chrome, Brave and Firefox. A host invites up to three
viewers, and everyone watches the same thing in sync: Netflix, YouTube or any other video in the
browser.

> **Status:** concept phase. There is no runnable code yet. The architecture is described in
> [ADR-0001](docs/adr/ADR-0001-p2p-watchparty-browser-extension.md).

## How it works

WatchStream has two modes and picks the right one automatically:

| Mode | Use case | Quality | Requirement |
|---|---|---|---|
| **Sync** (default) | Netflix, Disney+, Prime Video, YouTube and anything every viewer can open themselves | Original | Every viewer has their own access to the content |
| **Stream** | Non-DRM content that only the host can open | Re-encoded, near-transparent | Only the host needs access |

- **Direct connection:** participants connect to the host directly over WebRTC. Video, audio and
  control data are end-to-end encrypted and never pass through a WatchStream server.
- **Invitation by code:** the host sends an invitation code through any messenger, and the viewer
  sends a reply code back.
- **Host controls:** only the host plays, pauses and seeks; viewers follow automatically.

## Limitations

- For services with copy protection (Netflix, Disney+, etc.) every viewer needs their own
  subscription. WatchStream does not circumvent copy protection.
- In stream mode the host's upload bandwidth limits the quality. It is designed for 2-3 viewers.
- Firefox cannot capture audio as a host in stream mode.
- Behind some routers (e.g. carrier-grade NAT) no direct connection is possible without an
  additional relay server (TURN).
- A public STUN server is used for address discovery. It sees the participants' public IP
  addresses, but no content.

## Planned stack

- TypeScript, [WXT](https://wxt.dev) as the cross-browser framework
- Manifest V3
- WebRTC (data channel for sync and chat, media tracks for stream mode)

## Roadmap

- [ ] **M1:** connection setup by code, chat, tested in Chrome, Brave and Firefox
- [ ] **M2:** sync mode with a generic video adapter, YouTube
- [ ] **M3:** Netflix adapter
- [ ] **M4:** stream mode
- [ ] **M5:** more services, optional TURN and signaling service

## Documentation

- [Architecture decision records (ADRs)](docs/adr/)

## Disclaimer

WatchStream is not affiliated with Netflix, YouTube, Disney+, Amazon or any other service
mentioned. All trademarks belong to their respective owners.

## License

[MIT](LICENSE) © 2026 Mathias Kuhlmey
