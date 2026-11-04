# Store listing texts

The wording for the Chrome Web Store and Firefox Add-ons (AMO). It restates
[PRIVACY.md](../PRIVACY.md), the README's [Privacy](../README.md#privacy) section and what the code
does; when one changes, change the others in the same commit. Services are named only factually, and nothing here claims an
affiliation with them.

## Short description (132 characters at most)

> Watch a tab, window or screen together, browser to browser. No server, no account, no data collected.

## Detailed description

```
Watch a tab, window or screen together with friends, browser to browser. No server, no account, no data collected.

A host invites up to twelve viewers, and everyone sees and hears the same thing: YouTube, a film, a game or any video that plays in the host's browser.

WHY WATCHP2PSTREAM
• No server at all. The picture, the sound and the chat go directly between the browsers. Even the connection setup travels as codes through a messenger you already use.
• No account and no subscription for viewers. Only the host needs access to the content; a viewer needs the extension and a code.
• Everyone sees exactly the same picture. The host's picture and sound are sent, not a playback position, so nobody drifts out of step and regional versions of a title do not matter.
• Works with any video the host can play that has no copy protection, and with a whole window or screen.
• The host is in control: up to twelve viewers, one invitation per person, removing a viewer, a picture quality from Minimal to 4K, and a load monitor that says when the computer or connection cannot keep up. A viewer can share too, once the host allows it.
• Private by design. Every connection is encrypted between two browsers.

HOW IT WORKS
1. Click the toolbar icon. The WatchP2PStream page opens.
2. Host: choose "Host a session" and send the invitation code to a friend through any messenger.
3. Viewer: choose "Join a session", paste the code and send the reply code back.
4. Host: paste the reply code, choose "Share" and pick a tab, window or screen.

Also included: a chat, a full-screen mode with a sliding sidebar, a volume control, settings for weak connections and an optional smoothing buffer for viewers on long routes.

PRIVACY
WatchP2PStream collects no data and sends nothing to the developer. To connect people on different networks, your browser asks a public STUN server (stun.l.google.com, run by Google) for its public IP address; that server sees IP addresses and nothing else. Invitation and reply codes contain network addresses, so send them only to the person you invite.

LIMITS
Services with copy protection (Netflix, Disney+, Prime Video, Max) show a black picture when shared. WatchP2PStream does not circumvent that.

Open source (MIT): https://github.com/MathewRGB/WatchStream
```

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

The full policy is [PRIVACY.md](../PRIVACY.md); the stores link to it.

## Chrome Web Store: "Privacy practices" tab

- **Single purpose:** share a tab, window or screen with other people over a direct browser-to-browser
  connection, and watch it together with a chat.
- **Permission justification, `storage`:** remembers the display name, the volume setting and the choice for the smoothing
  buffer on this computer and keeps the id of the open session tab for the length of a browser session. Nothing
  leaves the computer.
- **Host permissions:** none requested. Chrome and Brave get no host permission and no content
  script; the tab picker is the browser's own.
- **Remote code:** no. All code ships in the package.
- **Data usage:** do not tick any category of collected data; the extension transmits nothing to the
  developer. Tick the three certifications (no sale of data, no use for unrelated purposes, no use
  for creditworthiness).
- **Privacy policy URL:** https://github.com/MathewRGB/WatchStream/blob/main/PRIVACY.md

## Firefox Add-ons

- **Data collection:** `none` (`data_collection_permissions` in the manifest, Firefox 140 or newer).
- **Permissions at install:** `storage` and `scripting`. The tab list (`tabs`) and each site
  (`<all_urls>`) are optional and asked for once, when the host chooses to share a tab's sound.
  The injected script only reads the sound of the chosen tab's video and forwards it to the
  WatchP2PStream page; it sends nothing anywhere else.
- **Notes for the reviewer:** build with `npm ci && npm run build:firefox`; the
  two `innerHTML` warnings of `web-ext lint` come from React DOM.
