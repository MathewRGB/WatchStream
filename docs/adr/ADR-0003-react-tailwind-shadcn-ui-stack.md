---
id: ADR-0003
title: UI stack: React, Tailwind CSS and shadcn/ui on top of WXT
status: accepted
date: 2026-10-26
deciders: [Mathias Kuhlmey]
amends: [ADR-0002]
---

# ADR-0003: UI stack: React, Tailwind CSS and shadcn/ui on top of WXT

## Context

M1 built the WatchStream page in plain TypeScript and DOM calls (about 400 lines). It works, but
the next milestones add an app shell, a stage, quality controls and settings. Hand-written DOM code does
not scale to that: state changes have to be mirrored into the DOM by hand, and the component
structure is hard to read.

The maintainer asked for React and, after further research, for the combination WXT + React +
Tailwind CSS + shadcn/ui, with the project structure adapted accordingly.

## Decision

### 1. Stack

| Concern             | Choice                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension framework | WXT (unchanged), with `@wxt-dev/module-react`                                                                                                                                             |
| UI library          | React 19                                                                                                                                                                                  |
| Styling             | Tailwind CSS 4 via `@tailwindcss/vite`, design tokens as CSS variables                                                                                                                    |
| Components          | shadcn/ui: the source of each component is copied into `src/components/ui/` and owned by this repo; built on Radix UI primitives, `class-variance-authority`, `clsx` and `tailwind-merge` |
| Icons               | `lucide-react`                                                                                                                                                                            |
| Component tests     | Vitest + happy-dom + Testing Library (`@testing-library/react`, `user-event`, `jest-dom`)                                                                                                 |

### 2. Source layout

```
src/
  core/                 no React, no extension APIs: handshake, protocol, peer, sessions
  background/           background logic (no React)
  entrypoints/          thin WXT entry points: HTML, mount code
    background.ts
    session/            index.html, main.tsx
  components/
    ui/                 shadcn/ui components (generated, minimal edits)
  features/             product UI, one folder per feature
    session/            start, host and viewer views, chat, participants
  hooks/                React bindings for core objects (e.g. useHostSession)
  lib/                  small helpers such as `cn()`
  styles/               globals.css: Tailwind import and design tokens
  testing/              shared test setup (jest-dom, cleanup)
```

Rules:

- `core/` and `background/` never import React or anything from `components/`, `features/`,
  `hooks/`. This keeps the logic testable without a DOM and reusable by content scripts.
- Entry points only mount a feature; they contain no logic.
- `components/ui` holds generic building blocks without product knowledge; `features/` composes
  them.
- The path alias `@/` points to `src/`.

### 3. Binding core objects to React

Sessions are plain objects with an event emitter. Components read them through hooks built on
`useSyncExternalStore`, so there is one subscription per consumer and no duplicated state.
Because the sessions are mutable and hand out fresh arrays from their getters, the store snapshot
is a change counter (`useChangeCounter`) and components read the getters while rendering.

Sessions are not created in effects. `SessionApp` creates a `HostSession` in the event handler that
starts hosting, keeps it in its screen state and closes it in the handler that ends the session. An
effect-based lifecycle would close and recreate the session when React Strict Mode runs effects
twice in development, which would silently drop open invitations.

### 4. Content scripts stay free of React

Scripts injected into third-party pages (none yet; an in-page panel in M4 would be one) are written in plain TypeScript. They must
stay small and must not bring a UI framework, a stylesheet reset or global CSS into someone else's
page. If such a script needs UI, it uses a Shadow DOM via WXT's `createShadowRootUi`.

### 5. What stays the same

- Everything under `src/core/` and its unit and integration tests.
- The `data-testid` attributes, so the Playwright end-to-end tests keep working.
- The two-step code exchange and all behavior documented in ADR-0001 and ADR-0002.

## Consequences

- Positive: readable declarative UI, ready-made accessible components (focus handling, keyboard
  support, dialogs, tooltips), a consistent design system and a large ecosystem.
- Negative: more dependencies (React, Radix, Tailwind) and a build step for CSS. The extension
  grows by roughly 60-80 kB (gzip), which is irrelevant for a locally installed extension but is
  checked at each release.
- shadcn/ui components are copied code. Upstream fixes do not arrive automatically; updating a
  component means re-running the shadcn CLI and reviewing the diff.
- Mozilla's add-on review needs readable source for build output. The repository is public and
  the build is the unmodified WXT build, which satisfies this.

## Rejected alternatives

- **Keep plain DOM:** does not scale to the planned UI.
- **Preact or Svelte:** smaller, but the maintainer asked for React and the shadcn/ui ecosystem
  targets React.
- **A component library with its own runtime theming (MUI, Chakra):** heavier, and less control
  over the markup than owned shadcn/ui source.
- **React in content scripts:** adds weight and global style risk inside third-party pages.
