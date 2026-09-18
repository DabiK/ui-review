# 04 — Capture useful evidence while protecting sensitive data

**Blocked by:** #3  
**Labels:** `area:extension`, `area:privacy`, `ready-for-agent` after #3

## Outcome

Enrich each pin with technical context and two reviewable screenshots without exporting secrets or forcing the reviewer to trust an opaque capture.

## Scope

- Capture a stable DOM fingerprint, relevant ancestry, visible text, accessible role/name, selected attributes, bounding box, viewport and useful computed styles.
- Capture one viewport screenshot and one element crop per comment.
- Never collect form values; redact secret-like keys and attributes (`password`, `token`, `secret`, authorization values and similar).
- Add screenshot previews and per-attachment deletion in the side panel before handoff.
- Model capture confidence and capture failures explicitly rather than silently producing misleading evidence.

## Acceptance criteria

- [ ] A saved comment has DOM and visual evidence linked by its stable comment ID.
- [ ] Password/input values and known secret-like attributes do not appear in serialized evidence.
- [ ] The user can preview and remove either screenshot independently.
- [ ] A screenshot failure leaves a usable text/DOM comment with an explicit failure state.
- [ ] Tests cover redaction and screenshot-to-comment linkage.

## Review focus

Inspect all serialization paths for accidental disclosure and verify screenshots match the intended selected element.

