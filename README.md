# UI Review

Une extension Chrome locale pour faire une review d'interface directement sur une page : survoler, cliquer, poser une pin, écrire une remarque, puis copier un brief exploitable par un agent de code.

## Principes non négociables

- **Zéro friction de review** : un mode explicite, `hover → click → comment`, des pins persistantes et un panneau latéral clair.
- **Local-first** : aucune donnée ne quitte la machine. Les reviews restent locales jusqu'au clear manuel.
- **Preuves utiles, jamais trompeuses** : DOM, captures et métadonnées framework sont accompagnés d'un niveau de confiance ; une détection React/Vue ou une source map n'est jamais présentée comme certaine sans preuve.
- **Données sensibles protégées** : aucune valeur de formulaire ou secret connu n'est exporté ; les captures restent prévisualisables et supprimables avant handoff.
- **Agent-ready** : un seul copier-coller produit un brief Markdown et pointe vers les artefacts locaux. L'agent traite les pins identifiés et restitue une réponse par identifiant.

## Architecture

Le noyau de domaine reste indépendant de Chrome, du DOM et des frameworks. Les intégrations sont des adaptateurs : Chrome MV3, persistance locale, Native Messaging, DOM générique, React/Next puis Vue/Nuxt, et résolution de source maps. Les interfaces publiques sont étroites et testées au même seam que les appels réels.

Le bridge local utilise Chrome Native Messaging, jamais un serveur HTTP local. Il conserve les artefacts durablement dans le dossier applicatif de l'OS et matérialise un handoff temporaire pour l'agent dans `/tmp` sur macOS ou l'équivalent Windows.

## Roadmap

Les 11 tickets MVP sont publiés dans les [issues](https://github.com/DabiK/ui-review/issues). Ils forment un DAG : commencer par [#1 — clean architecture et workflow agent](https://github.com/DabiK/ui-review/issues/1), puis débloquer les tranches verticales.

Chaque ticket impose un implémenteur agent isolé et une review par un second agent, avec critères d'acceptation vérifiables.

## Development

Requirements: Node.js ≥ 20.19.

```sh
npm install
npm run verify   # lint → typecheck → unit tests → build
```

| Command | Purpose |
|---|---|
| `npm run dev` | Rebuild all bundles (`dist/`) on change; reload the extension to apply |
| `npm run build` | Production build into `dist/` (side panel + service worker + content script + bridge) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, includes the core boundary rules |
| `npm test` | Unit and architecture tests |
| `npm run bridge:install` | Install the local Native Messaging host for development |
| `npm run bridge:uninstall` | Remove the host registration and installed bridge bundle |
| `npm run bridge:package` | Build standalone bridge binaries into `release/` (macOS arm64, Windows x64) |
| `npm run bridge:smoke` | Spawn the built bridge (or `-- --binary <path>`) and round-trip its frames |

Load the unpacked extension: run `npm run build`, open `chrome://extensions`, enable
Developer mode, click **Load unpacked** and select `dist/`. Clicking the toolbar icon opens
the side panel. On an http(s) page, **Start review** creates a session named after the
hostname and timestamp; sessions are stored in the browser profile, survive panel and page
reloads, can be renamed and stopped, and are only removed — one at a time, after confirmation
— with **Clear session**.

While a review is active, the page overlay highlights the element under the pointer: click it
to open the inline composer (`Escape` cancels), write the note and save it with category and
priority — `UI` and `important` are the defaults. The note becomes a numbered pin on the page
and a numbered row in the panel, where it can be edited or deleted; pins and rows are rebuilt
from persisted data after a page or panel reload. `Shift+Escape` (or **Exit review mode**)
leaves review mode, and no listener or overlay exists on the page while review mode is off.
The focused tab URL is read through the `tabs` permission and never leaves the machine.

**Copy agent brief** (Session section) turns the selected review into one clipboard action.
The versioned brief (`review.json`, schema version 1) and the exact Markdown (`review.md`)
are built from the persisted session — comments in stored order, each with category,
priority, evidence confidence, DOM context and screenshot paths. The local bridge writes
`review.md`, `review.json` and every referenced screenshot into a temporary per-session
directory (`/tmp/ui-review/handoff/<sessionId>` on macOS, the Windows temp equivalent,
overridable with `UI_REVIEW_BRIDGE_HANDOFF_ROOT` for development), replacing it in place on
every export so no copies accumulate; `review.md` is written last and then copied to the
clipboard. The generated brief instructs the coding agent to change only the listed comment
IDs and to report one result per ID. Export failures (bridge absent, clipboard refused) are
shown explicitly and never modify or delete the stored review. The directory is temporary:
delete it once the agent is done.

The Session section always shows the local bridge state. A ready bridge renders as a quiet
`Local bridge ready — v0.1.0 · platform` line; when it is missing or is not the build this
extension ships with, the handoff is disabled and the panel explains what to install, with a
**Check again** action that re-runs the health check without reloading the panel.

Every saved note also carries local evidence: a curated DOM anchor (fingerprint, ancestry,
visible text, role/name, allowlisted attributes, bounding box, viewport, computed styles) and
two screenshots — the viewport and a crop of the pinned element. Form values are never read,
and secret-like attributes (`password`, `token`, `secret`, authorization values…) are replaced
before anything is persisted. URL attributes (`href`, `src`, …) are redacted too: credentials
and secret-like keys are masked in query strings and fragments of every scheme the platform
URL parser accepts — `https://…`, `wss://…`, `ftp://…`, custom deep links such as
`myapp://…?access_token=…` — as well as relative and protocol-relative references
(`?token=…`, `#access_token=…`, `#/route?api_key=…`). Known limitation: Android
`intent://…#Intent;…;S.token=…;end` payloads separate their parameters with `;`, which is not
parsed as a URL parameter separator, so a secret nested there is not masked. The side panel previews both screenshots as numbered plates and
either can be removed independently before handoff. The overlay hides itself while the capture
runs so the screenshots show the page, not the review chrome; a capture failure leaves the note
usable with an explicit "Screenshots unavailable" message. `chrome.tabs.captureVisibleTab`
accepts only `<all_urls>` or a short-lived `activeTab` grant (which a page reload revokes), so
the extension declares the `<all_urls>` host permission; screenshots still stay in the local
browser profile.

Framework context is a best-effort extra, never a guarantee. React attaches its component
fibers as JavaScript expandos (`__reactFiber$…`), and Vue the rendering component instance
(`__vueParentComponent` on Vue 3, `__vue__` on Vue 2), none of which an isolated content
script can see. The service worker therefore injects self-contained React/Next and Vue/Nuxt
detectors into the page's main world on demand (`chrome.scripting.executeScript({ world:
'MAIN' })`, `scripting` permission) — only after an active session has accepted the note,
never before **Start review**. The nearest component name and its ancestor chain are stored
with an explicit confidence: `detected` only when development metadata is directly observed
(React `_debugOwner`/`_debugSource`, Vue `__file`/`__hmrId`), `inferred` for production-like
metadata, a Vue `__vue_app__` root fallback, a `__NUXT__`/`__NEXT_DATA__` payload or a
minified name, and `unavailable` when nothing readable exists. The panel always shows which
of the three applies, and a missing frame, restricted page or minified build degrades to an
explicit state instead of breaking the annotation. The agent brief carries the same context
and confidence labels.

Source context is resolved only for a reference the framework adapter actually observed. A
development reference that already names a source file
(`webpack-internal:///./src/…`, `/src/App.tsx`, `.vue`, `.svelte`, …) is recorded as
`detected` with no network call. A compiled reference (a `.js` bundle) is fetched with its
published source map from the service worker — only after an active review accepted the note,
with no credentials, no custom headers and no local server — and the original file/line is
recorded as `inferred`, because a bundle mapping proves a location, not a component-file
relationship. Missing, invalid, unmapped or oversized maps produce an explicit
`Source map: unavailable` state and never block the note or the export. Fetched bytes are
discarded; only the file reference and position are stored. Mapping `sources` entries back to
a local project origin is documented as a later fallback: the raw entry is kept as-is.

The module map, public interfaces and the dependency rule are documented in
[`docs/architecture.md`](docs/architecture.md). The agent workflow (one implementation agent
per issue, a distinct review agent, evidence in PRs) is documented in [`AGENTS.md`](AGENTS.md).

## Local bridge (Native Messaging)

The companion bridge is a local executable Chrome launches through a Native Messaging host
manifest. It speaks length-prefixed JSON on stdio — there is **no HTTP listener and no
localhost port** — and stores session artifacts under the OS application-data directory
(`~/Library/Application Support/ui-review` on macOS, `%APPDATA%\ui-review` on Windows,
`$XDG_DATA_HOME/ui-review` or `~/.local/share/ui-review` on Linux).

```sh
npm run build
npm run bridge:install        # dev: computes the unpacked extension id from dist/
# reload the extension in chrome://extensions
npm run bridge:smoke          # optional: exercises the built bridge over real framing
npm run bridge:uninstall      # removes the registration; persisted sessions stay
```

The dev installer copies the bridge into `<app-data>/ui-review/bridge/` and writes the host
manifest for Chrome. Pass `npm run bridge:install -- --extension-id <id>` when the extension
id is already known. On Windows the dev installer prints the `reg add` command instead of
editing the registry.

### Install the packaged bridge

For a reviewer machine without Node.js, `npm run bridge:package` produces standalone
executables (Node single-executable applications — the runtime is embedded, nothing else is
needed):

```sh
npm run build
npm run bridge:package                       # both targets into release/
npm run bridge:package -- --target darwin-arm64
npm run bridge:package -- --target win-x64   # downloads node.exe for the current Node version
```

Each `release/ui-review-bridge-<target>/` folder is the artifact: the executable, the
installer and uninstaller, and a README with the same steps. The extension id shown by
`chrome://extensions` (Developer mode) is always required, because an unpacked extension id
depends on the machine.

macOS Apple Silicon:

```sh
release/ui-review-bridge-darwin-arm64/install.sh --extension-id <extension-id>
# reload the extension; the panel's Local bridge line turns "Ready"
release/ui-review-bridge-darwin-arm64/uninstall.sh
```

Windows x64:

```powershell
powershell -ExecutionPolicy Bypass -File release\ui-review-bridge-win-x64\install.ps1 -ExtensionId <extension-id>
# reload the extension; the panel's Local bridge line turns "Ready"
powershell -ExecutionPolicy Bypass -File release\ui-review-bridge-win-x64\uninstall.ps1
```

Both installers copy the executable under the user application-data directory, write the
launcher that pins the allowed origin, register the Native Messaging host (manifest on
macOS, `HKCU\Software\Google\Chrome\NativeMessagingHosts` on Windows) and finish with a
health check:

```sh
release/ui-review-bridge-darwin-arm64/ui-review-bridge --health
# {"kind":"bridge.health","status":"ok","bridgeVersion":"0.1.0","protocolVersion":1,"platform":"darwin"}
```

`npm run bridge:smoke -- --binary <path>` runs the full health/write/read/handoff smoke test
against a packaged binary. Release checks (`tests/release/bridge-release.test.ts`) validate
the artifact naming, both host manifests and that the packaged plan still speaks
`BRIDGE_PROTOCOL_VERSION`.

Platform restrictions: only Chrome stable is registered (other channels need their own
`NativeMessagingHosts` directory / registry key, listed in each artifact README); the macOS
binary is Apple Silicon only and ad-hoc signed (the installer clears the quarantine
attribute); the Windows executable is unsigned and may trigger SmartScreen; each executable
is about 110 MiB because it embeds the runtime. Recovery: when the panel shows **Not
installed**, run the installer, reload the extension and choose **Check again**; when it
shows **Not compatible**, run the uninstaller and install the matching build. Uninstallers
never leave an orphaned registration and never delete `sessions/`.

Security model: the host manifest only allows the registered extension, the launcher sets an
origin allowlist and the bridge fails closed without it, Chrome's authoritative caller origin
is compared at startup, and every message is schema-validated before the filesystem is
touched. Artifact paths are built from conservative slugs; the filesystem store re-verifies
containment after symlink resolution, so a session folder or file cannot escape its root.
Writes are capped at 16 MiB decoded; Chrome caps host→extension messages at 1 MiB, so large
artifacts are meant to be handed to the agent by local path, not read back. The handoff
materializer applies the same rules to its temporary directory: validated session and file
names, symlink containment, and a full directory replacement on every export.

## Review interface

Start a review, then click an element on the page to write a note. The panel puts notes
first; expand **Evidence & context** to inspect screenshots and technical context.
**Session settings** contains rename and clear actions; **Stored sessions** opens history.
**Copy agent brief** stays at the bottom of the panel and includes local evidence for the
coding agent. Draft fields and keyboard focus survive background updates of the same review.

The current visual direction and before/after evidence are in
[`docs/design/DESIGN.md`](docs/design/DESIGN.md). Development-only layout fixtures can be
opened at `/tests/fixtures/design-preview.html` and `/tests/fixtures/overlay-preview.html`
with a local Vite server (`npx vite --host 127.0.0.1`). They are not included in the build.
