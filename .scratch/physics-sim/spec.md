# Spec: physics-sim v1

Status: ready-for-agent

Related: [ADR-0001 Rapier2D](../../docs/adr/0001-rapier2d-physics-engine.md) · [ADR-0002 Idealized default](../../docs/adr/0002-idealized-default-realism-opt-in.md) · [ADR-0003 Contact-pair friction](../../docs/adr/0003-friction-on-contact-pairs.md) · [Glossary](../../CONTEXT.md)

## Problem Statement

A Brazilian physics student revises with textbook problems (wedge pushed by a force, blocks on inclines, projectiles, collisions) but static figures can't show *why* the answers come out the way they do. Changing one number — `m`, `M`, `F`, `α`, `μ` — means re-solving everything by hand, and harder exam styles (ITA) relax idealizations in ways standard tools don't support. Existing simulators are either game-y (unrealistic, jittery, wrong for academic cases) or rigid single-purpose applets that can't be reshaped into the problem on the next page of the workbook.

## Solution

A web app where the student composes any classical mechanics **Scene** out of textbook elements — bodies, applied forces, contacts — hits play, and watches the scenario unfold with correct, idealized-textbook behavior. Parameters stay editable while the simulation runs: drag `F` up mid-slide and watch the block respond. Scenes persist and reload, a preset gallery opens the app with the classics already built (the wedge-with-force problem is preset #1), and everything speaks pt-BR first with accurate physics terminology.

## User Stories

### Composing scenes

1. As a student, I want to drag a new Body onto the canvas from an element palette, so that I can start building a scene without touching forms.
2. As a student, I want to choose each Body's shape — rectangle, circle, or triangle — so that I can represent blocks, balls, and inclines.
3. As a student, I want a triangle Body to come with an angle handle for `α`, so that setting up the classic incline takes seconds.
4. As a student, I want to toggle any Body between movable and Fixed, so that the same rectangle can be ground, wall, or a falling block.
5. As a student, I want to move, rotate, and resize Bodies with handles plus exact numeric entry in a properties panel, so that rough positioning is fast and final values are precise.
6. As a student, I want optional snap-to-grid while dragging, so that aligning a block on an incline is clean.
7. As a student, I want to duplicate and delete Bodies, so that multi-block scenes take seconds.
8. As a student, I want to attach an Applied Force to a chosen point on a Body with a magnitude and direction, so that I can model exactly the `F` arrow from the problem figure.
9. As a student, I want the Applied Force to keep world-frame direction regardless of Body rotation, so that horizontal pushes stay horizontal as things tilt.
10. As a student, I want to select two touching Bodies and set that Contact's `μₛ` and `μ_k`, so that I reproduce "atrito entre m e M, liso no resto".
11. As a student, I want Contacts to be frictionless unless I say otherwise, so that scenes match idealized problem statements by default.
12. As a student, I want to see the Contacts of a scene listed and editable, so that I can audit which interfaces have friction before playing.

### Constants and physicality

13. As a student, I want `g` editable per Scene, so that I can simulate Moon or elevator problems.
14. As a student, I want to enter unphysical values (negative mass, zero gravity) and get a warning instead of a block, so that I can explore edge cases without fighting the tool.
15. As a student, I want all quantities in SI units everywhere, so that values match my coursework.

### Playing and observing

16. As a student, I want play/pause/reset controls, so that I control when time advances.
17. As a student, I want a speed slider (0.25×–2×) and single-frame step, so that I can slow down a collision until it's legible.
18. As a student, I want collisions between Bodies resolved live during playback, so that impact problems just happen.
19. As a student, I want Bodies that leave the viewport to keep moving off-screen rather than hitting invisible walls or resetting, so that the world doesn't lie about boundaries.
20. As a student, I want to change parameters (forces, masses, friction) *while* the simulation plays, so that I can feel how each quantity drives the outcome.
21. As a student, I want live force vectors drawn on Bodies — Weight at center of mass, normals at contact points, Applied Forces where pinned — so that I can see the free-body diagram evolve.
22. As a student, I want a readout panel showing per-Body position, velocity, and acceleration, so that I can check numbers against my own algebra.
23. As a student, I want a Particle-mode toggle disabling rotation scene-wide, so that intro-level point-mass problems behave as points.

### Scenes over time

24. As a student, I want my Scene autosaved in the browser, so that a refresh never loses work.
25. As a student, I want multiple saved Scenes to switch between, so that I can keep one exercise per problem.
26. As a student, I want to export a Scene to a `.json` file and import it back, so that I can share problems with classmates.
27. As a student, I want a Preset gallery on first open — including the wedge-pushed-by-force problem as preset #1 — so that the app demonstrates itself before I build anything.
28. As a student, I want to start from a blank canvas, so that Presets never box me in.

### Language and devices

29. As a Brazilian student, I want the UI in pt-BR by default with correct terminology (polia, atrito estático/cinético, corpo rígido), so that nothing gets lost in translation from my textbook.
30. As a student, I want an EN language option that uses accurate English physics terminology, so that the tool works for reference material in English too.
31. As a student on a phone, I want to open a Preset, press play, and tweak parameter sliders on touch, so that revision works on the bus.
32. As a student on desktop, I want full drag-and-drop editing with mouse precision, so that building complex Scenes stays fast.

## Implementation Decisions

- **Stack**: TypeScript + React + Vite, scaffolded at repo root, package name `physics-sim`. No backend; everything client-side.
- **Engine** (ADR-0001): dynamics run on Rapier2D (WASM). The app steps a fixed-timestep world deterministically and renders interpolated frames; speed multiplier scales steps-per-frame, never timestep size.
- **Scene document model**: a versioned Scene document holding `constants` (currently `g`), `bodies`, `forces`, and `contacts`. Versioned so future migrations (constraints in v1.x) don't break saved files.
- **Body model**: shape (`rectangle | circle | triangle`) + fixed flag + geometry/mass properties. There is no separate "ground" species — ground is a big Fixed rectangle; the incline ("cunha") is a preset Triangle (per glossary).
- **Force model**: Applied Force references a Body, an anchor point on it, a magnitude, and a world-frame direction. Weight is implicit from `g` and mass, applied at center of mass; normals arise from contacts at contact points. Torque correctness falls out of these application points; Particle mode disables rotation globally instead.
- **Contacts** (ADR-0003): explicit pair objects between touching Bodies carrying `μₛ`/`μ_k`, frictionless by default. Not per-body surface coefficients; no combine rules.
- **Idealized defaults** (ADR-0002): elements behave as textbook-idealized by default. Realism overrides (massive spring, air drag, adjustable restitution) are *not* in v1 — the Scene schema and element property panels are shaped so they bolt on per-element later without migration pain.
- **Live editing semantics**: parameter edits during playback mutate the running world immediately; structural edits (adding/removing Bodies) are allowed and rebuild the world from the Scene document at the current frame boundary.
- **Rendering**: Canvas 2D with a fixed camera and a world↔screen transform; vector overlay draws scaled arrows; grid renders beneath with a snap toggle.
- **Validation**: soft-only — unphysical values warn inline but never block input.
- **Persistence**: autosave to localStorage keyed per Scene; export/import flows through the same codec as loading, so there is exactly one serialization path.
- **i18n**: message-catalog based, pt-BR default catalog, EN secondary; catalogs reviewed for terminology accuracy, not literal translation. Physics symbols (`m`, `M`, `F`, `α`, `μ`) render identically in both.

## Testing Decisions

- **What makes a good test here**: asserts externally observable behavior only. Feed a Scene through the public simulation API, step it, and assert body states against closed-form solutions within tolerance. Never inspect engine internals, Rapier objects, or React state.
- **Seam 1 — Simulator boundary (carries ~95% of tests)**: build world from Scene → step → read back positions/velocities/rotations/contact forces. Acceptance cases: block alone on incline matches `a = g(sinα − μcosα)`; wedge + horizontal `F` at `(M+m)g·tanα` keeps the block stationary relative to the wedge; projectile traces the parabola/range formulas; 1D elastic and inelastic collisions satisfy momentum and restitution equations; frictionless free-fall matches `h(t)`.
- **Seam 2 — Scene codec (thin)**: parse/serialize/validate. Table-driven tests: valid minimal scenes, each invalid mutation producing its specific error, round-trip identity.
- **Prior art**: none — greenfield. Test runner is Vitest (pairs with Vite); physics acceptance tolerances documented per case.
- **No UI/e2e tests in v1**: canvas interaction is verified manually until the app stabilizes.

## Out of Scope

- AI image → Scene parsing (phase 2; requires this Scene model to exist first)
- Analytical solver layer (computed accelerations, critical-F finders, worked answers)
- Constraints: ropes, pulleys, springs — and their Realism options (massive spring)
- Air drag, adjustable restitution, time-varying forces `F(t)` / expression-driven parameters
- Position/velocity-vs-time graphs
- Custom polygon shapes beyond rectangle/circle/triangle
- Cloud sync, accounts, sharing server
- Touch-first editing UX (playback-on-mobile is in scope; editing-on-mobile is not)
- Deployment/hosting choice (static-compatible; decide at first deploy)

## Further Notes

- Primary audience is Brazilian students; pt-BR terminology quality is a product feature, not polish.
- The wedge-with-force Preset must visually match the classic figure (block `m` on incline `M`, angle `α`, horizontal `F` on the wedge, hatched ground).
- Physics notation stays universal across languages; only UI chrome translates.
- Deterministic stepping matters: same Scene + same edits ⇒ same trajectory, or acceptance tests and classroom reproducibility both fall apart.
