# PHY-25: Polia com massa (Realism option)
Stage: to-review
Status: ready-for-agent
Blocked by: PHY-24
Review: agent

- Primary files:
  - `src/scene/codec.ts`, `src/scene/codec.test.ts` (`mass ≥ 0` na polia)
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`

#### What to build

Uma polia pode ter massa `M` (disco, `I = ½MR²`). A corda não desliza nela, então a polia gira e a tração difere em cada segmento. Montada num Corpo dinâmico (polia móvel), `M` também entra na translação desse corpo, e o peso dela aparece na dinâmica. `mass` ausente ou 0 mantém o comportamento ideal, bit a bit igual ao do PHY-24. A leitura dos vínculos passa a devolver `T` por segmento.

#### Acceptance criteria

1. O codec aceita `mass ≥ 0` na polia e rejeita negativa; ausente = 0
2. Atwood com polia fixa de massa M: `a = (m₁−m₂)g/(m₁+m₂+M/2)` dentro de 3%; `T₁ = m₁(g − a)` e `T₂ = m₂(g + a)` dentro de 3%, lidos por segmento
3. Polia móvel de massa M montada num corpo de massa m, corda do teto contornando-a e subindo por uma polia fixa sem massa até um contrapeso m₂: `a = g(m + M − 2m₂)/(m + 3M/2 + 4m₂)` dentro de 3%
4. Com `mass = 0`, as trajetórias das famílias do PHY-23/24 não mudam (mesmos números dos testes existentes)
5. `replaceScene` com carry preserva a velocidade angular das polias com massa
6. Testes de regressão mutate-verified
7. Gate verde

#### Verification

    npx vitest run src/scene/codec.test.ts src/sim
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: `mass` da polia (1).
- `src/sim/acceptance.test.ts`: Atwood com polia de massa, polia móvel com massa, carry angular (2, 3, 5). Vermelho porque o simulador ignora `mass` da polia.

## Comments

Proxy decided: criterion 3 test amended, m₂ 1 → 2 — the m₂ = 1 counterweight passes the fixed pulley's axle at step 89, before the window closes; closed forms and tolerance unchanged. (Stage 2, 2026-09-24. Probe with the production simulator at m₂ = 1: a_load = −2.943 m/s² and T = 15.696 N from step 0, both the closed forms; counterweight y = 9.493 at step 88, 9.645 at step 89, segments jump to [123, 173, 173] N. Amended test red with the simulator ignoring the pulley mass: `expected 1.592534120423453 to be less than or equal to 0.021021428571428573` — the load goes up.)

Criterion 5 test strengthened (stage 2, 2026-09-24, AGENTS.md mutate-verify: a test green beside mutated code is hollow). With `regrip` removed from `replaceScene` the committed carry test stayed green: the disk is light, so it spins back to absorb piece 0 starting 0.206 m long and the blocks' Δv stays inside 3%. The test now also holds T₁, T₂ within 3% of the closed forms over the 60 steps after the carry; with `regrip` removed: `expected 24.525000000000002 to be less than or equal to 0.73575` (piece 0 slack).

Stage 2 done (2026-09-24). Mechanism: a pulley with `mass > 0` gets its own Rapier body — translation locked, gravity scale 0, ball collider of mass M so I = ½MR², touching nothing — kept on its axle by the rope code; on a dynamic mount its mass rides the mount as a contact-less point-mass collider. The rope splits into pieces at those pulleys; each piece runs ADR-0004's prediction and correction, and the pieces' tensions solve together (K is a matrix: the pieces couple through the disk; a piece whose T would go negative goes slack and the rest re-solve). No slip is held at position level: each disk carries a mark that splits the arc between its two pieces. `mass` absent or 0 builds nothing and takes the untouched PHY-24 path. The disks' torques are reset each step (`resetForces` does not clear torques — PHY-34, still open for the bodies).

Mutations (`src/sim/simulator.ts`, `src/scene/codec.ts`), each run over `npx vitest run src/scene/codec.test.ts src/sim`, then restored:

| Mutation | Red tests | Output |
| --- | --- | --- |
| simulator ignores the pulley mass | Atwood (2), movable (3), carry (5) | `expected 0.3270029330253601 to be less than or equal to 0.049049999999999996`; `expected 1.592534120423453 …0.021021428571428573` |
| mass 0 builds a disk | both mass-0 identity tests (4) | `expected Map{ 'teto' => … } to strictly equal Map{ 'teto' => … }` |
| disk mass not added to the mount | movable (3) | `expected 1.5182154432364872 to be less than or equal to 0.021021428571428573` |
| disk torque not reset | Atwood, movable, carry | `expected 0.3294128084182739 to be less than or equal to 0.049049999999999996` |
| segments read the one max tension | Atwood, carry (T₂), movable (T leg 3) | `expected 1.6360066197394083 to be less than or equal to 0.6867` |
| carry drops the disk spin | carry (5) | `expected 0.13645679712295533 to be less than or equal to 0.049049999999999996` |
| carry skips the arc re-split | carry (5) | `expected 24.525000000000002 to be less than or equal to 0.73575` |
| codec rejects mass 0 | accepts mass 0, both identity tests | `SceneParseError: pulleys[0]: mass must be a non-negative finite number` |
| codec accepts a negative mass | rejects negative mass | `expected function to throw an error, but it didn't` |

Red-green: at `bd2f038` (tests only) 10 red — codec rejects any `mass`, readout has no `segments`. After the codec commit `82c1395`, 4 red, all for the simulator: Atwood `a` off by 20% (`0.327 > 0.049`), movable, carry, readout shape. With the simulator commit: `npx vitest run src/scene/codec.test.ts src/sim` 156 passed.

Gate (`npm test && npm run lint && npm run typecheck && npm run build`): 29 files, 549 tests passed; lint and typecheck clean; build ✓ (the existing >500 kB chunk warning).

Outside the Primary files, left for stage 3: `src/scene/index.ts:18` still says "Until PHY-25 they also reject a pulley mass" (stale now), and ADR-0004 has no section on the pieces mechanism.
