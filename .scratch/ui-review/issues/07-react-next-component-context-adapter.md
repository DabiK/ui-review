# 07 — Detect React and Next.js component context as best effort

**Blocked by:** #3  
**Labels:** `area:adapters`, `area:extension`, `ready-for-agent` after #3

## Outcome

Enrich a clicked DOM element with the nearest available React/Next component ownership context while preserving the generic DOM workflow when no framework metadata exists.

## Scope

- Add a React/Next adapter behind the inspection module’s narrow public interface.
- Discover available ownership/component metadata without making production-only guarantees.
- Return component name, ancestor component chain and confidence level when available.
- Ensure failures, minified builds and non-React pages return generic evidence rather than errors.
- Display framework evidence as `detected`, `inferred` or `unavailable`.

## Acceptance criteria

- [ ] React development fixture produces a nearest component and ancestor chain where metadata exists.
- [ ] Plain HTML and non-React fixtures continue to create comments normally.
- [ ] The UI never labels inferred component context as confirmed source truth.
- [ ] The adapter can be disabled or fails safely without breaking annotation.
- [ ] Tests cover all confidence outcomes.

## Review focus

Reject coupling from the core to React internals; component detection must stay inside its adapter.

