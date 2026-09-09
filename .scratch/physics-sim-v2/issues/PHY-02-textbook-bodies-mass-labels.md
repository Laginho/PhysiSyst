# PHY-02: Textbook bodies + mass labels

**What to build:** Scenes look like textbook figures: dynamic bodies render with white fill and black outline; fixed bodies keep the hatched ground treatment. Each dynamic Body carries a Mass label drawn inside it — `M` for Triangles, `m` for the other shapes — subscripted (`m_a`, `m_b`, `M_a`) whenever two bodies would share a symbol, in creation order. Labels are derived from the Scene on every render (never stored, never hand-edited), so deleting a body re-flows the remaining labels automatically. Fixed bodies carry no label.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Dynamic bodies render white-filled with black stroke; fixed bodies keep hatching; no dashed borders on dynamic bodies
- [x] Mass labels render inside dynamic bodies (first text rendering in the render layer, with its own unscaled transform)
- [x] Triangle → `M`; rectangle/circle → `m`
- [x] Two bodies sharing a letter class get distinct subscripts (`m_a`, `m_b`), assigned in creation order
- [x] Deleting a body recomputes labels so no two bodies ever share a symbol
- [x] Fixed bodies show no label
- [x] Labels are derived at render time only — the Scene schema is untouched
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
