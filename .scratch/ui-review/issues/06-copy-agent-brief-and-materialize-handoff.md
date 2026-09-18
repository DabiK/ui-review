# 06 — Copy an agent-ready review brief and materialize its artifacts

**Blocked by:** #4, #5  
**Labels:** `area:bridge`, `area:ux`, `ready-for-agent` after #4 and #5

## Outcome

Turn a completed review into one clipboard action that gives a local coding agent a readable Markdown brief and real local paths to JSON and screenshots.

## Scope

- Materialize `review.md`, `review.json` and referenced images into a per-session temporary handoff directory (`/tmp` on macOS and the Windows temp equivalent).
- Generate concise Markdown with review context, numbered comments, category/priority, evidence confidence, DOM/framework context, image paths and the expected agent response format.
- Copy the Markdown to the clipboard from the side panel.
- Make handoff generation idempotent and update the existing session directory rather than leaving unbounded copies.
- Explain the temporary-path behavior in UI and docs.

## Acceptance criteria

- [ ] A user can copy a brief that contains every non-deleted comment once, ordered deterministically.
- [ ] Every image path in `review.md` points to an existing local artifact at export time.
- [ ] `review.json` validates against a documented versioned schema.
- [ ] The generated brief tells an agent to modify only scoped review items and report one result per comment ID.
- [ ] Export failures are visible and do not delete the persistent review session.

## Review focus

Use a separate agent to validate the generated brief against a realistic coding-agent handoff, not just string snapshots.

