# 03 — Annotate any page element with click-to-pin

**Blocked by:** #2  
**Labels:** `area:extension`, `area:ux`, `ready-for-agent` after #2

## Outcome

Deliver the core human interaction: hover an element, click it, write a review remark, and see a durable pin plus a live side-panel list.

## Scope

- Inject an isolated overlay only while the session is active.
- Highlight the element under the pointer without breaking page controls when review mode is off.
- On click, create a pin and an inline composer with required text plus optional category and priority.
- Default category to `UI` and priority to `important`.
- Persist the comment through the core use case; show, edit and delete it from the side panel.
- Support `Esc` to cancel an in-progress annotation and a documented keyboard path to leave review mode.

## Acceptance criteria

- [ ] A reviewer can create, edit and delete a pin on a normal website without navigating away.
- [ ] The corresponding side-panel row and on-page pin stay synchronized after a reload.
- [ ] The overlay does not intercept page clicks when review mode is stopped.
- [ ] A comment cannot be saved with blank text.
- [ ] Each saved comment has stable ID, URL, viewport and timestamp.

## Review focus

Exercise the complete interaction on a plain HTML fixture and a client-rendered fixture; reject visual regressions and event-leakage.

