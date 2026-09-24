# Ropes are our own constraint, solved around `world.step()`

A rope is not a Rapier joint. The simulator solves it itself, once per step, in the hook that already applies the applied forces. One mechanism covers every rope over ideal pulleys, or none; a rope over a pulley with mass (PHY-25) runs the same prediction and correction once per **piece** of rope, solved together (below). `step()` picks the path per rope on `rope.grips.length`.

## Why not Rapier's rope joint

- Rapier 0.20 has no pulley joint. A rope over a pulley constrains a **sum** of distances (`L₁ + L₂ = const`), and no Rapier joint can express that. Its rope joint only caps the distance between two points.
- Rapier returns no force from any joint. The readout panel needs `T`, and with our own constraint `T` falls out of the calculation.
- One mechanism for every rope keeps the pendulum, pulleys in series and the movable pulley (PHY-24) on the same code path as the tracer.

## Mechanism

`L` is the rope's path length (tangent legs plus wrapped arcs, `ropePath`) at the **document** poses, computed when the world is built. `replaceScene` applies any carry only after the build, so a structural edit during playback never changes `L`.

The rope pulls at each of its points in path order: each end along its one leg, and each pulley along the sum of the leg that arrives and the leg that leaves — so a pulley on a dynamic body (a movable pulley) is pulled at its axle. Per unit tension that pull `u` is also minus the gradient of the path length at the point. Pulls that land on one body (a movable pulley and a rope end on the same body) are summed before the body's mass enters. Each step, for each rope:

1. **Before the step (prediction, by position).** Integrate each point's free motion over the step the way Rapier does — gravity and the forces already added, no contacts, no rope. Rapier splits the step into `n = world.numSolverIterations` substeps, so a constant acceleration moves a body `φ = (n + 1)/2n` of the Euler distance `Δt²·a` while its velocity still gains `Δt·a` in full (measured 5/8 at `n = 4`). The target is where the step should leave the rope: at `L` if it was slack (no pull if the free step stays short of `L`), or with 20% of any stretch pulled back. The tension is the one that moves the free end-of-step length onto that target, `T = (c_free − target) / (φ·Δt²·K)`, plus last step's residual, clamped at `T ≥ 0` and applied as a force so Rapier's contact and friction solve sees it.
   - The pull goes along the legs of the **mid-step** rope (every point halfway to its free end-of-step position). Legs turn while the step runs: along the old legs the pull misses the centripetal part of a swing, along the end-of-step legs it does work against the swing and drains ~2% of `v²` per step. Along the mid-step legs it is square to the chord each point travels.
   - `K = Σ J M⁻¹ J′ᵀ` over bodies is asymmetric: `J` is the mid-step pull applied, `J′` the end-of-step length gradient it acts against. It can go negative, which reads as "no rope this step".
   - The prediction also records the reading a contact-free step should end with — the rate form of the same pull — so the residual carries only what contacts add.
2. **`world.step()`.**
3. **After the step (correction).** Contacts and friction made the prediction wrong. An impulse along the rope removes whatever lengthening rate is left beyond the rope's allowance, clamped so the total tension never goes negative (the rope never pushes). The tension this implies is the reading; its excess over the recorded prediction is the **residual** that warm-starts the next step.

Prediction and correction share one allowance (`ropeAllowance`): a slack rope may close its gap in one step, a stretched one must pull back 20% of the stretch. A correction that aimed at zero lengthening would undo the pull-back, and the warm start would cancel the next one.

The rope is unilateral: `T = 0` and `slack = true` whenever no pull is needed. The jerk that pulls a slack rope taut is in the prediction, so it never becomes a warm start (a rate prediction let it through and pulled the bodies 2 cm inside `L`). The warm start is what makes a rope exact under friction: without it, the block on the table drifts 1.4–2.7 mm off `L` in 1.5 s.

## Pulleys with mass (PHY-25)

A pulley with `mass > 0` is a disk the rope does not slip on, so it turns and the tension differs on each side.

- **The disk** is a Rapier body of its own: translation locked, gravity scale 0, a ball collider of mass `M` (so `I = ½MR²`) in collision group 0, touching nothing. `placeDisks` sets it onto its axle before every read of the rope. Mounted on a dynamic body, the pulley's mass also rides the mount as a second contact-less collider, `setMassProperties(M, 0, 0)` placed at the anchor: a point mass on the axle, which by parallel axes adds `M` to the mount's translation and `M·d²` to its inertia, and makes the pulley's weight act on the mount. `mass` absent or 0 builds nothing.
- **Grips and pieces.** Each pulley with mass on a rope's path is a **grip**; the grips cut the rope into **pieces**, each of fixed length taken at the document poses like `L`. A piece runs from an end or grip to the next grip or end, with any ideal pulleys inside it wrapped as before. A grip pulls its mount at the axle and its disk at the tangent point, both along the piece's one leg there: the axle takes the force, the disk the torque.
- **No slip, at position level.** Each grip keeps a **share**: the angle of its arc that belongs to the arriving piece, measured from where the rope meets the disk; the leaving piece holds the rest. The mark turns with the disk: `gripShares` adds the disk's turn since the last update and subtracts the meeting point's drift, both through `wrapAngle`, so either may change by less than π per step (≈ 47 m/s of rope at `R = 0.25`). `pieceLengths` sums each piece's legs, the arcs inside it and its shares of the grips at its ends. The shares start mid-arc and catch up with the disks after every step in `correctPieces`.
- **Tensions solve together.** Prediction (`pullPieces`) and correction (`correctPieces`) are the scalar rope's, once per piece: the disk's free turn joins the free motion, and the allowance and 20% pull-back apply per piece. Two pieces couple through the disk they share and any body both pull, so `K` is a matrix, `Kₖₗ = J′ₖ M⁻¹ Jₗᵀ` (`ropeInvMass(pulls, along)`), and `tautTensions` solves `K(T − base) = b` with `solveLinear` (partial pivoting) as an active set: a piece whose `T` would go negative goes slack and the rest re-solve. `RopeState.tension` is the largest piece's, `slack` only when every piece is; `segments` gives each leg its piece's `T`.
- **Torques.** `resetForces` does not clear torques, and nothing but the rope drives a disk, so `step()` clears the disks' torques every step as well (bodies: PHY-34).
- **Carry.** The disks are not bodies of the document, so `replaceScene` takes each surviving disk's spin from the live world, and `regrip` resets every share so each piece holds its length again at the carried poses — as if the rope had never slipped.

The scalar path (`pullRope`/`correctRope`) stays separate even though one piece is the scalar rope: PHY-25 criterion 4 wants `mass` absent or 0 to run bit for bit like PHY-24, and folding the scalar rope into the matrix path would reorder its arithmetic. The duplication between `pullPieces`/`pullRope` and `correctPieces`/`correctRope` is that price.

## Measured (60 Hz, current mechanism)

PHY-23 families, 1 s window after a 0.5 s settle; tolerances 2% (Atwood), 5% (table) and 1 mm:

| Family | `a` error | max `T` error over the window | max \|path − L\| over the 1.5 s run |
|---|---|---|---|
| Atwood 3 / 2 kg | 0.000% | 0.004% | 0.0002 mm |
| Atwood 2.5 / 1.5 kg | 0.000% | 0.004% | 0.0002 mm |
| Table 2 kg, hanging 1 kg, μₖ = 0.2 | 0.027% | 0.490% | 0.26 mm |
| Table 2 kg, hanging 1 kg, μₖ = 0.1 | −0.001% | 0.069% | 0.15 mm |

PHY-24 families:

| Family | Measured | Tolerance |
|---|---|---|
| Pendulum, `L` = 1 m, θ₀ = 10° | period 0.20% off `2π√(L/g)` over 3 oscillations | 2% |
| Loop, `L` = 1 m, `v₀² = 6gL` | max \|dist − L\| 0.045 mm over the first turn, `T > 0` throughout; ~4% of the energy lost per turn | 1 mm |
| Slack, two blocks passing at 2 m/s in zero g | `T = 0` while closer than `L`; retaut at `L` + 0.002 mm | 1 mm |
| Movable pulley, load 3 kg, counterweight 1 kg | `a` error 0.000%, max `T` error 0.009%, max \|path − L\| 0.001 mm | 2%, 1 mm |
| Atwood 3 / 2 kg over two fixed pulleys | `a` error 0.000%, max `T` error 0.004%, max \|path − L\| 0.0002 mm | 2%, 1 mm |

PHY-25 families, pulley radius 0.25 m, 60-step window after a 0.5 s settle; `T` per segment against the closed forms; path error over the whole run:

| Family | Measured | Tolerance |
|---|---|---|
| Atwood 3 / 2 kg over a fixed pulley, `M = 2` | `a` error −0.001%, max `T₁` / `T₂` error 0.016% / 0.015%, max \|path − L\| 0.074 mm | 3% |
| Same, `replaceScene` with carry at 0.5 s | `a` error −0.002%, max `T₁` / `T₂` error 0.013% / 0.014%, max \|path − L\| 0.074 mm | 3% |
| Movable pulley `M = 2` on a 3 kg load, counterweight 2 kg | `a` error −0.003%, max counterweight-leg `T` error 0.029%, max \|path − L\| 0.006 mm | 3% |
| `mass: 0` vs absent, Atwood and movable pulley | states and readout bit for bit equal over 90 steps | exact |

The substep factor matters: with `φ = 1` the loop stretches 11.6 mm. The declared risk, a constraint outside Rapier's solver failing to converge alongside contact and friction, did not show up. ADR-0001 stands.

## Consequences

- Ropes on shared bodies are solved one after another in document order, one pass per step (Gauss–Seidel with a single iteration). The pieces of one rope solve together, but two ropes still do not. If coupled ropes (block-and-tackle, PHY-24) miss their tolerance, iterate the correction pass before changing the mechanism.
- The correction projects the end-of-step chord velocity back onto the rope, and that projection drains a fast swing: ~4% of a 1 m loop's energy per turn at `v₀² = 6gL`. It is marked `ponytail:` in `correctRope` (and `correctPieces` points there); the upgrade is a RATTLE-style position-and-velocity projection, if energy readouts ever need it.
- `φ` is read from `world.numSolverIterations`; it assumes Rapier's substepping stays the one measured here (Rapier 0.20).
- Ropes have no collider: a rope passes through bodies, and it is drawn from the same `ropePath` the simulator solves on. A pulley with mass has colliders only to carry its mass, in collision group 0: it passes through bodies too.
- A disk may turn less than π per step, or `gripShares` reads the turn the wrong way round.
- The spring does **not** use this mechanism. It uses Rapier's spring joint, which already expresses it (spec, PHY-26).
