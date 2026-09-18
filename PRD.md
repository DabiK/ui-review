# PRD — DabiK/ui-review

Backlog généré depuis les issues GitHub ouvertes. Chaque item est une tâche.
Coche la case quand la tâche est terminée. Une seule tâche par itération Ralph.

## Direction design (lead)

« Editorial margin notes » : voir `docs/design/DESIGN.md` et la référence
`docs/design/sidebar-b-editorial.png`. À appliquer à tout ticket UI (#1 shell, #2, #3, #4, #6).
Lead à respecter en esprit (tokens, filets fins, index numéroté, typo serif/sans/mono), pas du
pixel-perfect. Textes UI en anglais.

## Architecture (exigence centrale)

Hexagonale / clean stricte, front ET back : dépendances vers l'intérieur uniquement, cœur de
domaine sans import Chrome/DOM/framework/Node/OS, ports définis par le domaine + adaptateurs,
au moins deux implémentations réelles par port, aucun accès direct `chrome.*`/stockage depuis
l'UI ou le core. Détails dans `progress.txt`.

- [x] #1 — Bootstrap the clean architecture and agent workflow (labels: area:architecture, area:quality, ready-for-agent)

  **Issue #1 — détail complet**
  > # 01 — Bootstrap the clean architecture and agent workflow
  >
  > **Blocked by:** none  
  > **Labels:** `area:architecture`, `area:quality`, `ready-for-agent`
  >
  > ## Outcome
  >
  > Establish a runnable Chrome MV3 extension foundation whose domain is independent of Chrome and whose changes can safely be implemented and reviewed by separate agents.
  >
  > ## Scope
  >
  > - Set up the TypeScript workspace, Chrome MV3 manifest, development commands, linting, typechecking and test commands.
  > - Create a small, deep `review-core` module with the canonical vocabulary: `ReviewSession`, `ReviewComment`, `Evidence`, `Attachment`, and `Confidence`.
  > - Keep Chrome UI and persistence outside the core. Define only interfaces that have two real implementations immediately (for example in-memory test repository and IndexedDB repository).
  > - Add the extension shell with a side-panel status view proving that the extension loads.
  > - Write `AGENTS.md` and a PR template: one implementation subagent per issue/worktree, a distinct review subagent, no unrelated refactors, required checks and evidence in PRs.
  > - Document the module map and public interfaces in `docs/architecture.md`.
  >
  > ## Acceptance criteria
  >
  > - [ ] A clean Chrome profile can load the unpacked extension and open its side panel.
  > - [ ] `review-core` has no imports from Chrome APIs, DOM APIs, React, or adapter modules.
  > - [ ] Core tests exercise the public interfaces only and pass.
  > - [ ] `lint`, `typecheck`, unit tests and build run successfully from a documented command.
  > - [ ] `AGENTS.md` requires separate implementation and review agents for future issue work.
  >
  > ## Review focus
  >
  > Confirm depth and locality: callers must not assemble domain state or know adapter internals.
  >

- [x] #2 — Start, persist, resume and clear a review session (labels: area:extension, area:ux, blocked)

  **Issue #2 — détail complet**
  > # 02 — Start, persist, resume and clear a review session
  >
  > **Blocked by:** #1  
  > **Labels:** `area:extension`, `area:ux`, `ready-for-agent` after #1
  >
  > ## Outcome
  >
  > Give the reviewer a frictionless session lifecycle in the Chrome side panel: start explicitly, resume after reload, rename, and clear deliberately.
  >
  > ## Scope
  >
  > - Add `Start review` and `Stop review` actions scoped to the current tab.
  > - Create an automatic session name from hostname and timestamp; make it editable in the side panel.
  > - Persist sessions and their state through the repository port; restore them after extension/browser reload.
  > - Require explicit confirmation before clearing a session and delete its associated core records through one use case.
  > - Render empty, active and stopped states accessibly.
  >
  > ## Acceptance criteria
  >
  > - [ ] No inspection starts until `Start review` is clicked for an eligible current tab.
  > - [ ] Closing/reopening the side panel or reloading the page preserves the active session and its name.
  > - [ ] Renaming updates the persisted session.
  > - [ ] Clear removes the selected session only after confirmation and leaves other sessions intact.
  > - [ ] Keyboard focus and labels make all lifecycle controls usable without a mouse.
  >
  > ## Review focus
  >
  > Review the state transitions as a single core use case; UI must not mutate persistence directly.
  >

- [x] #3 — Annotate any page element with click-to-pin (labels: area:extension, area:ux, blocked)

  **Issue #3 — détail complet**
  > # 03 — Annotate any page element with click-to-pin
  >
  > **Blocked by:** #2  
  > **Labels:** `area:extension`, `area:ux`, `ready-for-agent` after #2
  >
  > ## Outcome
  >
  > Deliver the core human interaction: hover an element, click it, write a review remark, and see a durable pin plus a live side-panel list.
  >
  > ## Scope
  >
  > - Inject an isolated overlay only while the session is active.
  > - Highlight the element under the pointer without breaking page controls when review mode is off.
  > - On click, create a pin and an inline composer with required text plus optional category and priority.
  > - Default category to `UI` and priority to `important`.
  > - Persist the comment through the core use case; show, edit and delete it from the side panel.
  > - Support `Esc` to cancel an in-progress annotation and a documented keyboard path to leave review mode.
  >
  > ## Acceptance criteria
  >
  > - [ ] A reviewer can create, edit and delete a pin on a normal website without navigating away.
  > - [ ] The corresponding side-panel row and on-page pin stay synchronized after a reload.
  > - [ ] The overlay does not intercept page clicks when review mode is stopped.
  > - [ ] A comment cannot be saved with blank text.
  > - [ ] Each saved comment has stable ID, URL, viewport and timestamp.
  >
  > ## Review focus
  >
  > Exercise the complete interaction on a plain HTML fixture and a client-rendered fixture; reject visual regressions and event-leakage.
  >

- [x] #4 — Capture useful evidence while protecting sensitive data (labels: area:privacy, area:extension, blocked)

  **Issue #4 — détail complet**
  > # 04 — Capture useful evidence while protecting sensitive data
  >
  > **Blocked by:** #3  
  > **Labels:** `area:extension`, `area:privacy`, `ready-for-agent` after #3
  >
  > ## Outcome
  >
  > Enrich each pin with technical context and two reviewable screenshots without exporting secrets or forcing the reviewer to trust an opaque capture.
  >
  > ## Scope
  >
  > - Capture a stable DOM fingerprint, relevant ancestry, visible text, accessible role/name, selected attributes, bounding box, viewport and useful computed styles.
  > - Capture one viewport screenshot and one element crop per comment.
  > - Never collect form values; redact secret-like keys and attributes (`password`, `token`, `secret`, authorization values and similar).
  > - Add screenshot previews and per-attachment deletion in the side panel before handoff.
  > - Model capture confidence and capture failures explicitly rather than silently producing misleading evidence.
  >
  > ## Acceptance criteria
  >
  > - [ ] A saved comment has DOM and visual evidence linked by its stable comment ID.
  > - [ ] Password/input values and known secret-like attributes do not appear in serialized evidence.
  > - [ ] The user can preview and remove either screenshot independently.
  > - [ ] A screenshot failure leaves a usable text/DOM comment with an explicit failure state.
  > - [ ] Tests cover redaction and screenshot-to-comment linkage.
  >
  > ## Review focus
  >
  > Inspect all serialization paths for accidental disclosure and verify screenshots match the intended selected element.
  >

- [x] #5 — Build the secure Native Messaging bridge and artifact store (labels: area:architecture, area:bridge, blocked)

  **Issue #5 — détail complet**
  > # 05 — Build the secure Native Messaging bridge and artifact store
  >
  > **Blocked by:** #1  
  > **Labels:** `area:bridge`, `area:architecture`, `ready-for-agent` after #1
  >
  > ## Outcome
  >
  > Introduce a narrow, authenticated bridge between the extension and a local executable, with no localhost server and durable artifact storage outside `/tmp`.
  >
  > ## Scope
  >
  > - Specify a versioned request/response protocol with allowlisted operations only.
  > - Implement the companion bridge as a TypeScript executable with a Native Messaging host manifest.
  > - Store session artifacts under the OS application-data directory; keep the storage location behind an OS adapter.
  > - Validate message schema, extension origin and path construction; reject unknown messages.
  > - Provide a fake bridge adapter for automated tests.
  > - Document local development installation and how to remove the host safely.
  >
  > ## Acceptance criteria
  >
  > - [ ] The extension can round-trip a health check and a write/read artifact request through Native Messaging.
  > - [ ] No HTTP listener or open localhost port is created.
  > - [ ] Invalid protocol payloads are rejected without writing files.
  > - [ ] Artifact paths cannot escape the per-session storage root.
  > - [ ] macOS and Windows path behavior are covered by unit tests or OS-adapter contract tests.
  >
  > ## Review focus
  >
  > Treat protocol and filesystem validation as security-sensitive; review with an independent subagent.
  >

- [x] #6 — Copy an agent-ready review brief and materialize its artifacts (labels: area:ux, area:bridge, blocked)

  **Issue #6 — détail complet**
  > # 06 — Copy an agent-ready review brief and materialize its artifacts
  >
  > **Blocked by:** #4, #5  
  > **Labels:** `area:bridge`, `area:ux`, `ready-for-agent` after #4 and #5
  >
  > ## Outcome
  >
  > Turn a completed review into one clipboard action that gives a local coding agent a readable Markdown brief and real local paths to JSON and screenshots.
  >
  > ## Scope
  >
  > - Materialize `review.md`, `review.json` and referenced images into a per-session temporary handoff directory (`/tmp` on macOS and the Windows temp equivalent).
  > - Generate concise Markdown with review context, numbered comments, category/priority, evidence confidence, DOM/framework context, image paths and the expected agent response format.
  > - Copy the Markdown to the clipboard from the side panel.
  > - Make handoff generation idempotent and update the existing session directory rather than leaving unbounded copies.
  > - Explain the temporary-path behavior in UI and docs.
  >
  > ## Acceptance criteria
  >
  > - [ ] A user can copy a brief that contains every non-deleted comment once, ordered deterministically.
  > - [ ] Every image path in `review.md` points to an existing local artifact at export time.
  > - [ ] `review.json` validates against a documented versioned schema.
  > - [ ] The generated brief tells an agent to modify only scoped review items and report one result per comment ID.
  > - [ ] Export failures are visible and do not delete the persistent review session.
  >
  > ## Review focus
  >
  > Use a separate agent to validate the generated brief against a realistic coding-agent handoff, not just string snapshots.
  >

- [ ] #7 — Detect React and Next.js component context as best effort (labels: area:extension, area:adapters, blocked)

  **Issue #7 — détail complet**
  > # 07 — Detect React and Next.js component context as best effort
  >
  > **Blocked by:** #3  
  > **Labels:** `area:adapters`, `area:extension`, `ready-for-agent` after #3
  >
  > ## Outcome
  >
  > Enrich a clicked DOM element with the nearest available React/Next component ownership context while preserving the generic DOM workflow when no framework metadata exists.
  >
  > ## Scope
  >
  > - Add a React/Next adapter behind the inspection module’s narrow public interface.
  > - Discover available ownership/component metadata without making production-only guarantees.
  > - Return component name, ancestor component chain and confidence level when available.
  > - Ensure failures, minified builds and non-React pages return generic evidence rather than errors.
  > - Display framework evidence as `detected`, `inferred` or `unavailable`.
  >
  > ## Acceptance criteria
  >
  > - [ ] React development fixture produces a nearest component and ancestor chain where metadata exists.
  > - [ ] Plain HTML and non-React fixtures continue to create comments normally.
  > - [ ] The UI never labels inferred component context as confirmed source truth.
  > - [ ] The adapter can be disabled or fails safely without breaking annotation.
  > - [ ] Tests cover all confidence outcomes.
  >
  > ## Review focus
  >
  > Reject coupling from the core to React internals; component detection must stay inside its adapter.
  >

- [ ] #8 — Resolve source-map context with explicit confidence (labels: area:privacy, area:adapters, blocked)

  **Issue #8 — détail complet**
  > # 08 — Resolve source-map context with explicit confidence
  >
  > **Blocked by:** #7  
  > **Labels:** `area:adapters`, `area:privacy`, `ready-for-agent` after #7
  >
  > ## Outcome
  >
  > When a React/Next reference and a usable source map exist, add source file/line evidence to the review without pretending arbitrary DOM nodes have a source location.
  >
  > ## Scope
  >
  > - Detect available source maps and resolve eligible compiled locations to original source references.
  > - Record source result as confirmed, inferred or unavailable with explanatory reason.
  > - Avoid exposing source content unnecessarily; store minimal file reference and line/column.
  > - Degrade safely for missing, inaccessible or invalid maps.
  > - Document optional local project-origin mapping as a later fallback, not a requirement for this ticket.
  >
  > ## Acceptance criteria
  >
  > - [ ] A source-map fixture resolves a known compiled position to expected source file and line.
  > - [ ] Missing/invalid maps produce an explicit unavailable state and do not block export.
  > - [ ] Reports distinguish a resolved mapping from framework inference.
  > - [ ] Source-map requests follow the extension’s explicit active-review permission model.
  > - [ ] Tests cover success, missing map and invalid map paths.
  >
  > ## Review focus
  >
  > Verify that the implementation does not claim a component-file relationship when it only knows a bundle mapping.
  >

- [ ] #9 — Add Vue and Nuxt component context adapter (labels: area:extension, area:adapters, blocked)

  **Issue #9 — détail complet**
  > # 09 — Add Vue and Nuxt component context adapter
  >
  > **Blocked by:** #3  
  > **Labels:** `area:adapters`, `area:extension`, `ready-for-agent` after #3
  >
  > ## Outcome
  >
  > Add Vue/Nuxt component context through the same inspection module interface, without changing generic annotation behavior or React code.
  >
  > ## Scope
  >
  > - Implement a Vue/Nuxt adapter that discovers closest component metadata when exposed.
  > - Produce component name, parent chain and confidence using the canonical core evidence model.
  > - Provide development and production-like fixture coverage.
  > - Keep framework-specific internals isolated in the adapter.
  >
  > ## Acceptance criteria
  >
  > - [ ] A Vue fixture returns nearest available component context.
  > - [ ] A Nuxt fixture follows the same exported evidence schema.
  > - [ ] Pages without Vue still annotate normally.
  > - [ ] No React adapter code changes are required other than shared contract evolution approved by review.
  > - [ ] Confidence is rendered and exported consistently with React evidence.
  >
  > ## Review focus
  >
  > Compare adapter behavior against the React adapter’s public contract, not its implementation details.
  >

- [ ] #10 — Package and install the bridge on macOS and Windows (labels: area:release, area:bridge, blocked)

  **Issue #10 — détail complet**
  > # 10 — Package and install the bridge on macOS and Windows
  >
  > **Blocked by:** #5  
  > **Labels:** `area:bridge`, `area:release`, `ready-for-agent` after #5
  >
  > ## Outcome
  >
  > Make the local bridge realistically installable by a reviewer on macOS Apple Silicon and Windows x64 without requiring a Node.js runtime.
  >
  > ## Scope
  >
  > - Produce standalone bridge artifacts for macOS Apple Silicon and Windows x64.
  > - Generate the OS-specific Native Messaging host manifest and installer/uninstaller steps.
  > - Detect bridge absence/version mismatch from the extension and show an actionable non-technical setup state.
  > - Add release checks that verify artifact naming, manifest path and protocol compatibility.
  > - Document known platform restrictions and recovery steps.
  >
  > ## Acceptance criteria
  >
  > - [ ] A clean macOS Apple Silicon machine can install, health-check and remove the bridge using documented steps.
  > - [ ] A clean Windows x64 machine has equivalent documented install, health-check and removal steps.
  > - [ ] The extension gives a clear recovery action when no compatible bridge is found.
  > - [ ] No Node.js runtime is required after installation.
  > - [ ] Release checks validate both target manifests.
  >
  > ## Review focus
  >
  > Review installer paths and removal behavior separately on each OS; never leave an orphaned Native Messaging registration.
  >

- [ ] #11 — Validate the full ergonomic review-to-agent experience (labels: area:ux, area:quality, blocked)

  **Issue #11 — détail complet**
  > # 11 — Validate the full ergonomic review-to-agent experience
  >
  > **Blocked by:** #6, #8, #9, #10  
  > **Labels:** `area:quality`, `area:ux`, `ready-for-agent` after all blockers
  >
  > ## Outcome
  >
  > Prove that the whole workflow is ergonomic and resilient: review a React/Next and Vue/Nuxt page, hand the result to an agent, and receive an auditable response without data leakage.
  >
  > ## Scope
  >
  > - Add end-to-end fixtures and a repeatable manual QA script.
  > - Validate hover/click/pin, editing, reload persistence, evidence previews/deletion, bridge handoff and copied Markdown.
  > - Exercise source-map success and absence, generic DOM fallback, redaction and bridge-unavailable flows.
  > - Conduct an independent UX/code review subagent pass against the approved contract.
  > - Produce release-readiness evidence and document residual best-effort limitations.
  >
  > ## Acceptance criteria
  >
  > - [ ] E2E coverage demonstrates the full review → copy → local artifact handoff on representative fixtures.
  > - [ ] Manual QA script passes on Chrome for macOS and Windows documented paths.
  > - [ ] An independent reviewer signs off that every approved requirement is met or explicitly tracked.
  > - [ ] No regression permits passive inspection before `Start review`.
  > - [ ] Release notes state framework/source-map confidence limitations plainly.
  >
  > ## Review focus
  >
  > This is a product acceptance ticket: prioritize ergonomics, clarity of failures and real agent usability over internal implementation elegance.
  >
