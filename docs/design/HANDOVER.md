# Visual redesign handover — UI Review

Brief for the agent doing the visual refonte of the extension UI. The functional scope is
already implemented and tested; this is a **design change**, not a feature change.

## Product in one paragraph

UI Review is a local-first Chrome MV3 extension. In the side panel the reviewer starts a
session on the current http(s) page, then hovers/clicks page elements to pin numbered
comments with category and priority. Each comment carries DOM evidence, screenshots and
best-effort framework/source-map context with an explicit confidence level. When done,
`Copy brief` writes `review.md`, `review.json` and the screenshots to a local handoff
directory for a coding agent. Nothing leaves the machine.

## Current state (September 2026)

- 9 of 11 MVP tickets are implemented, tested and approved (#1–#9). #10 (bridge packaging)
  and #11 (end-to-end validation) are pending; the autonomous loop is paused for the refonte.
- The UI is currently implemented as **plain DOM** (no UI framework) and follows the design
  lead `docs/design/DESIGN.md` + reference image `docs/design/sidebar-b-editorial.png`
  ("Editorial margin notes"). Explorations kept for reference:
  `sidebar-a-rail.png` (spatial rail), `sidebar-c-console.png` (dark console),
  `ui-review-mockup.png` (first browser-context mockup).
- The refonte is explicitly allowed to evolve that direction. The firm constraints are the
  product principles and the architecture rules below, not the current pixels.

## Surfaces and file map

| Surface | Files | Notes |
|---|---|---|
| Side panel document | `sidepanel.html`, `src/sidepanel/main.ts`, `src/sidepanel/review-panel-view.ts`, `src/sidepanel/styles.css` | `main.ts` holds state and calls use cases; `review-panel-view.ts` is a pure renderer (functions per section); `styles.css` holds the design tokens (`:root`) and every panel style. |
| Page overlay (shadow DOM) | `src/content/overlay.ts`, `src/content/index.ts` | `OVERLAY_STYLES` is an inline template string in `overlay.ts` (hover highlight, pins layer, inline composer, mode badge). |
| Anchor capture (not visual) | `src/content/dom-anchor.ts` | DOM evidence only; do not touch for styling. |
| UI tests | `tests/ui/review-panel-view.test.ts`, `tests/ui/sidepanel-main.test.ts` | Assert rendered DOM and labels; update them with the refonte, never weaken them. |

Current tokens live in `src/sidepanel/styles.css` (`--paper`, `--ink`, `--index`, `--action`,
`--priority`, `--rule`, `--meta`, `--serif`, `--sans`, `--mono`). The overlay uses its own
inline styles and must stay visually consistent with the panel.

## States to cover

Side panel:

1. No session / before `Start review` (including the "only http(s) pages" ineligible state).
2. Active session: masthead (editable session name, host, timestamp), `Stop review`.
3. Comments list: numbered rows (index, category, priority, text, meta, evidence plates,
   edit/delete).
4. Composer: add note (text required, category default `UI`, priority default `important`),
   edit mode, blank-text inline error.
5. Evidence plates: viewport + element crop with captions and independent delete,
   explicit capture-failure state.
6. Confidence badges: framework (`detected` / `inferred` / `unavailable`) and source map
   (`available` / `unavailable`) — must never overstate certainty.
7. Sessions list and clear-session confirmation.
8. Handoff block: `Copy brief`, temporary-path footnote, success and clipboard-focus failure
   notices.
9. Notices and error alerts (`role="alert"`).

Page overlay:

1. Hover highlight plus element label badge.
2. Numbered pins, high contrast, never mistakable for page content.
3. Inline composer (text, category, priority, save/cancel, `Esc`), plus the active-mode
   indicator.

## Hard constraints

- **Architecture**: the UI never calls `chrome.*` or a storage API directly; it goes through
  use cases and ports, and `src/core/**` stays free of DOM/framework imports. Boundary rules
  are enforced by lint and `tests/architecture/core-boundaries.test.ts`. Do not change
  `src/core/**` or `src/bridge/**`; if a visual need requires new data, route it through a
  use case/port and say so instead of hacking the view.
- **Accessibility** (acceptance criteria, plus open issues #14, #17, #18): visible focus,
  labels, full keyboard path, AA contrast, explicit image dimensions, no focus loss on
  re-render.
- **Chrome side panel**: ~360–400 px wide, full height. Light theme today; committing to a
  dark theme is allowed but must be an explicit, documented decision.
- **Copy**: all UI text in English, no emojis. Editorial tone, not marketing.
- **Tests**: `npm run verify` (lint → typecheck → tests → build) must stay green. UI changes
  come with updated UI tests and screenshots as evidence.
- **Scope**: no unrelated refactors, no behavior changes hidden in a style change. One
  logical commit per step.

## Related open issues (UI/UX debt, good refonte candidates)

- #13 duplicate sessions on rapid Start clicks
- #14 focus lost after re-render; rename input autocomplete
- #15 raw internal error messages surfaced in the panel
- #16 overlay composer not dismissed by outside clicks; draft lost via page link
- #17 native `required` validation shadows the inline blank-text error
- #18 evidence plates: lazy images lack explicit dimensions
- #19 overlay save can stall while the tab is hidden
- #25 `tests/ui/sidepanel-main.test.ts` times out under cold-cache full-suite runs

## Run and QA

```sh
npm install
npm run build          # dist/ (extension + content script + bridge)
npm run dev            # watch rebuild; reload the extension card afterwards
npm run verify         # lint, typecheck, tests, build
npm run bridge:install # dev registration of the Native Messaging host (needed for Copy brief)
npm run bridge:smoke   # round-trip health, artifact and handoff frames
```

Manual QA: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`.
Click the toolbar icon to open the side panel, work on an http(s) page (other schemes are
rejected by design), then check pin/panel sync, reload persistence, evidence previews and
`Copy brief`. Handoff files land in
`$(getconf DARWIN_USER_TEMP_DIR)/ui-review/handoff/<sessionId>` on macOS.

## Deliverables

- Updated `docs/design/DESIGN.md` (direction, tokens, component rules) and refreshed
  reference image(s) if the direction evolves.
- Implementation changes in the files listed above.
- Updated UI tests; `npm run verify` green.
- Before/after screenshots (Chrome for Testing / Playwright or manual) in the evidence.
- Atomic commits in English; report anything out of scope instead of fixing it here.

When the refonte is done, the autonomous loop can be resumed:
`APPROVED_STATE="$PWD/.ralph/approved" REVIEW_LOG="$PWD/.ralph/reviews.log" afk-ralph-review.sh 8 10 "<extra instruction>"`
