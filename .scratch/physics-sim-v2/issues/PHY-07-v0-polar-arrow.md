# PHY-07: v₀ polar input + canvas arrow

**What to build:** Initial velocity can be entered as magnitude + angle via a toggle that switches the input with cartesian `vx`/`vy` (pure conversion, no precision loss on round-trip). The initial velocity is drawn on the canvas as a green arrow anchored to the Body, sized by the shared vector sizing rule, so direction and relative size are visible before pressing play.

**Blocked by:** PHY-01 (vector sizing rule), PHY-04 (initial velocity core).

**Status:** complete

- [x] The velocity input toggles between cartesian (`vx`/`vy`) and polar (magnitude/angle) forms
- [x] Converting between forms round-trips without losing the underlying stored value
- [x] The initial-velocity arrow renders anchored to the Body with the Body's current `v₀`
- [x] The arrow uses the shared sizing rule: bounded, monotonic in magnitude
- [x] Zero initial velocity draws no arrow
- [x] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)

## Comments

2026-09-03 — READ independently replayed and restored each production mutation:

- swapping Cartesian conversion arguments failed the axes/quadrants and round-trip tests in `src/editor/initialVelocity.test.ts`;
- inverting Initial-velocity arrow components failed the projected-anchor/direction and absent-component tests in `src/render/overlay.test.ts`;
- removing either zero-velocity or Fixed-body suppression failed the suppression regression in `src/render/overlay.test.ts`;
- replacing the shared sizing rule with a constant/raw magnitude failed the direction-length and bounded/monotonic sizing regressions in `src/render/overlay.test.ts`;
- corrupting each of the five ticket-07 keys in pt-BR and EN failed the corresponding locale semantic test in `src/i18n/i18n.test.ts`.

After every restoration, `npm test` passed 386/386; lint, typecheck, and build were green. The Cartesian/polar toggle wiring and exact canvas style remained inspection-only as declared in the handoff's `Not test-first` section.
