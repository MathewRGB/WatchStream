# Before the first store submission

Open points that need a person, not a test. Tick them off here.

## Brave with default Shields

Brave limits WebRTC address handling by default, which can reduce the candidates in a code.

- [x] Brave as host and as viewer, Shields at their defaults, same network: connects, picture and
      sound arrive.
- [x] Same across two networks.
- [ ] If it fails: copy the technical details from both sides and note which candidate counts
      (local, STUN, relay, IPv6) are zero, then decide whether the page needs a hint for Brave.

## Manual tests after the last changes

- [x] Brave on both sides (Ubuntu): change the codec and the quality again and again while
      sharing, a dozen times, some quickly one after the other. The viewer stays connected and the
      picture keeps playing.
- [x] Brave host and Firefox viewer, and the other way round, over two networks: the shorter
      codes connect (they are rebuilt on the other side, and only a real run over the internet
      shows reflexive candidates).
- [x] Brave and Firefox: on one connection share, stop and share again, six times, then let the
      viewer share and take the stage back. The picture and sound arrive every time.
- [ ] Paste a code on a phone messenger and back: it is one line and survives wrapping.

## Name "WatchP2PStream"

The product is called WatchP2PStream; the repository and the project stay `WatchStream`. The first
name, "WatchStream", was dropped on 2026-10-30 because Firefox Add-ons already lists a
near-identical "StreamWatch". A web search and a search through the AMO interface found no extension
or trademark called "WatchP2PStream" (2026-10-30), but they were not exhaustive and did not reach
the official trademark databases.

- [x] Search the Chrome Web Store for "WatchP2PStream".
- [x] Search Firefox Add-ons (AMO) for "WatchP2PStream".
- [x] Search TMview and the USPTO trademark database. The only mark found with a "P2P" element is
      the word mark "P2P" (US serial 97619429, Power2Parent, class 35, advocacy for parents):
      other goods and services, so no conflict with a browser extension.
- [x] No third-party trademark in the name, the icon or the store text; services are named only
      factually in the description.

The stores do not clear names against trademark registers when an extension is submitted; a
conflict would show up later as a complaint. This is a plausibility check, not a trademark search.

## Privacy text

- [ ] The store listing says: no WatchP2PStream server, no data collected, a public STUN server
      (`stun.l.google.com`) sees participants' public IP addresses, and invitation and reply codes
      contain the sender's IP addresses. The README's Privacy section is the source.
- [ ] Firefox: `data_collection_permissions` is `none` in the manifest (set).

## Package

- [ ] `npm run check` and `npm run test:e2e` pass.
- [ ] `npm run lint:firefox` shows only the two known `innerHTML` warnings from React DOM.
- [ ] `npm run zip` and `npm run zip:firefox` produce the packages; load each by hand once.
- [x] The two-network test passed (`docs/manual-tests/m3-stream-mode.md`).
