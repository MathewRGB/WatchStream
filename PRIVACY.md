# Privacy policy

This policy covers the WatchP2PStream browser extension for Chrome, Brave and Firefox.

**WatchP2PStream does not collect, store or transmit personal data to the developer or to any
server run by the developer.** The extension has no server, no account, no analytics and no
advertising, and it loads no code from the internet.

## What stays on your computer

The extension stores four things locally in your browser: the display name you last entered, your
volume setting, your choice for the smoothing buffer (how long your browser collects the picture
before it plays it), and, for the length of a browser session, the id of the tab it is open in. The log
shown under "copy technical details" and the chat messages are kept in the page's memory only and
are gone when you close it. Removing the extension removes the stored values.

## What goes to other people

When you host or join a session, your browser connects directly to the other participants. They
receive, encrypted, whatever you share (the picture and sound of the tab, window or screen you
pick), your chat messages and your display name. Your IP address is visible to the people you
connect to, because a direct connection needs it. Each invitation or reply code you send contains
your IP addresses. You decide who receives it.

## The one outside service

To learn its public address, your browser contacts the public STUN server `stun.l.google.com`
(Google). It receives your IP address and the port of the request, as any server does, and it never
receives content. See Google's privacy policy for what Google does with such requests. If you use a
VPN or block that server, a connection between different networks may not come up.

## Permissions

- **Chrome and Brave:** only `storage`, for the values listed above. No access to websites.
- **Firefox:** `storage` and `scripting`. Firefox cannot share a tab's sound itself, so when a host
  shares a tab's sound, the extension asks once for the tab list and for access to that site, and
  injects a script into the chosen tab. The script only reads the sound of the tab's video and
  passes it to the WatchP2PStream page; it sends nothing anywhere else.

## What you share is your responsibility

Share only what you may show to the people you invite, and send codes only to them.

## Children

The extension is a general tool and is not directed at children.

## Contact

Questions and reports: the issues page of the project at
https://github.com/MathewRGB/WatchStream/issues.

## Changes

A change to this policy is made in this file and recorded in the
[changelog](CHANGELOG.md).
