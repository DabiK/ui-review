# 02 — Start, persist, resume and clear a review session

**Blocked by:** #1  
**Labels:** `area:extension`, `area:ux`, `ready-for-agent` after #1

## Outcome

Give the reviewer a frictionless session lifecycle in the Chrome side panel: start explicitly, resume after reload, rename, and clear deliberately.

## Scope

- Add `Start review` and `Stop review` actions scoped to the current tab.
- Create an automatic session name from hostname and timestamp; make it editable in the side panel.
- Persist sessions and their state through the repository port; restore them after extension/browser reload.
- Require explicit confirmation before clearing a session and delete its associated core records through one use case.
- Render empty, active and stopped states accessibly.

## Acceptance criteria

- [ ] No inspection starts until `Start review` is clicked for an eligible current tab.
- [ ] Closing/reopening the side panel or reloading the page preserves the active session and its name.
- [ ] Renaming updates the persisted session.
- [ ] Clear removes the selected session only after confirmation and leaves other sessions intact.
- [ ] Keyboard focus and labels make all lifecycle controls usable without a mouse.

## Review focus

Review the state transitions as a single core use case; UI must not mutate persistence directly.

