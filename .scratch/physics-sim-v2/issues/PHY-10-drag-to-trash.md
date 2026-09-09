# PHY-10: Drag-to-trash

**What to build:** While a Body drag is active, a trash target renders in a canvas corner; dropping the dragged Body on it deletes it — its applied forces and Contacts go with it (the existing remove-with-dependents behavior). The trash target is invisible when not dragging. Panel buttons stay.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Dragging a Body reveals the trash target in a canvas corner; it is hidden when no drag is active
- [x] Dropping the dragged Body on the target removes the Body, its applied forces, and its Contacts
- [x] Dropping anywhere else places the Body normally (contact snap rules still apply)
- [x] The panel's duplicate/excluir buttons continue to work
- [x] Deletion during paused playback routes through the structural rebuild with carry-over (no trajectory reset beyond the removal)
- [x] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)

## Comments

2026-09-09 — Implemented via /tdd, two vertical slices:

- `editor/trash.ts`: pure `trashRect`/`pointInTrash` (screen-space rect fixed
  to the canvas's bottom-right corner, camera/zoom-independent), same style
  as `handles.ts`'s handle hit-testing. Unit-tested directly.
- `App.tsx`: the existing `move`-kind drag (already tracked in `dragRef`) now
  shows the trash target on pointerdown and checks the drop point against it
  on pointerup; a hit routes through `removeBodyAndDependents` — the exact
  function the panel's excluir button already used, so dependents-cleanup
  and the structural-rebuild-with-carry-over path (`routeDocChange` already
  classifies body removal as structural; `carryOver` already drops ids
  absent from the next document) needed no new code, only reuse. A miss
  leaves the existing move/contact-snap logic untouched.
- New key `editor.trash` (lixeira / trash) labels the icon; the existing
  catalog-completeness suite covers parity, no new i18n test needed.
- Mutate-verify evidence: negating `pointInTrash`'s bounding-box test and
  short-circuiting the drop's hit check both failed their targeted
  regression before restoration.
- Manually verified in a real browser (not just jsdom): dragging a body onto
  the corner deletes it, dragging elsewhere still moves it normally, and the
  icon is visible only mid-drag.
- Final gates: 23 test files / 400 tests, lint, typecheck, and build all
  green.
