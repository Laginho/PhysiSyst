# 08: Projectile preset redesign

**What to build:** The projectile Preset becomes a textbook launch: a Body resting on the ground with a diagonal initial velocity — the fake continuous launch force is removed entirely. Playing shows a real parabola that lands on the ground. The preset's closed-form acceptance family (parabola/range) is updated to launch from `v₀` instead of the force fixture.

**Blocked by:** 04 (initial velocity core).

**Status:** ready-for-agent

- [ ] The projectile Preset contains a ground, a Body on it, and a diagonal `v₀` — no launch force
- [ ] Playback traces a parabola matching the closed-form family for the given `v₀` and `g`
- [ ] The projectile lands on the ground (no bottomless fall)
- [ ] The preset builds through the codec (same path as all presets) and round-trips
- [ ] The old force-launch acceptance fixture is replaced, not duplicated
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
