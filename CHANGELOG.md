# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- ADR-0001: architecture as a P2P browser extension with sync and stream modes.
- README, CHANGELOG, MIT license, `.gitignore`, `.editorconfig` and `.gitattributes`.
- Project tooling: WXT with Manifest V3 builds for Chrome/Brave and Firefox, TypeScript (strict),
  ESLint, Prettier and Vitest.
- Invitation and reply codes (`WSI1.…` / `WSR1.…`) that carry a compressed WebRTC session
  description and tolerate line breaks added by messengers.
- Data-channel protocol between host and viewers (welcome, participant list, chat) with strict
  validation of every incoming message.
- Direct WebRTC data channel between two browsers with non-trickle signaling, so one invitation
  and one reply code are enough to connect.

[unreleased]: https://github.com/MathewRGB/WatchStream/commits/main
