# 09 — Add Vue and Nuxt component context adapter

**Blocked by:** #3  
**Labels:** `area:adapters`, `area:extension`, `ready-for-agent` after #3

## Outcome

Add Vue/Nuxt component context through the same inspection module interface, without changing generic annotation behavior or React code.

## Scope

- Implement a Vue/Nuxt adapter that discovers closest component metadata when exposed.
- Produce component name, parent chain and confidence using the canonical core evidence model.
- Provide development and production-like fixture coverage.
- Keep framework-specific internals isolated in the adapter.

## Acceptance criteria

- [ ] A Vue fixture returns nearest available component context.
- [ ] A Nuxt fixture follows the same exported evidence schema.
- [ ] Pages without Vue still annotate normally.
- [ ] No React adapter code changes are required other than shared contract evolution approved by review.
- [ ] Confidence is rendered and exported consistently with React evidence.

## Review focus

Compare adapter behavior against the React adapter’s public contract, not its implementation details.

