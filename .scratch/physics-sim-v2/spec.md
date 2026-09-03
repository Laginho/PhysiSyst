# physics-sim v2 — Textbook polish, contact snap, initial velocity

Status: ready-for-agent

## Problem Statement

physics-sim v1 works, but using it feels like operating a tool, not sketching a textbook problem. Force arrows shoot across the whole screen when a magnitude gets large. Bodies are blue blobs, not the white/black figures students see in their books. The ground triggers a bogus "mass should be positive" warning on every shipped scene. New scenes spawn floating in a void with no ground. Placing a block flush against a wedge means fighting a grid that snaps to nothing useful. Acceleration readouts drop to zero the moment playback pauses — even for a fresh block whose weight vector is visibly drawn, the number says 0. Launching a projectile requires a fake force that keeps thrusting mid-flight, because bodies cannot have an initial velocity. And the editing panel drowns the two things that matter (mass, friction) under mouse-redundant numeric fields.

## Solution

A v2 upgrade in ten coordinated changes, all serving one idea: **scenes should look and behave like the textbook questions students are studying.**

1. Vector arrows sized by a bounded non-linear scale — bigger magnitude always means longer arrow, never off-screen.
2. Textbook rendering: white fill, black outline, mass symbols (`m`, `M`, subscripted on collision) drawn inside bodies; hatched ground.
3. Mass warnings only where mass is actually wrong, named after the offending body.
4. Drag-to-trash deletion on the canvas.
5. Every new scene — including projectile and free-fall presets — starts with a ground.
6. Contact snapping: drag a body near a neighbor and it lands flush, rotation aligned to the touched surface.
7. Magnitudes (`|v|`, `|a|`) front and center in the readout; components tucked away.
8. Acceleration survives pausing; fresh bodies show their analytic acceleration.
9. Per-body initial velocity (`v₀`), entered as components or magnitude+angle, drawn as an arrow — the projectile preset launches for real.
10. A quiet panel: mass, fixed, initial velocity by default; everything mouse-redundant under "ver mais".

## User Stories

1. As a student, I want force arrows sized by a bounded, non-linear scale, so that a 500 N force stays inside the canvas.
2. As a student, I want a larger force always to draw a longer arrow than a smaller one, so that relative magnitudes stay readable (1, 5, 500 N → three visibly different arrows).
3. As a student, I want a minimum arrow length, so that small forces don't vanish.
4. As a student, I want a maximum arrow length, so that no vector ever clutters the drawing or leaves the screen.
5. As a student, I want weight, applied-force, and initial-velocity arrows to share one sizing rule, so that the canvas is visually consistent.
6. As a student, I want bodies drawn as textbook figures (white fill, black outline), so that scenes look like the questions in my book.
7. As a student, I want each dynamic body to carry a mass symbol inside it, so that scenes read like book problems.
8. As a student, I want wedges labeled `M` and smaller bodies `m`, so that symbols follow textbook conventions.
9. As a student, I want colliding symbols subscripted (`m_a`, `m_b`, `M_a`), so that no two bodies ever share a symbol.
10. As a student, I want symbols recomputed when a body is deleted, so that labels stay unambiguous.
11. As a student, I want fixed bodies hatched and unlabeled, so that anchors are visually distinct from movers.
12. As a student, I want fixed bodies exempt from the positive-mass warning, so that the ground stops crying wolf.
13. As a student, I want warnings to name the offending body, so that I can find and fix it.
14. As a student, I want to delete a body by dragging it onto a trash target, so that removal is intuitive.
15. As a student, I want the trash target to appear only while I'm dragging, so that the canvas stays clean.
16. As a student, I want deleting a body to take its forces and contacts with it, so that scenes stay consistent.
17. As a student, I want every new scene to start with a ground, so that I can place bodies immediately.
18. As a student, I want the projectile preset to be a body on the ground with a diagonal initial velocity, so that I can watch a real parabola.
19. As a student, I want the free-fall preset to drop a body onto the ground, so that the scene anticipates future collision play.
20. As a student, I want a dragged body to snap into direct contact with a nearby neighbor, so that flush scenes take one drag.
21. As a student, I want a rectangle snapped against an inclined face to rotate to match it, so that block-on-wedge sits correctly.
22. As a student, I want a rectangle snapped to flat ground to stay at rotation 0, so that stacks remain upright.
23. As a student, I want circles to snap at tangent distance, so that balls rest on surfaces.
24. As a student, I want snapping to trigger only within a small tolerance, so that free placement elsewhere is untouched.
25. As a student, I want to toggle snapping off, so that I can place a body exactly where I want.
26. As a student, I want contact snapping to replace grid snapping entirely, so that there is one snapping behavior to understand.
27. As a student, I want velocity and acceleration magnitudes shown prominently, so that "how fast?" is answered at a glance.
28. As a student, I want vector components available but tucked under "ver mais", so that the readout stays focused.
29. As a student, I want acceleration to keep its last measured value while paused, so that inspecting a moment doesn't zero it out.
30. As a student, I want a never-stepped free body to show its analytic acceleration (e.g. `g` downward), so that the vector and the number agree before I press play.
31. As a student, I want analytic estimates on bodies with declared contacts marked with `≈`, so that I'm never misled by an approximation.
32. As a student, I want to give a body an initial velocity, so that launches come from `v₀`, not a fake eternal thrust.
33. As a student, I want to enter initial velocity as components or as magnitude + angle, so that I can use whichever form the problem gives me.
34. As a student, I want the initial velocity drawn as an arrow, so that I can see direction and relative size before playing.
35. As a student, I want scenes saved before v2 to load unchanged, so that my old work survives.
36. As a student, I want the body panel to show mass, fixed, and initial velocity by default, so that the essentials are one glance away.
37. As a student, I want position, rotation, and dimensions under a collapsible "ver mais", so that they exist but don't shout.
38. As a student, I want dragging to remain the primary way to position, rotate, and resize, so that the panel doesn't duplicate the mouse.
39. As a pt-BR student, I want every new label and message in pt-BR, so that the app stays native-first.

## Implementation Decisions

- **Vector sizing (one shared rule).** All magnitude-bearing arrows (weight, applied force, initial velocity) share a single monotonic non-linear mapping: arrow length is a square-root function of magnitude, then clamped to hard pixel minimum and maximum. The clamps are the critical contract (user emphasis): nothing may leave the canvas or clutter the scene, and ordering must be preserved — a larger magnitude never draws shorter. Normal arrows stay direction-only (existing limitation, unchanged).
- **Textbook rendering.** Dynamic bodies: white fill, black stroke, no dashed borders. Fixed bodies keep the hatched treatment. This introduces the render layer's first text: mass labels drawn inside dynamic bodies require their own unscaled transform (the body loop currently draws under a flipped/scaled transform). Labels come from a **derived, never-stored** scheme: triangles → `M`, other dynamic shapes → `m`; on symbol collision within a letter class, subscript suffixes (`_a`, `_b`, …) in creation order; recomputed on every render, so deletions re-flow labels automatically. Fixed bodies carry no label.
- **Warning policy.** Fixed bodies are exempt from the positive-mass warning (mass 0 is legitimate for them; the simulator already refuses dynamic mass ≤ 0 separately). Warning messages identify the body by its id — user-visible — instead of array position.
- **Trash deletion.** While a body drag is active, a trash target renders in a canvas corner; dropping the dragged body on it invokes the existing remove-with-dependents doc op (forces and contacts touching the body go with it). Panel buttons stay.
- **Ground everywhere.** The blank-scene factory includes a fixed hatched ground (same recipe as presets). The projectile preset is redesigned: ball resting on ground with a diagonal initial velocity; the fake continuous launch force is removed. The free-fall preset gains a ground under the falling body.
- **Contact snap (the one new mechanism).** A pure resolver: given the dragged body's geometry/pose and its neighbors, within a pixel tolerance it returns a contact pose — position flush against the nearest surface, and for rectangles rotation aligned to that surface (flat ground → rotation 0); circles snap to tangent distance. It fully replaces grid snapping (the grid toggle becomes the snap toggle); rotate and α handle drags remain unsnapped. Nearest surface wins when several are in range.
- **Readout.** Magnitudes (`|v|`, `|a|`) displayed prominently; components move under a collapsible "ver mais" section of the readout.
- **Paused acceleration.** The tracker's paused short-circuit to zero is removed: while paused, the last measured value stays visible. For bodies that have never stepped, a pure analytic estimator supplies `(Σ applied forces + weight) / mass`. Because contact-force magnitudes are unavailable on this seam (known v1 limitation), the estimate is exact for free bodies and approximate for bodies in declared contacts — the UI marks those with `≈`.
- **Initial velocity.** Additive-optional schema field on dynamic bodies — scene version stays 1 (precedent: the existing additive-optional particle-mode flag), so no migration; pre-v2 scenes parse untouched. The simulator applies it as linear velocity at world build; structural rebuilds carry it like existing runtime velocity. Input accepts cartesian (`vx`, `vy`) or polar (magnitude, angle) via a toggle backed by a pure conversion. Drawn as a green arrow using the shared vector sizing. The projectile preset consumes it.
- **Panel split.** Body panel defaults: massa, fixo, velocidade inicial. A collapsible "ver mais" holds x, y, rotação, and shape dimensions (largura/altura/raio/base/α). Contacts panel unchanged (μ per pair, per the friction ADR).
- **i18n.** Every new user-facing string enters both the pt-BR and EN catalogs; parity is already test-enforced. pt-BR is the product surface — the end user may not understand English, so pt-BR phrasing quality is a requirement, while EN exists for developer parity only.

## Testing Decisions

- **Good test = external behavior at a public seam.** No implementation details, no automated UI tests (v1 policy: the React/rAF adapter is pinned through pure mirrors, not automation).
- **Codec/doc-op seam:** parse/serialize round-trips with initial velocity in both input forms; a version-1 scene without the field parses unchanged (backward compatibility); warning-policy table (fixed exempt, dynamic ≤ 0 flagged, message names the body); blank scene contains a ground; preset content assertions. Prior art: the v1 codec invalid-mutation table and preset tests.
- **Render-producer seam:** vector sizing monotonicity (larger magnitude → longer or equal arrow) and clamp bounds (never below min, never above max, including extreme magnitudes); label derivation scenarios (`M`/`m`, subscripts on collision, re-flow after deletion, fixed bodies unlabeled). Prior art: overlay and grid-ladder tests.
- **Contact-snap resolver (new seam, the only new one):** geometry scenarios — rectangle onto inclined face (flush + rotation aligned), rectangle onto flat ground (rotation 0), circle tangent to a surface, outside tolerance → no snap, multiple candidates → nearest surface wins. Prior art: v1 handle/geometry tests. **Every regression test here is mutate-verified** per the AGENTS.md build protocol: break the resolver on purpose, watch the test fail, then trust green.
- **Playback seam:** paused readback returns the last measured value; the analytic estimator matches closed forms (free body → `g`; single applied force → `F/m`); the approximate-marker flag flips exactly when the body participates in a declared contact. Prior art: v1 AccelTracker tests.
- **Acceptance:** the closed-form suite gains a projectile-with-initial-velocity family (parabola/range), replacing the force-launch fixture.
- **i18n:** existing bidirectional parity tests cover the new keys automatically.

## Out of Scope

- Restitution knob / elastic collisions (next major version; the ground-everywhere change deliberately anticipates it).
- Contact-force magnitudes for normal arrows (stays direction-only).
- Weight arrows at the true triangle centroid (existing documented offset).
- Canvas resize / backing-store re-measure (existing deferral).
- User-editable body labels (labels are derived, never hand-set).
- T12 manual device pass (user-deferred from v1, still with the user).
- Any feature beyond the ten listed — larger additions are explicitly deferred.

## Further Notes

- **Build protocol (unchanged from v1):** four gates (`test`, `lint`, `typecheck`, `build`), test-first red→green, max 3 fix loops per ticket before BLOCKED, independent READ verification with adversarial review. The mutate-verify rule is now formalized in AGENTS.md.
- **Orchestration:** PLAN orchestrates; MAKE = muse-spark-1.2-medium; READ = 5.6-luna-max. Progress reporting is milestone-based (ticket started / red / green / sent to READ / done), never timer-based; a 30-minute stall watchdog is the backstop. A fresh READ spawns at context boundaries. The pipeline runs unattended until BLOCKED or completion.
- **Glossary:** `CONTEXT.md` gained Initial velocity, Mass label, and Contact snap during grilling — use those terms verbatim in code, tests, and UI strings.
- **Known-limitation interplay:** the `≈` marker on paused-contact acceleration is the honest contract given that contact-force magnitudes are unavailable on the simulator seam; if that seam ever exposes magnitudes, the estimator and marker should be revisited together.
