# PHY-11: Acceptance sweep + closeout

**What to build:** The whole v2 diff verified as one unit: the projectile-with-initial-velocity closed-form acceptance family runs green end-to-end; all four gates pass over the full changeset (not just per-ticket); cross-ticket interactions hold (labels + contact snap + trash on the same scene; vector sizing consistent across weight/applied/`v₀` arrows; panel split with all new fields). Independent READ verification over the complete diff, then FINAL_REPORT updated for v2.

**Blocked by:** PHY-01, PHY-02, PHY-03, PHY-04, PHY-05, PHY-06, PHY-07, PHY-08, PHY-09, PHY-10 (all).

**Status:** complete

- [x] Full acceptance suite green including the `v₀` parabola/range family
- [x] All four gates green over the entire v2 diff (`test`, `lint`, `typecheck`, `build`)
- [x] Cross-ticket scenario verified: textbook scene with labeled bodies, contact-snapped block on wedge, drag-to-trash removal, paused readout with `≈` estimate, `v₀` arrow sizing consistent with force arrows
- [x] Independent READ adversarial pass over the complete v2 changeset (mutate-replay on the new seams)
- [x] i18n parity confirmed over all new keys in both catalogs
- [x] FINAL_REPORT.md updated for v2 (scope, gate outcomes, known limitations carried forward)

## Comments

2026-09-09 — Swept via /tdd (no new production code — this ticket is verification, not a red→green cycle):

- 400 tests / 23 files green, all four gates green.
- Live browser verification (Browser pane, real pointer drags, not jsdom):
  wedge scene → contact-snap → drag-to-trash (label re-flow confirmed) →
  projectile preset paused mid-flight, `v₀` arrow sized by the same rule as
  weight/applied arrows (confirmed at the source: all three route through
  `vectorArrowLengthPx`).
- Mutate-replay: `pointInTrash` bbox inversion, `vectorArrowLengthPx`
  sqrt→linear, `massLabels` subscript-suppression — each caught by its
  targeted test, each restored; working tree clean afterward.
- `≈`-truth logic (ticket 06) verified via its existing seam-level
  adversarial coverage (`accelerationTracker.test.ts`) rather than
  re-clicking through the UI a second time — already exercises paused/
  Contact/Fixed/elapsed-carry cases directly.
- FINAL_REPORT.md updated with a v2 section (scope table, gate outcomes,
  limitations carried forward unchanged).
