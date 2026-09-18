# 08 — Resolve source-map context with explicit confidence

**Blocked by:** #7  
**Labels:** `area:adapters`, `area:privacy`, `ready-for-agent` after #7

## Outcome

When a React/Next reference and a usable source map exist, add source file/line evidence to the review without pretending arbitrary DOM nodes have a source location.

## Scope

- Detect available source maps and resolve eligible compiled locations to original source references.
- Record source result as confirmed, inferred or unavailable with explanatory reason.
- Avoid exposing source content unnecessarily; store minimal file reference and line/column.
- Degrade safely for missing, inaccessible or invalid maps.
- Document optional local project-origin mapping as a later fallback, not a requirement for this ticket.

## Acceptance criteria

- [ ] A source-map fixture resolves a known compiled position to expected source file and line.
- [ ] Missing/invalid maps produce an explicit unavailable state and do not block export.
- [ ] Reports distinguish a resolved mapping from framework inference.
- [ ] Source-map requests follow the extension’s explicit active-review permission model.
- [ ] Tests cover success, missing map and invalid map paths.

## Review focus

Verify that the implementation does not claim a component-file relationship when it only knows a bundle mapping.

