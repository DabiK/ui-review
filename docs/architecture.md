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
| `src/adapters/chrome/` | Chrome integrations (side panel wiring, active-tab adapter) | `@core` |
| `src/app/` | Composition root: adapters → use cases | `@core` + adapters |
| `src/sidepanel/` | Driving adapter: side-panel view (plain DOM) | `@app` + `@core` types |
| `src/background/` | MV3 service worker entry point | `@adapters/chrome` |
| `public/manifest.json` | MV3 manifest, copied to `dist/` at build time | — |
| `sidepanel.html` | Side-panel document, bundled by Vite | — |

## Public interfaces

Vocabulary (`src/core/index.ts`):

- `ReviewSession` — aggregate root: id, name, status (`active`/`stopped`), page URL,
  hostname, timestamps and comments. Created via `createReviewSession()`.
- `ReviewComment` — durable remark: id, session id, required non-blank text, category,
  priority, page URL, viewport, timestamps, evidence and attachments.
  Created via `createReviewComment()`; defaults are category `UI` and priority `important`.
- `Evidence` — technical context linked to a comment id, always carrying a `Confidence`
  (`confirmed` / `inferred` / `unavailable`) and an explicit payload kind (`dom`,
  `framework`, `source-map`).
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
- `loadReviewPanel()` — read model for the side panel: runtime facts, storage descriptor,
  current page eligibility, the current page's session (active preferred, otherwise the
  latest stopped) and every stored session as a summary. The UI learns persistence facts from
  the descriptor, never from adapter internals.

Every expected lifecycle failure is a typed result (`{ ok: false, reason }`) rather than a
thrown error; `DomainValidationError` is reserved for invalid state assembled by developers
and is asserted through the public barrel only.

## Runtime topology

- `service-worker.js` (built from `src/background/service-worker.ts`) attaches the side panel
  to the toolbar action through `chrome.sidePanel.setPanelBehavior`.
- `sidepanel.html` loads the bundled side panel, which renders the session lifecycle from
  `loadReviewPanel()` and drives `startReviewSession`, `stopReviewSession`,
  `renameReviewSession` and `clearReviewSession` through the composition root.
- `Start review` is the only entry point of inspection: the panel itself never captures
  anything, and ineligible pages (`chrome://`, `file://`, …) get a disabled action with an
  explanation.
- Sessions are stored in IndexedDB (`ui-review` database, `review-sessions` store); after a
  reload the panel restores the current page's session by page URL. No data leaves the
  machine; the native bridge and temporary handoff arrive in later issues.
- The `tabs` permission is required so `ChromeActivePageAdapter` can report the focused page
  URL and title; the core and the UI still never call `chrome.*` directly.

## Testing strategy

- Core tests import only the `@core` barrel and exercise public behaviour.
- The same `ReviewSessionRepository` contract test runs against the in-memory and IndexedDB
  adapters, so the test double cannot drift from the durable store. `ClockPort`,
  `IdGeneratorPort` and `ActivePagePort` each have a contract test run against both
  implementations.
- `tests/adapters/session-resume.test.ts` writes with one set of adapter instances and reads
  back with fresh ones, proving the reload/resume acceptance criterion through the real
  IndexedDB adapter.
- UI tests run under happy-dom and assert accessible structure, not implementation details.
- `tests/architecture/core-boundaries.test.ts` guards the dependency rule.
- `tests/extension/manifest.test.ts` guards the MV3 manifest and its entry points.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install toolchain (Node ≥ 20.19) |
| `npm run dev` | Rebuild `dist/` on change (reload the extension to apply) |
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
   **Start review** on an http(s) page to create and persist a session, **Stop review** to end
   it, rename it inline, and **Clear session** (with confirmation) to delete it.
