# 06: Readout truth — paused acceleration + magnitudes

**What to build:** The readout tells the truth at every moment. Pausing keeps the last measured acceleration visible (no reset to zero). A Body that has never stepped shows its analytic acceleration — `(Σ applied forces + weight) / mass` — exact for free bodies, and marked with `≈` when the Body participates in a declared Contact (contact-force magnitudes are unavailable on this seam, so the marker is the honest contract). Velocity and acceleration magnitudes (`|v|`, `|a|`) display prominently; vector components move under a collapsible "ver mais" section.

**Blocked by:** None (can start immediately).

**Status:** in-progress

- [x] Pausing playback keeps the last measured acceleration displayed (no zero short-circuit)
- [x] A fresh, never-stepped free Body shows its analytic acceleration (free fall → `g` downward; single applied force → `F/m`), matching closed forms
- [ ] The analytic estimate is flagged with `≈` exactly when a dynamic Body participates in a declared Contact; Fixed-body acceleration remains exact zero
- [x] A stepped Body's paused value equals its last measured value
- [x] `|v|` and `|a|` are displayed prominently; components are visible under the collapsible section
- [x] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
