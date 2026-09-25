# PHY-25: Polia com massa (Realism option)
Stage: done
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

#### Resolution (2026-09-24)

Verdict: Approve

Findings (review de `bd2f038`, `82c1395`, `7af7c46`, `0c8ee27`, `672abf9` contra `183c6d3`, diff completo lido; base do loop `sweatshop/2026-09-24-1853`):

- Critérios 1–7: ✅. Codec aceita `mass ≥ 0`, rejeita negativa e não-número, ausência sobrevive ao reparse (1). Atwood com `M = 2`: `a`, `T₁`, `T₂` por segmento dentro de 3% (2). Polia móvel com massa, `m₂ = 2` pela decisão do proxy, fórmula fechada intacta (3). `mass: 0` e ausente bit a bit iguais em 90 passos, estados e leitura; o caminho escalar refatorado (`ropeInvMass` recebe `along` como pulls, `freePoint`, `lengtheningRate`) faz a mesma aritmética na mesma ordem, e as suítes do PHY-23/24 passam no gate (4). Carry leva o giro do disco e `regrip` reparte os arcos; o teste segura `T` por segmento 60 passos (5). Nove mutações registradas, todas refeitas pelo review (6). Gate verde (7).
- Test-first: `bd2f038` só toca testes e o ticket; `82c1395` e `672abf9` só código e ticket. `7af7c46` e `0c8ee27` são commits só de teste (emenda do proxy e reforço mutate-verify), nenhum commit de código toca teste. Diff só em Primary files.
- Proxy decided: critério 3, `m₂` 1 → 2 — com `m₂ = 1` o contrapeso passava pelo eixo da polia fixa no passo 89, dentro da janela. Fórmula e tolerância intactas; o review confere: `a_load` e `T` batem com as formas fechadas desde o passo 0 nas duas massas.
- Spec: `tension` escalar = maior pedaço e `slack` só quando todos afrouxam — o spec não define o escalar com polia de massa; documentado em `RopeState`, fica como está. O ângulo do disco não sai em `readStates` (spec: "estado angular próprio") — não é critério, é assunto do editor/desenho (PHY-28/29). Estrutura de `gripShares` (`wrapAngle` nos dois deltas, teto |Δθ| < π por passo ≈ 47 m/s em R = 0,25), `pieceLengths` (pernas, arcos internos, quotas nas pontas), `segmentTensions` (soma `via.length + 1`) e o colisor de peso no Corpo dinâmico (massa pontual no eixo por eixos paralelos) conferidos índice a índice.
- Standards: ADR-0004 ("one mechanism", "no collider", "single iteration") não descreve os pedaços, `src/scene/index.ts:18-19` continua a dizer que a massa de polia é rejeitada, `correctPieces` sem o marcador `ponytail:` da projeção, `userForce` dos discos nunca limpa (sem efeito, translação travada), termos `grip`/`piece`/`share` fora do `CONTEXT.md`. Nenhum é critério deste ticket e três estão fora dos Primary files → `CLEAN-04`. Duplicação `pullPieces`/`pullRope` e `correctPieces`/`correctRope` é o preço do critério 4 (caminho escalar intocado); o ADR deve dizê-lo (CLEAN-04, critério 1).

Red-green: as nove mutações da tabela da etapa 2 refeitas uma a uma pelo review sobre `npx vitest run src/scene/codec.test.ts src/sim`, cada uma revertida antes da seguinte (árvore limpa conferida): (1) ignora `mass` — 3 failed, `expected 0.3270029330253601 to be less than or equal to 0.049049999999999996`; (2) massa 0 constrói disco — 2 failed, os dois testes de identidade; (3) massa não vai ao Corpo — 1 failed, `1.5182154432364872`; (4) torque não limpo — 3 failed, `0.3294128084182739`; (5) segmentos leem só o máximo — 3 failed, `1.6360066197394083 … 0.6867`; (6) carry perde o giro — 1 failed, `0.13645679712295533`; (7) carry sem `regrip` — 1 failed, `24.525000000000002 … 0.73575`; (8) codec rejeita 0 — 3 failed, `SceneParseError: pulleys[0]: mass must be a non-negative finite number`; (9) codec aceita negativa — 1 failed, `expected function to throw an error, but it didn't`. Todas batem com a tabela do ticket. Sem mutação, 156/156.

Gate em `672abf9` (ponta da sessão, rebase sem efeito): 29 arquivos, 549/549 testes, lint, typecheck, build (aviso de chunk > 500 kB, pré-existente).

Merge: `3e8d786` em `sweatshop/2026-09-24-1853`.
