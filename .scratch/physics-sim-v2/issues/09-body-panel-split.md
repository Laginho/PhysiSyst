# 09: Body panel split

**What to build:** The body panel shows only the essentials by default: massa, fixo, and initial velocity. Everything the mouse already does better — position x/y, rotação, and shape dimensions (largura/altura/raio/base/α) — moves under a collapsible "ver mais" section. Dragging remains the primary way to position, rotate, and resize. The contacts panel is unchanged (μ per pair, per the friction ADR).

**Blocked by:** 04 (initial velocity core).

**Status:** ready-for-agent

- [ ] Default body panel shows exactly: massa, fixo, initial velocity
- [ ] Position, rotation, and shape dimensions live under the collapsible "ver mais" and remain functional there
- [ ] The "ver mais" state persists while the panel is open (does not collapse on re-selection)
- [ ] Drag/rotate/resize handles still work as before (no behavior change in the canvas)
- [ ] Clamps and validation on hidden fields (α clamp, minimum dimensions) are preserved
- [ ] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
