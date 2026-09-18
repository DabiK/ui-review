# 01 — Bootstrap the clean architecture and agent workflow

**Blocked by:** none  
**Labels:** `area:architecture`, `area:quality`, `ready-for-agent`

## Outcome

Establish a runnable Chrome MV3 extension foundation whose domain is independent of Chrome and whose changes can safely be implemented and reviewed by separate agents.

## Scope

- Set up the TypeScript workspace, Chrome MV3 manifest, development commands, linting, typechecking and test commands.
- Create a small, deep `review-core` module with the canonical vocabulary: `ReviewSession`, `ReviewComment`, `Evidence`, `Attachment`, and `Confidence`.
- Keep Chrome UI and persistence outside the core. Define only interfaces that have two real implementations immediately (for example in-memory test repository and IndexedDB repository).
- Add the extension shell with a side-panel status view proving that the extension loads.
- Write `AGENTS.md` and a PR template: one implementation subagent per issue/worktree, a distinct review subagent, no unrelated refactors, required checks and evidence in PRs.
- Document the module map and public interfaces in `docs/architecture.md`.

## Acceptance criteria

- [ ] A clean Chrome profile can load the unpacked extension and open its side panel.
- [ ] `review-core` has no imports from Chrome APIs, DOM APIs, React, or adapter modules.
- [ ] Core tests exercise the public interfaces only and pass.
- [ ] `lint`, `typecheck`, unit tests and build run successfully from a documented command.
- [ ] `AGENTS.md` requires separate implementation and review agents for future issue work.

## Review focus

Confirm depth and locality: callers must not assemble domain state or know adapter internals.

