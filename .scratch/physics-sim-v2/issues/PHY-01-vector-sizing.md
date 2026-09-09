# PHY-01: Vector sizing rule

**What to build:** Every magnitude-bearing arrow on the canvas (weight, applied force) is drawn with one shared sizing rule: length is a square-root function of magnitude, clamped to a hard pixel minimum and maximum. The clamps are the critical contract: no arrow ever leaves the canvas or clutters the drawing, and ordering is preserved — a larger magnitude never draws a shorter arrow. A scene with forces 1, 5, and 500 N shows three visibly different arrows. Normal arrows stay direction-only (unchanged).

**Blocked by:** None (can start immediately).

Stage: done

- [x] The sizing function is monotonic: strictly larger magnitude never yields a shorter arrow
- [x] Arrow length never goes below the pixel minimum, for any magnitude including near-zero
- [x] Arrow length never exceeds the pixel maximum, for any magnitude including extreme (e.g. 500 N)
- [x] Weight and applied-force arrows both consume the same sizing rule (one shared producer, no per-arrow constants)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
