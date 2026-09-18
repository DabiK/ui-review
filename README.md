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
| `npm run dev` | Rebuild both bundles (`dist/`) on change; reload the extension to apply |
| `npm run build` | Production build into `dist/` (side panel + service worker + content script) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, includes the core boundary rules |
| `npm test` | Unit and architecture tests |

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

Every saved note also carries local evidence: a curated DOM anchor (fingerprint, ancestry,
visible text, role/name, allowlisted attributes, bounding box, viewport, computed styles) and
two screenshots — the viewport and a crop of the pinned element. Form values are never read,
and secret-like attributes (`password`, `token`, `secret`, authorization values…) are replaced
before anything is persisted. URL attributes (`href`, `src`, …) are redacted too: credentials
and secret-like keys are masked in query strings and fragments of absolute, relative and
protocol-relative references (`?token=…`, `#access_token=…`, `#/route?api_key=…`). The side panel previews both screenshots as numbered plates and
either can be removed independently before handoff. The overlay hides itself while the capture
runs so the screenshots show the page, not the review chrome; a capture failure leaves the note
usable with an explicit "Screenshots unavailable" message. `chrome.tabs.captureVisibleTab`
accepts only `<all_urls>` or a short-lived `activeTab` grant (which a page reload revokes), so
the extension declares the `<all_urls>` host permission; screenshots still stay in the local
browser profile.

The module map, public interfaces and the dependency rule are documented in
[`docs/architecture.md`](docs/architecture.md). The agent workflow (one implementation agent
per issue, a distinct review agent, evidence in PRs) is documented in [`AGENTS.md`](AGENTS.md).

Local-first Chrome UI review annotations with agent-ready handoff
