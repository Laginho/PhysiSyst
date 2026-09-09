# PHY-09: Body panel split

**What to build:** The body panel shows only the essentials by default: massa, fixo, and initial velocity. Everything the mouse already does better — position x/y, rotação, and shape dimensions (largura/altura/raio/base/α) — moves under a collapsible "ver mais" section. Dragging remains the primary way to position, rotate, and resize. The contacts panel is unchanged (μ per pair, per the friction ADR).

**Blocked by:** PHY-04 (initial velocity core).

**Status:** complete

- [x] Default body panel shows exactly: massa, fixo, initial velocity
- [x] Position, rotation, and shape dimensions live under the collapsible "ver mais" and remain functional there
- [x] The "ver mais" state persists while the panel is open (does not collapse on re-selection)
- [x] Drag/rotate/resize handles still work as before (no behavior change in the canvas)
- [x] Clamps and validation on hidden fields (α clamp, minimum dimensions) are preserved
- [x] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)

## Comments

2026-09-04 — MAKE and independent READ completed:

- The panel now keeps mass, fixed, and Initial velocity visible while pose and shape dimensions live under a native `details` disclosure with localized `properties.more` text.
- A focused jsdom seam verifies the collapsed default, direct Body re-selection preserving the open disclosure, editable advanced fields, and the existing dimension/α clamps. `jsdom@26` keeps the test compatible with the project's supported Node range.
- Mutate-verify evidence: replacing `details`, keying the panel by Body id, removing the base/width clamps, and corrupting the pt-BR disclosure label each failed its targeted regression before restoration.
- Independent READ found no P0–P1 defects. Final gates: 22 test files / 395 tests, lint, typecheck, and build all green.
