# 07: v₀ polar input + canvas arrow

**What to build:** Initial velocity can be entered as magnitude + angle via a toggle that switches the input with cartesian `vx`/`vy` (pure conversion, no precision loss on round-trip). The initial velocity is drawn on the canvas as a green arrow anchored to the Body, sized by the shared vector sizing rule, so direction and relative size are visible before pressing play.

**Blocked by:** 01 (vector sizing rule), 04 (initial velocity core).

**Status:** ready-for-agent

- [ ] The velocity input toggles between cartesian (`vx`/`vy`) and polar (magnitude/angle) forms
- [ ] Converting between forms round-trips without losing the underlying stored value
- [ ] The initial-velocity arrow renders anchored to the Body with the Body's current `v₀`
- [ ] The arrow uses the shared sizing rule: bounded, monotonic in magnitude
- [ ] Zero initial velocity draws no arrow
- [ ] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
