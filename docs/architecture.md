# Architecture

UI Review is a local-first Chrome MV3 extension with a companion native bridge. The same
clean/hexagonal rules apply to both: dependencies point inward only, the domain knows nothing
about its hosts, and every port has at least two real implementations.

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
| `src/core/bridge/` | Versioned bridge protocol + base64 codec + path-slug rules, shared with the native bridge | nothing |
| `src/core/handoff/` | Versioned agent brief schema (`review.json` v1), deterministic builder, Markdown renderer and strict parser, shared with the bridge | `src/core/bridge` codec/slug + model |
| `src/core/ports/` | Driven interfaces declared by the domain | `src/core/model` |
| `src/core/usecases/` | Core use cases / read models | `model` + `ports` |
| `src/core/index.ts` | Public barrel — the only entry point for the core | core internals |
| `src/adapters/persistence/in-memory/` | Ephemeral repository (tests, previews) | `@core` |
| `src/adapters/persistence/indexeddb/` | Durable repository (browser profile) | `@core` |
| `src/adapters/runtime/` | Host facts: Chrome runtime, system clock, crypto ids, Navigator clipboard + deterministic doubles, in-process bridge | `@core` + bridge core |
| `src/adapters/local-bridge/` | Shared mapping of bridge responses to typed port results | `@core` |
| `src/adapters/frameworks/` | Framework inspection adapters: self-contained React/Next main-world detector (Vue/Nuxt later) | `@core` types |
| `src/adapters/chrome/` | Chrome integrations (side panel wiring, active tab, review transport, change channel, main-world component-context transport, Native Messaging client) | `@core` + `@app` types |
| `src/app/` | Composition root: adapters → use cases + application gateways | `@core` + adapters |
| `src/sidepanel/` | Driving adapter: side-panel view (plain DOM) | `@app` + `@core` types |
| `src/content/` | Driving adapter: page overlay (shadow DOM), DOM anchor capture | `@core` types + transport |
| `src/background/` | MV3 service worker entry point | `@adapters/chrome` |
| `src/bridge/core/` | Native bridge domain: request handler, artifact path builder, artifact store + handoff writer + OS path ports | `src/core/bridge` + `src/core/handoff` |
| `src/bridge/adapters/fs/` | Durable filesystem artifact store and temporary handoff writer (containment + symlink guards) | bridge core |
| `src/bridge/adapters/in-memory/` | Portable artifact store and handoff writer used by tests and the in-process adapter | bridge core |
| `src/bridge/adapters/os/` | macOS / Windows / Linux application-data directories | bridge core |
| `src/bridge/adapters/native-messaging/` | stdio framing + server loop (no HTTP, no socket) | `src/core/bridge` |
| `src/bridge/main.ts` | Bridge composition root / executable entry point | bridge core + adapters |
| `src/bridge/native-messaging-host/` | Host manifest template used by the dev installer | — |
| `scripts/dev.mjs` | Runs all three build watchers (extension ESM, content-script IIFE, bridge ESM) | Vite |
| `scripts/install-bridge-host.mjs` | Development install/remove of the Native Messaging host | Node |
| `scripts/bridge-smoke.mjs` | Spawns the built bridge and round-trips a real frame exchange | Node |
| `vite.content.config.ts` | Second build pass emitting `dist/content-script.js` as an IIFE | Vite |
| `vite.bridge.config.ts` | Third build pass emitting the Node bridge executable `dist/bridge/main.js` | Vite |
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
  observation captured when a reviewer pins an element; `createFrameworkEvidence()` assembles
  a best-effort component observation (`FrameworkObservation`: framework kind, nearest
  component name, ancestor chain, confidence) and re-validates/bounds everything a page or an
  adapter reports. `visual` evidence records the screenshot outcome per part
  (`captured` / `failed`) with a non-blank reason whenever a capture failed — it never
  silently claims an image exists. A framework observation is always recorded, including the
  explicit `unavailable` one, so the brief never has to guess whether detection ran.
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

Bridge protocol (`src/core/bridge/`, shared by both processes, pure):

- `BRIDGE_PROTOCOL_VERSION`, `BRIDGE_HOST_NAME` and exactly four allowlisted operations:
  `bridge.health`, `artifact.write`, `artifact.read`, `handoff.materialize`. Anything else is
  rejected before any handler runs.
- Request envelope: `{ protocolVersion, requestId, operation, origin, payload }`; response:
  `{ protocolVersion, requestId, ok, result | error }` with typed error codes
  (`protocol-mismatch`, `origin-not-allowed`, `unsupported-brief-version`,
  `invalid-artifact-name`, `artifact-too-large`, `invalid-base64`, `path-not-allowed`,
  `artifact-not-found`, `io-error`, …).
- Strict parsers (`parseBridgeEnvelope`, `parseBridgePayload`, `parseBridgeResponse`) validate
  exact keys, protocol version, operation allowlist, origin shape, safe path segments
  (conservative slugs, Windows device names refused) and canonical base64. Artifact content is
  decoded once during validation and bounded by `BRIDGE_MAX_ARTIFACT_BYTES` (16 MiB, below
  Chrome's 64 MiB extension→host limit).
- `handoff.materialize` carries `{ sessionId, brief, files[] }` where `brief` is a
  `ReviewBriefDocument` and each file is an allowlisted image with canonical base64 content.
  The parser validates the versioned brief against the shared schema, requires the brief to
  belong to the session, bounds the file count and total bytes, and enforces a one-to-one match
  between the file names the brief references and the files provided. The bridge renders
  `review.md` from the validated document, so it can point at the real absolute paths it is
  about to write; the response returns the directory, the file paths and the exact Markdown.
- `encodeBase64` / `decodeBase64` — dependency-free, canonical-only codec; anything that is
  not canonical base64 is refused instead of silently repaired.

Agent brief (`src/core/handoff/`, pure, shared with the bridge):

- `REVIEW_BRIEF_SCHEMA_VERSION = 1`, `review.md` / `review.json` file names and the image
  media allowlist (`image/png`, `image/jpeg`, `image/webp`), with `REVIEW_BRIEF_MAX_FILES`
  (100), per-file (16 MiB) and total (32 MiB) bounds.
- `ReviewBriefDocument` — the versioned `review.json` schema: generated timestamp, session
  identity/status/timestamps, and one entry per comment with its 1-based index, id, text,
  category, priority, timestamps, evidence (DOM, framework, source-map, visual payloads with
  their confidence; absent payloads are `null`) and attachments (`kind`, mime type, dimensions,
  byte length, `file` name or an explicit `unavailableReason`). This is the schema documented
  for agents and validated at both ends.
- `buildReviewBrief(session, { generatedAt })` — deterministic builder: comments keep their
  stored order, file names come from the comment index and attachment kind, repeated
  attachments get a numeric suffix, and an attachment the bridge cannot materialize (external
  artifact, unsupported format, unreadable data URL) becomes `file: null` with a reason
  instead of a dangling path.
- `renderReviewBriefMarkdown(brief, paths)` — deterministic, concise Markdown with the review
  context, the temporary-directory explanation, the agent instructions (change only the scoped
  items, report exactly one result per comment id, expected response format) and one section
  per comment with DOM/framework/source-map context, confidence labels and absolute image
  paths.
- `parseReviewBriefDocument` / `validateReviewBriefBundle` — strict versioned validation used
  by the wire parser and by the export use case before any bridge call.

Ports:

- `ReviewSessionRepository` — `describe()`, `save()`, `findById()`, `list()`, `delete()`.
  Implementations: `InMemoryReviewSessionRepository`, `IndexedDbReviewSessionRepository`.
- `RuntimeInfoPort` — `read()` returns extension name/version and runtime label.
  Implementations: `ChromeRuntimeInfoAdapter`, `StaticRuntimeInfoAdapter`.
- `ActivePagePort` — `read()` returns the focused page (url, title) or `null`.
  Implementations: `ChromeActivePageAdapter` (`chrome.tabs`), `StaticActivePageAdapter`.
- `ComponentContextPort` — `detect({ tabId, frameId, fingerprint })` returns the best-effort
  framework component context of the pinned element as a neutral `FrameworkObservation`.
  Expected failures (no frame, restricted page, missing metadata) are explicit `unavailable`
  observations, never exceptions. Implementations: `ChromeComponentContextAdapter` (runs the
  self-contained React/Next detector from `src/adapters/frameworks/react/` in the page main
  world through `chrome.scripting.executeScript({ world: 'MAIN' })` and validates the value
  that crosses back; needs the `scripting` permission) and `FakeComponentContextAdapter`
  (scriptable test double that records requests). The shared contract test runs against both.
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
- `LocalBridgePort` — `checkHealth()`, `writeArtifact(input)`, `readArtifact(ref)`,
  `materializeHandoff(input)`. Expected failures are typed (`bridge-unavailable`,
  `bridge-rejected`, `invalid-response`, `artifact-not-found`, `invalid-brief`, …) with the
  bridge error code when one was returned. Implementations:
  `ChromeNativeMessagingBridgeAdapter` (`chrome.runtime.sendNativeMessage` over the versioned
  protocol; needs the `nativeMessaging` permission) and `InMemoryLocalBridgeAdapter` (runs the
  real bridge handler, in-memory artifact store and handoff writer in-process, so tests and
  previews exercise the exact protocol logic without spawning a process). The shared contract
  test runs against both.
- `ClipboardPort` — `writeText(text)` returns `{ ok: true }` or a typed
  `clipboard-unavailable` failure, so the side panel never calls `navigator.clipboard` itself.
  Implementations: `NavigatorClipboardAdapter` (needs the `clipboardWrite` permission),
  `InMemoryClipboardAdapter` (records the last text and can be scripted to fail). The shared
  contract test runs against both.

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
  Each comment summary carries its screenshot previews (`dataUrl` when inline), its explicit
  capture outcome and its best-effort framework context, so the view never reads the
  aggregate. The UI learns persistence facts from the descriptor, never from adapter
  internals.
- `addReviewComment({ sessionId, text, pageUrl, viewport, category?, priority?, anchor? })` —
  adds one comment to an **active** session of the same page, with its optional DOM anchor
  assembled into a `confirmed` DOM evidence linked by comment id. Blank text, invalid anchors
  and mismatched pages are refused with typed failures; nothing is written.
- `captureCommentEvidence({ sessionId, commentId, capture })` — asks `ScreenshotCapturePort`
  for the viewport screenshot and element crop of the pinned element and
  `ComponentContextPort` for its component context, then appends the attachments, one
  `visual` evidence record and one `framework` evidence record, all linked to the comment id.
  Visual confidence is `confirmed` when both images exist, `inferred` when only one does and
  `unavailable` otherwise; framework confidence comes from the inspection adapter
  (`confirmed` only for development metadata, `inferred` for production-like metadata).
  A missing tab context, a throwing adapter or a malformed observation becomes explicit
  failed/unavailable evidence, so the text/DOM comment always survives. Capture failures are
  never thrown.
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
- `checkLocalBridge({ bridge })`, `storeSessionArtifact({ bridge }, input)`,
  `readSessionArtifact({ bridge }, ref)`, `materializeReviewHandoff({ bridge }, input)` —
  validate inputs before the wire (safe session ids and names, allowlisted media type,
  non-empty and bounded content, versioned brief matching its files) and turn a throwing port
  into a typed `bridge-unavailable` failure. Callers never build a bridge envelope.
- `exportReviewHandoff({ sessionId })` — refuses a missing session and an empty one, builds the
  versioned brief from the stored session, materializes `review.md` / `review.json` / images
  through `LocalBridgePort`, then copies the exact Markdown returned by the bridge through
  `ClipboardPort`. Every failure is typed; the persisted session is never modified or deleted,
  and a clipboard failure leaves the materialized artifacts in place.

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
  crop`) with independent two-step removal; a failed capture renders its reason instead, and
  the framework badge reads `detected`, `inferred (best effort)` or `unavailable` — never
  more than the inspection adapter actually observed.
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
- Framework component context is read in the page's **main world**, because React attaches
  its fiber objects as JavaScript expandos (`__reactFiber$…`) that an isolated content script
  can never see. The detection function is self-contained, bounded (ancestor, fiber and chain
  caps), never throws, and is injected on demand by `chrome.scripting.executeScript({
  world: 'MAIN' })` only after an active session accepted the comment: no page is inspected
  before `Start review`, and the returned value is re-validated before it enters the core.
  The `scripting` permission is required for that call; a missing frame, a restricted page or
  a minified build degrades to an explicit `unavailable`/`inferred` observation and never
  blocks the note. Development builds are recognised by React's `_debugOwner`/`_debugSource`
  markers, so a production name is never presented as confirmed source truth.
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
  fingerprint. No data leaves the machine.
- `Start review` is the only entry point of inspection: the panel itself never captures
  anything, and ineligible pages (`chrome://`, `file://`, …) get a disabled action with an
  explanation.
- The `tabs` permission is required so `ChromeActivePageAdapter` can report the focused page
  URL and title and so the service worker can push overlay syncs to the matching tabs; the
  core and the UI still never call `chrome.*` directly. The `scripting` permission is used
  only for the on-demand main-world component detection described above.
- The `nativeMessaging` permission lets the composition root's
  `ChromeNativeMessagingBridgeAdapter` round-trip health, artifact and handoff requests through
  the host manifest. The `clipboardWrite` permission lets `NavigatorClipboardAdapter` copy the
  generated brief; both are behind ports, and the panel only sees `exportReviewHandoff`.
- **Agent handoff:** `Copy agent brief` in the Session section runs the
  `exportReviewHandoff` use case: the core builds the versioned brief from the stored session,
  the bridge materializes `review.md`, `review.json` and the referenced screenshots into
  `<OS temp>/ui-review/handoff/<sessionId>`, and the exact Markdown returned by the bridge is
  copied to the clipboard. Exporting again replaces the same directory, so copies never
  accumulate; the persistent session is never modified. The panel disables the action while
  the session has no notes and shows an explicit notice with the directory path on success, or
  a typed failure (bridge missing, clipboard refused) otherwise. The Markdown explains the
  temporary-path behavior and tells the agent to modify only the scoped review items and to
  report one result per comment id.

## Native bridge

- `dist/bridge/main.js` is a Node ESM bundle built from `src/bridge/main.ts`; Chrome launches
  it as a Native Messaging host (`stdio`), never through a server. No HTTP listener, socket or
  port is ever created — `tests/architecture/bridge-boundaries.test.ts` rejects
  `node:http`/`node:https`/`node:net`/`createServer`/`.listen(` anywhere in `src/bridge`, and
  `console.log` is banned because stdout is the protocol pipe (diagnostics go to stderr).
- Framing is the Native Messaging protocol: a 4-byte little-endian length prefix followed by
  UTF-8 JSON. Chrome's size limits apply: extension→host messages may reach 64 MiB, but
  host→extension messages are capped at 1 MiB. The bridge accepts artifacts up to 16 MiB
  decoded; large artifacts are meant to be handed to the agent by local path (issue #6),
  not read back through a 1 MiB response.
- Trust chain: (1) the host manifest's `allowed_origins` restricts which extension may launch
  the host; (2) the installer's launcher exports `UI_REVIEW_BRIDGE_ALLOWED_ORIGINS`, and the
  host fails closed when it is unset; (3) the host compares Chrome's authoritative caller
  origin (`argv[2]`) with the allowlist at startup; (4) the handler rejects an envelope whose
  `origin` is not allowlisted; (5) the payload is validated before storage. A message that
  fails envelope, origin or payload validation never touches the filesystem.
- Storage lives behind `AppDataPathsPort` in the OS application-data directory (macOS
  `~/Library/Application Support`, Windows `%APPDATA%`, Linux
  `$XDG_DATA_HOME`/`~/.local/share`): `<app-data>/ui-review/sessions/<sessionId>/artifacts/<name>`
  with a metadata sidecar in `metadata/`. `UI_REVIEW_BRIDGE_DATA_ROOT` overrides the durable
  root for development and smoke tests.
- Temporary handoffs live under the OS temp root (`os.tmpdir()`: `/tmp` on macOS, the Windows
  temp equivalent) in `<temp>/ui-review/handoff/<sessionId>/`; the filesystem handoff writer
  replaces the whole session directory on every materialization, so `review.md`,
  `review.json` and the images always describe the same export and stale files disappear.
  `UI_REVIEW_BRIDGE_HANDOFF_ROOT` overrides that root for development and smoke tests.
- Path safety: the pure path builder only emits validated slug segments; the filesystem store
  resolves every path and verifies containment after symlink resolution, refusing symlinked
  session folders or artifact files with `path-not-allowed`. A missing artifact returns
  `artifact-not-found`; corrupted metadata returns `io-error` instead of a guessed media type.
  The handoff writer applies the same containment and symlink checks, and writes `review.md`
  last so the brief never references an image that does not exist yet.
- Development installation: `npm run build`, then
  `npm run bridge:install [-- --extension-id <id>]`. The installer copies the bundle into
  `<app-data>/ui-review/bridge/` (on macOS Chrome cannot execute a launcher under a
  TCC-protected folder such as `~/Documents`), writes the per-platform launcher and host
  manifest, and computes the unpacked extension id from `dist/` when none is passed.
  `npm run bridge:uninstall` removes the registration, the launcher and the installed bundle,
  while leaving persisted sessions intact. `npm run bridge:smoke` spawns the built executable
  and round-trips health, write, read and handoff frames.
- Windows: the installer writes the manifest and prints the `reg add` command; packaged
  installers and standalone binaries arrive in issue #10.

## Testing strategy

- Core tests import only the `@core` barrel and exercise public behaviour.
- The same `ReviewSessionRepository` contract test runs against the in-memory and IndexedDB
  adapters, so the test double cannot drift from the durable store. `ClockPort`,
  `IdGeneratorPort`, `ActivePagePort`, `ScreenshotCapturePort` and `ComponentContextPort`
  each have a contract test run against both implementations (the Chrome capture adapter is
  exercised with stubbed extension globals for the three capture scenarios; the Chrome
  component adapter is exercised with a stubbed `chrome.scripting.executeScript` and asserts
  the `world: 'MAIN'` call, the frame targeting and the rejection of malformed page results).
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
- `tests/adapters/react-component-context.test.ts` exercises the self-contained main-world
  detector: a development fiber fixture yields the nearest component and its ancestor chain as
  `confirmed`, production-like fibers stay `inferred`, plain pages and anonymous fibers are
  explicit `unavailable`/named-less outcomes, Next.js falls back to `__NEXT_DATA__`, and
  memo/forwardRef, hostile getters, cyclic chains, missing elements and length caps never
  throw. `tests/core/framework-evidence.test.ts` guards the evidence factory (vocabulary,
  blank names, bounds) and `tests/ui/review-panel-view.test.ts` proves `inferred` is never
  labelled as detected.
- `tests/core/review-brief.test.ts` builds briefs from real captured sessions, proves the
  deterministic ordering/file names and the explicit unavailable-attachment states, renders
  the Markdown and re-parses the exported JSON with the documented schema (including unknown
  versions, unknown fields and dangling file names);
  `tests/core/export-review-handoff.test.ts` runs the whole export use case over the in-memory
  repository, the in-process bridge and the in-memory clipboard: idempotent directory reuse,
  per-comment ordering after a deletion, bridge failure and clipboard failure both leaving the
  persisted session intact.
- `tests/bridge/handoff-writer.contract.ts` runs against the in-memory and filesystem handoff
  writers (plan purity, directory replacement, isolation, traversal refusals), with
  filesystem-specific symlink-escape cases; `tests/bridge/handle-request.test.ts` covers the
  handoff operation and `tests/bridge/executable.test.ts` materializes a real handoff over the
  real Native Messaging framing.
- UI tests run under happy-dom and assert accessible structure, not implementation details.
- `tests/bridge/` covers the request handler, the path builder, both artifact stores (one
  shared contract plus symlink-escape cases for the filesystem store), the OS app-data paths
  (the same contract run against the macOS, Windows and Linux adapters) and the stdio framing
  and server. `tests/bridge/executable.test.ts` builds the real executable with Vite, spawns
  it and speaks the real Native Messaging framing, including the fail-closed startup paths and
  a handoff materialization into a controlled temp root.
- `tests/architecture/bridge-boundaries.test.ts` guards the pure bridge core and the absence
  of network listeners or stdout logging.
- `tests/architecture/core-boundaries.test.ts` guards the dependency rule.
- `tests/extension/manifest.test.ts` guards the MV3 manifest and its entry points, including
  the content-script declaration, the capture host permission and the `scripting` permission
  used by the main-world component detection.

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
| `npm run bridge:install` | Build the bridge, install the Native Messaging host (dev) |
| `npm run bridge:uninstall` | Remove the host registration, launcher and installed bundle |
| `npm run bridge:smoke` | Spawn the built bridge and round-trip health/write/read/handoff frames |

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
5. Install the bridge (`npm run bridge:install`, then reload the extension) and click
   **Copy agent brief** in the Session section to materialize the brief and copy it; the panel
   shows the temporary handoff directory, whose `review.md`, `review.json` and screenshots can
   be handed to a coding agent.
