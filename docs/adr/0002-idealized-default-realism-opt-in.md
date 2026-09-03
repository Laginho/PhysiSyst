# Idealized textbook physics by default, realism as per-element opt-in

Problems state themselves in idealizations (massless ropes, frictionless pulleys, rigid bodies), so the simulator's defaults match them exactly. Harder exams (e.g., ITA) relax individual idealizations — a spring with mass, drag — so realism is a per-element property that overrides one idealization at a time, mirroring how a problem statement relaxes it.

## Consequences

- There is deliberately **no global "realistic mode"**; don't add one.
- Elements carry idealization defaults (spring `mass = 0`, rope inextensible) that look like bugs to someone expecting game-engine realism; they are the product.
