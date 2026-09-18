# 05 — Build the secure Native Messaging bridge and artifact store

**Blocked by:** #1  
**Labels:** `area:bridge`, `area:architecture`, `ready-for-agent` after #1

## Outcome

Introduce a narrow, authenticated bridge between the extension and a local executable, with no localhost server and durable artifact storage outside `/tmp`.

## Scope

- Specify a versioned request/response protocol with allowlisted operations only.
- Implement the companion bridge as a TypeScript executable with a Native Messaging host manifest.
- Store session artifacts under the OS application-data directory; keep the storage location behind an OS adapter.
- Validate message schema, extension origin and path construction; reject unknown messages.
- Provide a fake bridge adapter for automated tests.
- Document local development installation and how to remove the host safely.

## Acceptance criteria

- [ ] The extension can round-trip a health check and a write/read artifact request through Native Messaging.
- [ ] No HTTP listener or open localhost port is created.
- [ ] Invalid protocol payloads are rejected without writing files.
- [ ] Artifact paths cannot escape the per-session storage root.
- [ ] macOS and Windows path behavior are covered by unit tests or OS-adapter contract tests.

## Review focus

Treat protocol and filesystem validation as security-sensitive; review with an independent subagent.

