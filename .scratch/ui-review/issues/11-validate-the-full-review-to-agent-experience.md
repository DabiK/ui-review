# 11 — Validate the full ergonomic review-to-agent experience

**Blocked by:** #6, #8, #9, #10  
**Labels:** `area:quality`, `area:ux`, `ready-for-agent` after all blockers

## Outcome

Prove that the whole workflow is ergonomic and resilient: review a React/Next and Vue/Nuxt page, hand the result to an agent, and receive an auditable response without data leakage.

## Scope

- Add end-to-end fixtures and a repeatable manual QA script.
- Validate hover/click/pin, editing, reload persistence, evidence previews/deletion, bridge handoff and copied Markdown.
- Exercise source-map success and absence, generic DOM fallback, redaction and bridge-unavailable flows.
- Conduct an independent UX/code review subagent pass against the approved contract.
- Produce release-readiness evidence and document residual best-effort limitations.

## Acceptance criteria

- [ ] E2E coverage demonstrates the full review → copy → local artifact handoff on representative fixtures.
- [ ] Manual QA script passes on Chrome for macOS and Windows documented paths.
- [ ] An independent reviewer signs off that every approved requirement is met or explicitly tracked.
- [ ] No regression permits passive inspection before `Start review`.
- [ ] Release notes state framework/source-map confidence limitations plainly.

## Review focus

This is a product acceptance ticket: prioritize ergonomics, clarity of failures and real agent usability over internal implementation elegance.

