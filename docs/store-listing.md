# Store listing texts

The wording for the Chrome Web Store, Firefox Add-ons (AMO) and the privacy policy. It restates the
README's [Privacy](../README.md#privacy) section and what the code does; when one changes, change
the others in the same commit. Services are named only factually, and nothing here claims an
affiliation with them.

## Short description (132 characters at most)

> Watch a tab, window or screen together, browser to browser. No server, no account, no data collected.

## Privacy summary (for the listing)

WatchP2PStream has no server and collects no data. The picture, the sound and the chat go directly
between the browsers of the people in a session, encrypted on each connection. Nothing is sent to
the developer or to any third party, with one exception that cannot be avoided:

- **Finding your public address.** To connect two people on different networks, your browser asks a
  public STUN server (`stun.l.google.com`, run by Google) for its public IP address. That server
  sees the IP addresses of the participants and nothing else: no picture, sound, chat or name.
- **Invitation and reply codes contain IP addresses.** A code holds the sender's network addresses,
  so that the other browser can connect. Send it only to the person you invite.
- **The people in your session see what you share**, your display name and what you type in the
  chat. A host sees each viewer's address, and every viewer's picture passes through the host's
  browser.

## Privacy policy

**WatchP2PStream does not collect, store or transmit personal data to the developer or to any
server run by the developer.** The extension has no server, no account, no analytics and no
advertising, and it loads no code from the internet.

**What stays on your computer.** The extension stores three things locally in your browser: the
display name you last entered, your volume setting, and, for the length of a browser session, the
id of the tab it is open in. The log shown under "copy technical details" and the chat messages are
kept in the page's memory only and are gone when you close it. Removing the extension removes the
stored values.

**What goes to other people.** When you host or join a session, your browser connects directly to
the other participants. They receive, encrypted, whatever you share (the picture and sound of the
tab, window or screen you pick), your chat messages and your display name. Your IP address is
visible to the people you connect to, because a direct connection needs it. Each invitation or
reply code you send contains your IP addresses. You decide who receives it.

**The one outside service.** To learn its public address, your browser contacts the public STUN
server `stun.l.google.com` (Google). It receives your IP address and the port of the request, as
any server does, and it never receives content. See Google's privacy policy for what Google does
with such requests. If you use a VPN or block that server, a connection between different networks
may not come up.

**What you share is your responsibility.** Share only what you may show to the people you invite,
and send codes only to them.

**Children.** The extension is a general tool and is not directed at children.

**Contact.** Questions and reports: the issues page of the project at
https://github.com/MathewRGB/WatchStream/issues.

**Changes.** A change to this policy is made in this file and in the README of the project, and is
recorded in the changelog.

## Chrome Web Store: "Privacy practices" tab

- **Single purpose:** share a tab, window or screen with other people over a direct browser-to-browser
  connection, and watch it together with a chat.
- **Permission justification, `storage`:** remembers the display name and the volume setting on this
  computer and keeps the id of the open session tab for the length of a browser session. Nothing
  leaves the computer.
- **Host permissions:** none requested. Chrome and Brave get no host permission and no content
  script; the tab picker is the browser's own.
- **Remote code:** no. All code ships in the package.
- **Data usage:** do not tick any category of collected data; the extension transmits nothing to the
  developer. Tick the three certifications (no sale of data, no use for unrelated purposes, no use
  for creditworthiness).
- **Privacy policy URL:** the project's README `#privacy` section, or this policy published at a
  stable address.

## Firefox Add-ons

- **Data collection:** `none` (`data_collection_permissions` in the manifest, Firefox 140 or newer).
- **Permissions at install:** `storage` and `scripting`. The tab list (`tabs`) and each site
  (`<all_urls>`) are optional and asked for once, when the host chooses to share a tab's sound.
  The injected script only reads the sound of the chosen tab's video and forwards it to the
  WatchP2PStream page; it sends nothing anywhere else.
- **Notes for the reviewer:** build with `npm ci && npm run build:firefox`; the
  two `innerHTML` warnings of `web-ext lint` come from React DOM.
