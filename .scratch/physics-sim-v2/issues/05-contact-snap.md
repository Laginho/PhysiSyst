# 05: Contact snap

**What to build:** Dragging a Body near a neighbor snaps it into direct Contact: position flush against the nearest surface within a small pixel tolerance, and for rectangles rotation aligned to the touched surface (flat ground → rotation 0); circles snap to tangent distance. Contact snap fully replaces grid snapping — the existing toggle becomes the snap toggle. Rotate and α handle drags remain unsnapped. When several surfaces are in range, the nearest wins.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] A rectangle dragged onto an inclined face lands flush with rotation aligned to that face
- [x] A rectangle dragged onto flat ground lands flush with rotation 0
- [x] A circle dragged onto a surface lands tangent to it
- [x] Outside the pixel tolerance, placement is unaffected (no snap)
- [x] Multiple in-range surfaces resolve to the nearest
- [x] The snap toggle disables the behavior entirely
- [x] Grid snapping is gone: no gridline quantization anywhere in body placement
- [x] Rotate and α handle drags remain unsnapped
- [x] The resolver is a pure function tested with geometry scenarios (the one new test seam)
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
