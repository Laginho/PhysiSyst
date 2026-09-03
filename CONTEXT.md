# Physics Sim (`physics-sim`)

A web app that simulates classical mechanics problems: students compose scenes of textbook elements, adjust parameters like `m`, `M`, `F` live, and watch the scenario play out numerically. Primary audience is Brazilian students (pt-BR first).

## Language

### Scene composition

**Scene**:
A complete setup of one mechanics problem: its bodies, applied forces, contacts, constraints, and constants. The unit of saving, sharing, and playing.
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
The editing behavior that places a dragged body in direct contact with the neighbor it is dropped near, aligning the dragged body's rotation to the touched surface. The only snapping the editor offers.
_Avoid_: grid snap, magnetic snap, magnet mode

**Contact**:
The interface between two touching bodies, carrying that pair's friction coefficients. Contacts are frictionless unless the scene states otherwise.
_Avoid_: surface settings, material

**Collision**:
The impact event between two bodies, governed by restitution — distinct from an ongoing contact.
_Avoid_: crash, bounce setting

**Constraint**:
A relation restricting how bodies move relative to each other: ropes, springs, pulleys.
_Avoid_: joint, link

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
A ready-made scene shipped with the app so it is never empty on first open. The classic wedge-pushed-by-force problem is preset #1.
