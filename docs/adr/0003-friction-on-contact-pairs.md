# Friction lives on explicit contact pairs, not on body surfaces

Problems state friction per interface — "μ entre m e M, liso no resto" — so a scene carries explicit Contact objects between touching bodies, frictionless by default, each holding that pair's μₛ and μ_k. This deviates from physics-engine convention (per-collider friction combined by rule) because combine-rule guesswork silently yields wrong answers for textbook cases, and the domain vocabulary is pair-shaped anyway.

## Consequences

- Do not expose per-body friction sliders; the editor surfaces contacts (select two touching bodies → edit the interface).
- Scenes with many touching bodies accumulate contact entries; acceptable at academic scene sizes.

## Addendum — 2026-08-23 (v1, T2 gate iteration 2)

The engine constraint behind this ADR turned out sharper than originally written: `@dimforge/rapier2d-compat` 0.20's JS bindings expose **no solver-contact modification** (`PhysicsHooks` is filter-only), so literal per-pair μ cannot reach the solver. Pair semantics are restored indirectly:

- **Mechanism**: per-collider friction *potentials* — solve `f_u + f_v = 2·μ_k` over the declared contact edges (spanning-forest parametrization with cycle-closure constraints; exact whenever a non-negative solution exists, including odd cycles). Only genuinely infeasible systems fall back whole-scene to per-body-max friction + MaxCombineRule, with a warnings[] entry.
- **Guarantee**: every *declared* interface gets its exact μ_k whenever the potential system admits a non-negative solution (infeasible systems fall back whole-scene to the approximating Max-mapping + warning). This is what kills the naive Max-mapping as a default, which provably fails the flagship case `pair(wedge, ground) = 0` while the wedge carries μ = 0.3 against the block.
- **Accepted residual deviation**: an *undeclared* physically-touching pair can inherit non-zero effective friction when both bodies carry positive potentials from their own declared edges (e.g., wall–base 0.5 and base–top 0.5 leak 0.5 onto an undeclared base–ground touch). Story 11's "frictionless unless declared" is therefore guaranteed **exactly for declared interfaces**, approximately elsewhere. Accepted because: (a) exact mitigation is impossible without solver access; (b) collision-filtering undeclared pairs would break live collision behavior (story 18); (c) manual impulse zeroing needs the same missing solver access; (d) textbook scenes rarely create undeclared touches between multiply-contacted bodies, and story 12's auditable contact list remains the user's control surface. Revisit if v1.x gains native per-pair coefficients or a different engine.

This addendum supersedes the absolute reading of "no combine rules" above: one combine rule (Average) plus solved potentials is now the implementation of pair friction, chosen because it reproduces the pair contract wherever the document declares one.

