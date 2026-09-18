# UI Review — a working notebook

The extension helps a reviewer turn observations into an actionable brief. Its primary
sequence is **start → click an element → write a note → copy the agent brief**.
The design evolves the original editorial margin direction into a quieter, practical tool.
Light paper, fine rules and numbered notes remain; session administration recedes.

Current reference: [active review](evidence/after-active.png),
[first use](evidence/after-empty.png), [page composer](evidence/after-overlay-composer.png).
The previous direction is retained in `sidebar-b-editorial.png` for historical reference.

## Hierarchy

- A compact masthead identifies the tool and local persistence.
- The current page and annotation status stay together; Stop is a secondary action.
- The selected review is named explicitly, including when it differs from the current tab.
- Notes are the main content. Numbers match page pins; text is readable sans serif.
- Each note exposes its anchor and actions. Evidence and technical context use native
  disclosures; screenshot failures remain visible even when the disclosure is closed.
- Session settings and stored sessions are collapsed by default. Deletion confirmations
  automatically open their containing disclosure.
- Copy agent brief stays at the bottom of the viewport. The bridge state is compact;
  unavailable bridge states retain their recovery instructions and disabled copy action.
  The handoff block is bounded to 45% of the viewport and scrolls on short screens.
- First use explains the three steps. Empty and restricted states provide explicit guidance.

## Tokens

| Role | Value |
|---|---|
| Paper | `#faf9f6` |
| Ink | `#242824` |
| Primary action / focus | `#294d42` |
| Action hover | `#1c392f` |
| Note index / destructive action | `#763849` |
| Muted text | `#62685f` |
| Rule | `#dedfd8` |
| Input border | `#b8beb3` |

Headings use Iowan Old Style / Palatino / Georgia; prose and controls use Avenir Next /
Avenir / Segoe UI; small technical labels use SFMono-Regular / Consolas. No remote fonts.
Main text is 14px with generous line height. Metadata is compact, with limited uppercase.
Controls use 4px corners in the panel and 2px on the overlay. No gradients or heavy shadows.

## Interaction and accessibility

- Use native buttons, labels and disclosures; all controls have visible focus.
- Preserve open disclosures, dirty edit fields, text selection and focused controls across
  same-session refreshes. Do not transfer drafts into a different session.
- Focus the note editor when editing begins. Focus deletion confirmation once on entry;
  background refreshes must not pull focus away from the user's chosen confirmation action.
- Custom inline validation handles blank text consistently (`novalidate` on forms).
- Reserve screenshot dimensions from the read model before lazy images load.
- Page overlay colors and type match the panel. Hover labels identify the element tag.
  The composer fits within the viewport and scrolls vertically when necessary.
- Preserve Escape, Shift+Escape and Ctrl/Cmd+Enter behavior. Page click capture and the
  domain lifecycle are unchanged by this design work.

## Verification

See [refonte evidence](REFONTE-EVIDENCE.md). Development-only fixtures live under
`tests/fixtures/`; they render the real view/overlay with deterministic sample data and
are not extension entry points. These captures validate layout, not native bridge transport.
