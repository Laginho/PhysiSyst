# Physics Sim (`physics-sim`)

A web app that simulates classical mechanics problems: students compose scenes of textbook elements, adjust parameters like `m`, `M`, `F` live, and watch the scenario play out numerically. Primary audience is Brazilian students (pt-BR first).

## Language

### Scene composition

**Scene**:
A complete setup of one mechanics problem: its bodies, applied forces, contacts, pulleys, constraints, and constants. The unit of saving, sharing, and playing.
_Avoid_: level, world, problem (the *problem* is what the student solves; the *scene* is its representation)

**Body**:
A solid object in a scene, defined by a shape (rectangle, circle, or triangle) and whether it is fixed.
_Avoid_: element, object, block

**Fixed body**:
A body anchored in place (ground, wall). It participates in contacts but never moves.
_Avoid_: static platform; "ground" is just the common case

**Triangle**:
The three-sided body shape. The classic incline is a preset triangle, not a separate element species.
_Avoid_: wedge, ramp, inclined plane (as element names)

**Applied force**:
A force the user draws onto a body: pinned to a point on it, constant magnitude, fixed world-frame direction.
_Avoid_: load, thrust

**Initial velocity**:
A dynamic body's launch velocity (`v₀`), set before playback in world-frame components or polar form (magnitude + angle), drawn on the canvas like a force arrow.
_Avoid_: impulse, launch force, kick

**Mass label**:
The textbook symbol drawn inside a dynamic body: `M` for triangles, `m` for the other shapes, subscripted (`m_a`, `m_b`, `M_a`) whenever two bodies would share a symbol. Derived from the scene, never stored or hand-edited; fixed bodies carry no label.
_Avoid_: name, tag, body label

**Contact snap**:
The editing behavior that places a dragged body in direct contact with the neighbor it is dropped near, aligning the dragged body's rotation to the touched surface, and declares the Contact on release.
_Avoid_: grid snap, magnetic snap, magnet mode

**Contact**:
The interface between two touching bodies, carrying that pair's friction coefficients. Contacts are frictionless unless the scene states otherwise.
_Avoid_: surface settings, material

**Collision**:
The impact event between two bodies, governed by restitution — distinct from an ongoing contact.
_Avoid_: crash, bounce setting

**Anchor snap**:
The editing behavior that moves a clicked or dragged anchor point (of a rope, spring, pulley or applied force) onto the nearest body feature within a screen tolerance: center of mass, face midpoint or vertex. Outside the tolerance the anchor stays where clicked.
_Avoid_: magnet, point snap

**Constraint**:
A relation restricting how bodies move relative to each other: ropes and springs. Pulleys are what ropes pass over.
_Avoid_: joint, link

**Rope** (corda):
An ideal constraint between two anchored bodies, optionally passing over a sequence of pulleys: massless, inextensible, one-sided (it pulls, never pushes, and goes slack). Its length is never stored: it is the path length at the scene's initial positions, so a rope always starts taut. A pendulum is a rope with one end on a fixed body.
_Avoid_: string, cable, thread; "pendulum" as an element

**Pulley** (polia):
A circle of given radius mounted at an anchor on a body; ropes wrap it. On a fixed body it is a fixed pulley, on a dynamic body a movable one. Massless and frictionless by default; mass (a disk) is a realism option. The rope does not slip on a pulley with mass: the pulley turns with it, and the tension differs on each side.
_Avoid_: wheel, sheave; grip, piece, share (the simulator's words for how it solves a pulley with mass, defined in ADR-0004, not domain terms)

**Spring** (mola):
A constraint between two anchored bodies with stiffness `k`, natural length `x₀` and damping `c` (default 0). `x` is the current anchor distance and `Δx = x − x₀`; the spring stores `x₀`, so dragging a body changes `Δx`. Massless by default; mass is a realism option.
_Avoid_: `L₀` for the natural length, elastic

**Vector label**:
The letter drawn beside every vector arrow (`P`, `N`, `F`, `T`, `F_el`, `v₀` in pt-BR; `W` and `F_s` in en-US), numbered only when two of the same kind exist. Derived from the scene, never stored; never shows a value.
_Avoid_: arrow name, tag

### Physics stance

**Idealized default**:
Textbook simplifications hold unless overridden: massless inextensible ropes, massless frictionless pulleys, perfectly rigid bodies.
_Avoid_: simple mode, arcade mode

**Realism option**:
A per-element override relaxing exactly one idealization (e.g., giving a spring mass for ITA-style problems). Never a global mode.
_Avoid_: realistic mode, advanced physics

**Constants**:
Scene-level physical quantities such as `g`, editable freely — including unphysical values, which warn but never block.

**Particle mode**:
A scene-wide toggle that disables rotation, for intro-level problems where bodies behave as point masses.

### Distribution

**Preset**:
A ready-made scene shipped with the app so it is never empty on first open. Presets live in the Preset tree; the classic wedge-pushed-by-force problem is one of them.

**Preset tree**:
The gallery's organization: area → part → topic, following the textbook *Tópicos de Física* (the most popular convention when in doubt). Only nodes holding a preset are shown; presets within a topic go in increasing difficulty.
_Avoid_: level, category
