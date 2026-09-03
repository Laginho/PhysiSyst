# 11: Acceptance sweep + closeout

**What to build:** The whole v2 diff verified as one unit: the projectile-with-initial-velocity closed-form acceptance family runs green end-to-end; all four gates pass over the full changeset (not just per-ticket); cross-ticket interactions hold (labels + contact snap + trash on the same scene; vector sizing consistent across weight/applied/`v₀` arrows; panel split with all new fields). Independent READ verification over the complete diff, then FINAL_REPORT updated for v2.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10 (all).

**Status:** ready-for-agent

- [ ] Full acceptance suite green including the `v₀` parabola/range family
- [ ] All four gates green over the entire v2 diff (`test`, `lint`, `typecheck`, `build`)
- [ ] Cross-ticket scenario verified: textbook scene with labeled bodies, contact-snapped block on wedge, drag-to-trash removal, paused readout with `≈` estimate, `v₀` arrow sizing consistent with force arrows
- [ ] Independent READ adversarial pass over the complete v2 changeset (mutate-replay on the new seams)
- [ ] i18n parity confirmed over all new keys in both catalogs
- [ ] FINAL_REPORT.md updated for v2 (scope, gate outcomes, known limitations carried forward)
