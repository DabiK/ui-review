# Architecture

UI Review is a local-first Chrome MV3 extension. The same clean/hexagonal rules apply to the
extension and to the future native bridge: dependencies point inward only, the domain knows
nothing about its hosts, and every port has at least two real implementations.

```
driving adapters            application                domain                 driven adapters
(side panel, overlay,  →    use cases (core)       ←   ports + vocabulary  →  persistence, runtime,
 service worker)                                       (`review-core`)        bridge, OS, framework
```

- `review-core` is pure: **no** `chrome.*`, DOM, React/Vue, Node, OS or adapter imports.
- Ports are declared by the core; implementations live outside and depend on the core types.
- The composition root (`src/app`) is the only place that picks concrete adapters.
- The UI calls use cases and never touches `chrome.*` or a storage API directly.
- Callers never assemble domain state: factories and use cases own the invariants.

Boundaries are enforced twice: ESLint (`no-restricted-imports` on `src/core/**`) and
`tests/architecture/core-boundaries.test.ts`, which parses every core import and rejects any
specifier that leaves `src/core`.

## Module map

| Path | Role | Depends on |
|---|---|---|
| `src/core/model/` | Canonical vocabulary and invariants | nothing |
| `src/core/ports/` | Driven interfaces declared by the domain | `src/core/model` |
| `src/core/usecases/` | Core use cases / read models | `model` + `ports` |
| `src/core/index.ts` | Public barrel — the only entry point for the core | core internals |
| `src/adapters/persistence/in-memory/` | Ephemeral repository (tests, previews) | `@core` |
| `src/adapters/persistence/indexeddb/` | Durable repository (browser profile) | `@core` |
| `src/adapters/runtime/` | Host facts: Chrome runtime, system clock, crypto ids + deterministic doubles | `@core` |
| `src/adapters/chrome/` | Chrome integrations (side panel wiring, active tab, review transport, change channel) | `@core` + `@app` types |
| `src/app/` | Composition root: adapters → use cases + application gateways | `@core` + adapters |
| `src/sidepanel/` | Driving adapter: side-panel view (plain DOM) | `@app` + `@core` types |
| `src/content/` | Driving adapter: page overlay (shadow DOM), DOM anchor capture | `@core` types + transport |
| `src/background/` | MV3 service worker entry point | `@adapters/chrome` |
| `scripts/dev.mjs` | Runs both build watchers (extension ESM + content-script IIFE) | Vite |
| `vite.content.config.ts` | Second build pass emitting `dist/content-script.js` as an IIFE | Vite |
| `public/manifest.json` | MV3 manifest, copied to `dist/` at build time | — |
| `sidepanel.html` | Side-panel document, bundled by Vite | — |

## Public interfaces

Vocabulary (`src/core/index.ts`):

- `ReviewSession` — aggregate root: id, name, status (`active`/`stopped`), page URL,
  hostname, timestamps and comments. Created via `createReviewSession()`.
- `ReviewComment` — durable remark: id, session id, required non-blank text, category,
  priority, page URL, viewport, timestamps, evidence and attachments.
  Created via `createReviewComment()`; edited via `reviseReviewComment()`; defaults are
  category `UI` and priority `important`.
- `Evidence` — technical context linked to a comment id, always carrying a `Confidence`
  (`confirmed` / `inferred` / `unavailable`) and an explicit payload kind (`dom`,
  `framework`, `source-map`). `createDomEvidence()` assembles the direct DOM observation
  captured when a reviewer pins an element.
- `Attachment` — binary artifact (viewport screenshot, element crop) linked to a comment,
  stored inline or as a local artifact path.
- Session lifecycle helpers (`buildSessionName`, `isReviewablePageUrl`, `stopSession`,
  `renameSession`, `sortSessionsByRecency`, `findCurrentSessionForPage`) — pure functions the
  use cases rely on; callers never assemble a transition themselves.

Ports:

- `ReviewSessionRepository` — `describe()`, `save()`, `findById()`, `list()`, `delete()`.
  Implementations: `InMemoryReviewSessionRepository`, `IndexedDbReviewSessionRepository`.
- `RuntimeInfoPort` — `read()` returns extension name/version and runtime label.
  Implementations: `ChromeRuntimeInfoAdapter`, `StaticRuntimeInfoAdapter`.
- `ActivePagePort` — `read()` returns the focused page (url, title) or `null`.
  Implementations: `ChromeActivePageAdapter` (`chrome.tabs`), `StaticActivePageAdapter`.
- `ClockPort` — `now()` returns an ISO-8601 UTC timestamp.
  Implementations: `SystemClockAdapter`, `FixedClockAdapter`.
- `IdGeneratorPort` — `createId()` returns a fresh id.
  Implementations: `CryptoIdGeneratorAdapter` (`crypto.randomUUID`),
  `SequentialIdGeneratorAdapter`.

Use cases:

- `startReviewSession()` — reads the active page through `ActivePagePort`, refuses missing or
  non-http(s) pages and an already-active session for the page, then creates, names and
  persists one active session. Nothing is captured before this call.
- `stopReviewSession({ sessionId })` — active → stopped transition, persisted.
- `renameReviewSession({ sessionId, name })` — trims and persists a non-blank name.
- `clearReviewSession({ sessionId })` — deletes exactly one session (its comments, evidence
  and attachments are embedded in the aggregate).
- `loadReviewPanel({ selectedSessionId? })` — read model for the side panel: runtime facts,
  storage descriptor, current page eligibility, the current page's session (active preferred,
  otherwise the latest stopped), the effective selection and the selected session's comments.
  The UI learns persistence facts from the descriptor, never from adapter internals.
- `addReviewComment({ sessionId, text, pageUrl, viewport, category?, priority?, anchor? })` —
  adds one comment to an **active** session of the same page, with its optional DOM anchor
  assembled into a `confirmed` DOM evidence linked by comment id. Blank text, invalid anchors
  and mismatched pages are refused with typed failures; nothing is written.
- `updateReviewComment({ sessionId, commentId, text, category, priority })` — edits one stored
  comment and refreshes `updatedAt`; anchor, evidence and attachments survive.
- `deleteReviewComment({ sessionId, commentId })` — removes exactly one comment.
- `loadOverlayState({ pageUrl })` — read model for the page overlay: `active`, the running
  session id and its comments with a 1-based pin index and a reduced DOM anchor
  (fingerprint, ancestry, text, role, bounding box, viewport). No session active for the URL
  means `{ active: false, comments: [] }` and no injected overlay.

Every expected lifecycle failure is a typed result (`{ ok: false, reason }`) rather than a
thrown error; `DomainValidationError` is reserved for invalid state assembled by developers
and is asserted through the public barrel only.

Application gateways (declared in `src/app/gateways.ts`, not in the core because they carry no
domain decision):

- `ReviewChangeBroadcaster` — `notifyPanelChanged()` asks the side panel to reload stored
  state; `syncPageOverlay(pageUrl)` asks the tabs showing that page to re-sync their overlay.
  Implementations: `ChromeReviewChannel`, `InMemoryReviewChangeBus`.
- `ReviewChangeSubscription` — `subscribe(listener)` returns an unsubscribe function.
  Implementations: `ChromeReviewChannel`, `InMemoryReviewChangeBus`.

## Runtime topology

- `service-worker.js` (built from `src/background/service-worker.ts`) attaches the side panel
  to the toolbar action through `chrome.sidePanel.setPanelBehavior` and registers the review
  message router on `chrome.runtime.onMessage`.
- `sidepanel.html` loads the bundled side panel, which renders the session lifecycle and the
  selected session's notes from `loadReviewPanel()`, drives `startReviewSession`,
  `stopReviewSession`, `renameReviewSession`, `clearReviewSession`, `updateReviewComment` and
  `deleteReviewComment` through the composition root, and subscribes to stored changes so a
  note created from the page appears without a manual refresh.
- `content-script.js` (built separately as an IIFE from `src/content/index.ts`, declared in
  `manifest.content_scripts` for `http(s)` pages) is the page driving adapter. On load it asks
  the service worker for `loadOverlayState(location.href)`; only an explicitly active session
  mounts the shadow-DOM overlay. While it is mounted, hovering highlights the element under
  the pointer and clicking pins it: the page click is intercepted, the inline composer asks
  for the required text plus category/priority, and the note is created through the service
  worker → `addReviewComment` → repository. `Escape` cancels the composer and `Shift+Escape`
  stops the session. Without an active session nothing is injected and page events are
  untouched.
- Transport messages are versioned and namespaced in `src/adapters/chrome/review-messages.ts`
  (`ui-review:overlay-sync`, `ui-review:comment-create`, `ui-review:stop-session`,
  `ui-review:review-changed`); unknown payloads are rejected by type guards before any use
  case runs.
- Sessions are stored in IndexedDB (`ui-review` database, `review-sessions` store); after a
  reload the side panel restores the current page's session and its notes by page URL, and the
  overlay rebuilds its pins from each comment's DOM fingerprint. No data leaves the machine;
  screenshots and the native bridge arrive in later issues.
- `Start review` is the only entry point of inspection: the panel itself never captures
  anything, and ineligible pages (`chrome://`, `file://`, …) get a disabled action with an
  explanation.
- The `tabs` permission is required so `ChromeActivePageAdapter` can report the focused page
  URL and title and so the service worker can push overlay syncs to the matching tabs; the
  core and the UI still never call `chrome.*` directly.

## Testing strategy

- Core tests import only the `@core` barrel and exercise public behaviour.
- The same `ReviewSessionRepository` contract test runs against the in-memory and IndexedDB
  adapters, so the test double cannot drift from the durable store. `ClockPort`,
  `IdGeneratorPort` and `ActivePagePort` each have a contract test run against both
  implementations.
- `tests/adapters/session-resume.test.ts` writes with one set of adapter instances and reads
  back with fresh ones, proving the reload/resume acceptance criterion through the real
  IndexedDB adapter.
- `tests/adapters/comment-round-trip.test.ts` runs the real message router with the real use
  cases over the in-memory repository: a page-created comment reaches both the side-panel read
  model and the overlay read model after a simulated reload.
- `tests/content/` covers DOM fingerprinting/anchoring and the overlay interaction
  (highlight, composer, blank-text refusal, `Escape`/`Shift+Escape`, pin rendering) under
  happy-dom; `tests/content/bootstrap.test.ts` proves the content script injects nothing
  without an active session.
- UI tests run under happy-dom and assert accessible structure, not implementation details.
- `tests/architecture/core-boundaries.test.ts` guards the dependency rule.
- `tests/extension/manifest.test.ts` guards the MV3 manifest and its entry points, including
  the content-script declaration.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install toolchain (Node ≥ 20.19) |
| `npm run dev` | Rebuild both bundles (`dist/`) on change; reload the extension to apply |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (includes core boundary rules) |
| `npm test` | Vitest unit + architecture tests |
| `npm run verify` | lint → typecheck → test → build |

## Loading the unpacked extension

1. `npm install && npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` directory.
4. Click the UI Review toolbar icon: the side panel opens on the session panel. Click
   **Start review** on an http(s) page to create and persist a session, then click any element
   in the page to pin a note (hover highlights, `Escape` cancels the composer, `Shift+Escape`
   leaves review mode). Notes appear in the panel immediately and survive a page or panel
   reload; edit or delete them from the panel. **Stop review** ends the session, rename it
   inline, and **Clear session** (with confirmation) deletes it.
