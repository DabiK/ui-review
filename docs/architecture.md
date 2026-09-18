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
  `framework`, `source-map`, `visual`). `createDomEvidence()` assembles the direct DOM
  observation captured when a reviewer pins an element; `visual` evidence records the
  screenshot outcome per part (`captured` / `failed`) with a non-blank reason whenever a
  capture failed — it never silently claims an image exists.
- `Attachment` — binary artifact (viewport screenshot, element crop) linked to a comment,
  stored inline or as a local artifact path. Created via `createAttachment()`, which
  validates the image mime type, dimensions, byte length and storage shape.
- `src/core/model/redaction.ts` — the privacy gate applied to every DOM payload by
  `createEvidence()`: `value` and secret-like attribute names (`password`, `token`,
  `secret`, authorization/API keys, session ids…) become `[redacted]`, and URL attributes
  (`href`, `src`, …) lose credentials and secret-like parameters before persistence.
  URL redaction parses every scheme the platform URL parser accepts — `http(s)`, `ftp`,
  `ws(s)`, custom deep links (`myapp:`, `slack:`, `vscode:`) — and masks credentials, query
  keys and fragment keys identically everywhere, including hash routes such as
  `#/route?access_token=…`. `mailto:`, `data:` and `javascript:` values are parsed too: a
  secret-bearing parameter is redacted while secret-free values stay byte-identical, and
  evidence is never executed, so the lossy rewrite of a secret-bearing value is an accepted
  trade-off. Values the parser rejects are redacted textually from behind their scheme when
  they have one, so relative and protocol-relative `href`/`src` values cannot leak a secret
  either. Known limitation: Android `intent://…#Intent;…;S.token=…;end` references separate
  parameters with `;`, which `URLSearchParams` does not split, so a secret nested in an
  intent payload is not masked. Adapters additionally never read form values; the core gate
  makes the rule impossible to bypass.
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
- `ScreenshotCapturePort` — `capture(request)` turns a pinned element (tab, viewport-
  relative rect, viewport) into one viewport screenshot and one element crop, or into an
  explicit failure reason. Expected failures are values, never exceptions.
  Implementations: `ChromeScreenshotCaptureAdapter` (`chrome.tabs.captureVisibleTab` plus a
  local `OffscreenCanvas` crop), `FakeScreenshotCaptureAdapter` (scriptable test double).
  The shared contract test runs against both, including the offscreen and unavailable paths.

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
  Each comment summary carries its screenshot previews (`dataUrl` when inline) and its
  explicit capture outcome, so the view never reads the aggregate. The UI learns persistence
  facts from the descriptor, never from adapter internals.
- `addReviewComment({ sessionId, text, pageUrl, viewport, category?, priority?, anchor? })` —
  adds one comment to an **active** session of the same page, with its optional DOM anchor
  assembled into a `confirmed` DOM evidence linked by comment id. Blank text, invalid anchors
  and mismatched pages are refused with typed failures; nothing is written.
- `captureCommentEvidence({ sessionId, commentId, capture })` — asks `ScreenshotCapturePort`
  for the viewport screenshot and element crop of the pinned element, then appends the
  attachments and one `visual` evidence record linked to the comment id. Confidence is
  `confirmed` when both images exist, `inferred` when only one does and `unavailable`
  otherwise; a missing tab context or a throwing adapter becomes explicit failed evidence, so
  the text/DOM comment always survives. Screen capture failures are never thrown.
- `updateReviewComment({ sessionId, commentId, text, category, priority })` — edits one stored
  comment and refreshes `updatedAt`; anchor, evidence and attachments survive.
- `deleteReviewComment({ sessionId, commentId })` — removes exactly one comment.
- `deleteReviewCommentAttachment({ sessionId, commentId, attachmentId })` — removes exactly one
  screenshot attachment; the other one and the evidence history survive. Evidence records what
  was captured at review time, so deleting curated bytes never rewrites it into a false
  failure.
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
  `stopReviewSession`, `renameReviewSession`, `clearReviewSession`, `updateReviewComment`,
  `deleteReviewComment` and `deleteReviewCommentAttachment` through the composition root, and
  subscribes to stored changes so a note created from the page appears without a manual
  refresh. Screenshots render as numbered plates (`Fig. 1 · Viewport`, `Fig. 2 · Element
  crop`) with independent two-step removal; a failed capture renders its reason instead.
- `content-script.js` (built separately as an IIFE from `src/content/index.ts`, declared in
  `manifest.content_scripts` for `http(s)` pages) is the page driving adapter. On load it asks
  the service worker for `loadOverlayState(location.href)`; only an explicitly active session
  mounts the shadow-DOM overlay. While it is mounted, hovering highlights the element under
  the pointer and clicking pins it: the page click is intercepted, the inline composer asks
  for the required text plus category/priority, and the note is created through the service
  worker → `addReviewComment` → repository. `Escape` cancels the composer and `Shift+Escape`
  stops the session. Without an active session nothing is injected and page events are
  untouched.
- Screenshots are captured on the extension side, never by the page: the overlay hides its
  host (composer, pins, badge, highlight) and waits for a paint, then the service worker runs
  `captureCommentEvidence` through `ChromeScreenshotCaptureAdapter`
  (`chrome.tabs.captureVisibleTab` for the tab's window, `createImageBitmap` +
  `OffscreenCanvas` for the element crop scaled from CSS pixels to image pixels). The overlay
  is restored as soon as the save response arrives, so captured images show the page itself.
- The `host_permissions: ["<all_urls>"]` entry is required because
  `chrome.tabs.captureVisibleTab` accepts only `<all_urls>` or the short-lived `activeTab`
  grant, and `activeTab` is revoked by a page reload while a review session survives it. The
  content script remains declared for `http(s)` only; pixels and DOM evidence stay in the
  local browser profile.
- Transport messages are versioned and namespaced in `src/adapters/chrome/review-messages.ts`
  (`ui-review:overlay-sync`, `ui-review:comment-create`, `ui-review:stop-session`,
  `ui-review:review-changed`); unknown payloads are rejected by type guards before any use
  case runs.
- Sessions are stored in IndexedDB (`ui-review` database, `review-sessions` store), screenshots
  included as inline data URLs; after a reload the side panel restores the current page's
  session and its notes by page URL, and the overlay rebuilds its pins from each comment's DOM
  fingerprint. No data leaves the machine; the native bridge and artifact paths arrive in
  later issues.
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
  `IdGeneratorPort`, `ActivePagePort` and `ScreenshotCapturePort` each have a contract test
  run against both implementations (the Chrome capture adapter is exercised with stubbed
  extension globals for the three capture scenarios).
- `tests/adapters/session-resume.test.ts` writes with one set of adapter instances and reads
  back with fresh ones, proving the reload/resume acceptance criterion through the real
  IndexedDB adapter.
- `tests/adapters/comment-round-trip.test.ts` runs the real message router with the real use
  cases over the in-memory repository: a page-created comment reaches both the side-panel read
  model and the overlay read model after a simulated reload.
- `tests/content/` covers DOM fingerprinting/anchoring, attribute/style capture, the
  form-value boundary and the overlay interaction (highlight, composer, blank-text refusal,
  capture masking, `Escape`/`Shift+Escape`, pin rendering) under happy-dom;
  `tests/content/bootstrap.test.ts` proves the content script injects nothing without an
  active session.
- `tests/core/redaction.test.ts` serializes DOM evidence containing passwords, tokens and
  credential URLs — http(s), `wss:`, `ftp:`, custom deep links, relative and
  protocol-relative, including fragments — and asserts none of them survive;
  `tests/core/capture-comment-evidence.test.ts`
  covers the confirmed/inferred/unavailable capture outcomes, the screenshot-to-comment
  linkage, independent attachment deletion and the resilience paths.
- UI tests run under happy-dom and assert accessible structure, not implementation details.
- `tests/architecture/core-boundaries.test.ts` guards the dependency rule.
- `tests/extension/manifest.test.ts` guards the MV3 manifest and its entry points, including
  the content-script declaration and the capture host permission.

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
   leaves review mode). Notes appear in the panel immediately with their viewport and crop
   screenshots, and survive a page or panel reload; edit, preview, remove a screenshot or
   delete them from the panel. **Stop review** ends the session, rename it inline, and
   **Clear session** (with confirmation) deletes it.
