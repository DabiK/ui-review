# AGENTS.md — working agreement for coding agents

This file is mandatory reading for any agent (human or AI) working on this repository.

## Mission

UI Review is a local-first Chrome extension that lets a reviewer annotate any page and hand a
complete, evidence-backed brief to a local coding agent. `PRD.md` lists the issues and their
acceptance criteria; `progress.txt` records what is done and what is blocked.

## Non-negotiable architecture

Clean/hexagonal architecture, extension **and** native bridge. Read
`docs/architecture.md` before touching code.

- Dependencies point inward: driving adapters → use cases → domain core ← driven adapters.
- `src/core/**` must never import Chrome, DOM, React/Vue, Node, OS or adapter modules.
- Ports are declared by the core; at least two real implementations per port.
- The UI never calls `chrome.*` or a storage API directly — only use cases and ports.
- The composition root (`src/app`) is the only place that chooses concrete adapters.
- Callers must not assemble domain state or know adapter internals.

These rules are enforced by `npm run lint` and `tests/architecture/core-boundaries.test.ts`.
Breaking them is a failed change, not a style nit.

## Required workflow for every issue

1. **One implementation agent per issue and per worktree.** Read the issue, explore the
   affected modules, then implement only that issue. Never bundle another issue's work.
2. **Run the full check suite**: `npm install` then `npm run verify`
   (lint → typecheck → unit tests → build).
3. **No unrelated refactors.** If you spot an unrelated bug, report it in `progress.txt`
   instead of fixing it in the same change.
4. **Provide evidence in the PR** using `.github/pull_request_template.md`: commands run with
   their results, and how each acceptance criterion was verified.
5. **A distinct review agent must review the change before it is considered complete.** The
   review agent is never the implementation agent, and it reviews the diff plus the evidence —
   not a summary written by the implementer.
6. **Update documentation** (`docs/architecture.md`, `README.md`) whenever public interfaces,
   commands or runtime behaviour change.
7. **Commit atomically**, one logical step per commit. Do not push unless explicitly asked.

## Review agent checklist

- Does the change satisfy every acceptance criterion of the issue?
- Does the dependency rule hold? Any `chrome.*`, DOM, storage or adapter access from the core
  or the UI is a rejection.
- Do new ports have at least two real implementations and contract tests?
- Are failure modes explicit (typed errors, confidence levels, user-visible states) rather
  than silent?
- Do tests exercise public interfaces at the same seam as real callers?
- Is the UI consistent with the "Editorial margin notes" direction
  (`docs/design/DESIGN.md`), in English, keyboard-accessible with visible focus?
- Is the diff scoped to the issue, with no unrelated refactors?

## UI direction

All UI tickets follow the validated lead in `docs/design/DESIGN.md` and
`docs/design/sidebar-b-editorial.png`: paper background, fine rules, numbered indexes,
serif/sans/mono typography, no dashboard look. UI text is in English; code, comments and docs
are in English too.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Rebuild `dist/` on change |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, includes core boundary rules |
| `npm test` | Unit + architecture tests |
| `npm run verify` | All of the above in CI order |
