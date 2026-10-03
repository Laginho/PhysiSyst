# Restitution on declared contact pairs

## Context

Contact carries a pair's coefficient of restitution `e` (absent means zero).
Rapier exposes restitution per collider with a combine rule; its JavaScript
hooks cannot modify solver contacts. This is the same boundary described in
[ADR-0003](0003-friction-on-contact-pairs.md) for friction.

## Decision

Solve `log(r_a) + log(r_b) = log(e)` over positive declared edges, component by
component. A bipartite component has a free parameter (chosen as zero); odd
cycles pin it. Use per-body factors with the Multiply combine rule. Bodies
outside positive edges have factor zero. A declared zero (including absent
`e`) conflicts when both endpoints have positive factors.

Inconsistent constraints or factors that cannot be represented as finite,
positive numbers fall back for the whole scene to each body's maximum declared
`e` (zero without positive declarations), with the Min rule and one warning:
`contact e-graph has inconsistent constraints; restitution degraded to per-body max with Min rule`.
Friction and restitution solve independently and retain both sets of warnings.
Pulley rims retain zero restitution and Min; Multiply takes precedence over
Min, so a rim remains inelastic with either mapping.

## Consequences

Solvable declared interfaces get their specified restitution. Undeclared pairs
between bodies participating in other positive pairs inherit `r_a * r_b`;
this residual deviation is accepted, as in ADR-0003. An undeclared ground body
has factor zero, so a sphere with an elastic pair elsewhere still cannot bounce
on that ground. Fallback is approximate and can fail to preserve declared zero
pairs, which is why it emits a warning. No per-body material controls are exposed.
