# PHY-04: Initial velocity core

**What to build:** A student can give a dynamic Body an initial velocity (`vx`, `vy` in m/s, world frame) via two numeric fields in the body panel, press play, and watch it move ballistically. The Initial velocity is an additive-optional Scene schema field — the Scene version stays 1, pre-v2 scenes parse untouched — applied by the simulator as linear velocity when the world is built, and carried across structural rebuilds like existing runtime velocity. Fixed bodies expose no velocity input.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Setting `vx`/`vy` on a dynamic Body and pressing play launches it with that velocity (verified against a closed form, e.g. free-flight displacement)
- [x] The field is additive-optional: a version-1 Scene without it parses and serializes unchanged; scenes with it round-trip losslessly
- [x] The simulator applies the initial velocity at world build; a paused/rebuilt world preserves it
- [x] Structural rebuilds during playback carry the velocity without restarting the body
- [x] Fixed bodies expose no velocity field
- [x] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
