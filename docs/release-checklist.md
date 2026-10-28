# Before the first store submission

Open points from ADR-0001 that need a person, not a test. Tick them off here.

## Brave with default Shields

Brave limits WebRTC address handling by default, which can reduce the candidates in a code.

- [x] Brave as host and as viewer, Shields at their defaults, same network: connects, picture and
      sound arrive.
- [x] Same across two networks.
- [ ] If it fails: copy the technical details from both sides and note which candidate counts
      (local, STUN, relay, IPv6) are zero, then decide whether the page needs a hint for Brave.

## Name "WatchStream"

A web search on 2026-10-25 found neither an extension of that name nor a trademark, but it was not
exhaustive.

- [ ] Search the Chrome Web Store.
- [ ] Search Firefox Add-ons (AMO).
- [ ] Search TMview and the USPTO trademark database.
- [ ] No third-party trademark in the name, the icon or the store text; services are named only
      factually in the description.

## Privacy text

- [ ] The store listing says: no WatchStream server, no data collected, a public STUN server
      (`stun.l.google.com`) sees participants' public IP addresses, and invitation and reply codes
      contain the sender's IP addresses. The README's Privacy section is the source.
- [ ] Firefox: `data_collection_permissions` is `none` in the manifest (set).

## Package

- [ ] `npm run check` and `npm run test:e2e` pass.
- [ ] `npm run lint:firefox` shows only the two known `innerHTML` warnings from React DOM.
- [ ] `npm run zip` and `npm run zip:firefox` produce the packages; load each by hand once.
- [x] The two-network test passed (`docs/manual-tests/m3-stream-mode.md`).
