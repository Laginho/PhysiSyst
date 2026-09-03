---
title: "T01 vector sizing — READ gate"
kind: review
---

PASS

## Evidence

The four gates were reproduced independently before the replay and again after all temporary mutations were restored:

- `npm test`: PASS — 19 test files, 334 tests.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS — production bundle generated; only the existing chunk-size warning was reported.

### Adversarial mutation replay

Each mutation was applied to production code in `src/render/overlay.ts`, `npm test` was run, at least one regression failed, and the production code was restored immediately afterward.

| Mutation | Test failure observed |
| --- | --- |
| Linear mapping instead of `sqrt` | `overlay.test.ts` — `weightArrows > monotonic in weight magnitude`; `vectorArrowLengthPx > square-root shape pinned at an unclamped interior point` |
| Maximum clamp removed | `overlay.test.ts` — `vectorArrowLengthPx > bounded`; `shared sizing rule across arrow kinds > extreme magnitudes stay inside pixel bounds` |
| Minimum clamp removed | `overlay.test.ts` — `vectorArrowLengthPx > monotonic`; `vectorArrowLengthPx > bounded` |
| Applied arrows use raw magnitude | `overlay.test.ts` — both `appliedArrows` sizing tests; `shared sizing rule across arrow kinds > weight and applied arrows of equal magnitude`; extreme-bounds test |
| Ordering inverted (larger magnitude produces shorter arrow) | `overlay.test.ts` — `weightArrows > monotonic in weight magnitude`; `vectorArrowLengthPx > monotonic`; square-root-shape test |

### Ticket criteria review

- Monotonicity is preserved as non-decreasing after clamping, with explicit strict distinctions for 1, 5, and 500 N.
- The shared producer returns the 24 px floor for zero, near-zero, NaN, and negative magnitudes, and the 120 px ceiling for extreme positive magnitudes including infinity.
- `weightArrows` and `appliedArrows` both call `vectorArrowLengthPx`; no per-arrow sizing constants were introduced. The normal-arrow path remains direction-only.
- All `App.tsx` call sites, including the selection branch, pass the camera scale needed to convert the shared pixel rule back to world units.
- The regression tests cover sizing, bounds, shared behavior, call-site wiring, and were independently mutation-verified above.

The workspace has no `.git` metadata, so this review used the brief's named changeset and the current source/call sites directly rather than a commit diff. No production mutation remains. No root causes for rejection.
