# 08: Projectile preset redesign

**What to build:** The projectile Preset becomes a textbook launch: a Body resting on the ground with a diagonal initial velocity — the fake continuous launch force is removed entirely. Playing shows a real parabola that lands on the ground. The preset's closed-form acceptance family (parabola/range) is updated to launch from `v₀` instead of the force fixture.

**Blocked by:** 04 (initial velocity core).

**Status:** needs-triage

- [ ] The projectile Preset contains a ground, a Body on it, and a diagonal `v₀` — no launch force
- [ ] Playback traces a parabola matching the closed-form family for the given `v₀` and `g`
- [ ] The projectile lands on the ground (no bottomless fall)
- [ ] The preset builds through the codec (same path as all presets) and round-trips
- [ ] The old force-launch acceptance fixture is replaced, not duplicated
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)

## Comments

MAKE implementation: changed only `src/presets/index.ts`. The projectile preset now uses the shared `groundBody()`, a tangent circle at `(2, 0.3)`, initial velocity `{ vx: 8, vy: 6 }`, and `forces: []`; its description names an initial-velocity launch without an applied force.

Mutation evidence (each mutation was restored before final gates):

- Reintroduced projectile `lancamento` force in `src/presets/index.ts`: `npx vitest run src/presets/presets.test.ts -t projectile` failed both projectile tests at the empty-forces assertions (`presets ... without forces` and `... through persistence`).
- Removed projectile `vx`: the same targeted command failed `presets ... without forces` at `expect(projectile?.vx).toBeGreaterThan(0)` with `undefined`.
- Offset projectile center by `+0.1` m above the ground: the same targeted command failed `presets ... without forces` at the 9-digit tangent check (`0.4` vs expected `0.3`).
- Removed `ground` from the projectile preset body list: the same targeted command failed both projectile tests (body count `1` vs `2`; persisted `loadedGround?.fixed` was `undefined`).
- Corrupted simulator initial-velocity application to `setLinvel({ x: body.vx ?? 0, y: 0 }, true)`: `npx vitest run src/sim/acceptance.test.ts -t projectile` failed both rows at the exact initial `vy` assertion (`5` and `9.456129043280665` vs tolerance `1e-6`).
- Restored the old force-launch acceptance setup (6 gravity-compensated force ticks, no ground, no `vx`/`vy`, then force cut): the same acceptance command failed both rows at the exact initial `vx` assertion (`2.3479588353580993e-6` and `1.272379941852364e-6` vs tolerance `1e-6`), demonstrating the old fixture cannot satisfy the new seam.

All mutations were restored; no test or simulator changes remain.

READ finding: all four gates passed, but the user-visible gallery description remains force-based because `src/App.tsx` renders the localized `preset.${p.id}.description` key, while `src/i18n/pt-BR.ts` and `src/i18n/en.ts` retain the old force-launch strings. The `PRESETS` metadata is correct, but the shipped display contradicts this ticket; no unplanned localization change was made.
