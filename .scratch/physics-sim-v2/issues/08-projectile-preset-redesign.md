# 08: Projectile preset redesign

**What to build:** The projectile Preset becomes a textbook launch: a Body resting on the ground with a diagonal initial velocity — the fake continuous launch force is removed entirely. Playing shows a real parabola that lands on the ground. The preset's closed-form acceptance family (parabola/range) is updated to launch from `v₀` instead of the force fixture.

**Blocked by:** 04 (initial velocity core).

**Status:** done

- [x] The projectile Preset contains a ground, a Body on it, and a diagonal `v₀` — no launch force
- [x] Playback traces a parabola matching the closed-form family for the given `v₀` and `g`
- [x] The projectile lands on the ground (no bottomless fall)
- [x] The preset builds through the codec (same path as all presets) and round-trips
- [x] The old force-launch acceptance fixture is replaced, not duplicated
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)

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

Correction cycle 06 MAKE implementation: changed only `src/i18n/pt-BR.ts` and `src/i18n/en.ts`, updating `preset.projectile.description` to describe a diagonal initial-velocity launch. No tests or other catalog keys/files were modified.

Mutation evidence (each mutation was restored before the final gates):

- Restored pt-BR `preset.projectile.description` to `Lançamento oblíquo com força inicial` and ran `npx vitest run src/i18n/i18n.test.ts -t "uses Initial velocity terminology in pt-BR"` (exit 1). Failed `projectile Preset descriptions > uses Initial velocity terminology in pt-BR without Applied force` at `src/i18n/i18n.test.ts:200:27`: expected `'lançamento oblíquo com força inicial'` to match `/velocidade inicial|v₀/`; received `"lançamento oblíquo com força inicial"`.
- Restored EN `preset.projectile.description` to `Oblique launch with initial force` and ran `npx vitest run src/i18n/i18n.test.ts -t "uses Initial velocity terminology in EN"` (exit 1). Failed `projectile Preset descriptions > uses Initial velocity terminology in EN without Applied force` at `src/i18n/i18n.test.ts:211:27`: expected `'oblique launch with initial force'` to match `/initial velocity|v₀/`; received `"oblique launch with initial force"`.

Final gate evidence (all exit 0):

- `npm test`: `Test Files 22 passed (22)`; `Tests 390 passed (390)`.
- `npm run lint`: passed with no output.
- `npm run typecheck`: passed with no output.
- `npm run build`: passed; Vite transformed 40 modules and emitted `dist/assets/index-B5oVdbPt.js` (2,367.34 kB, gzip 882.53 kB). Existing chunk-size warning only.

Correction cycle 06 READ: no refactor and no findings. The independent review confirmed that only the two intended localized values and their public-seam tests changed; all four gates passed again (390 tests).
