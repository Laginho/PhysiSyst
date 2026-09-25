# PHY-30: Mola com massa (Realism option)
Stage: done
Status: ready-for-agent
Blocked by: PHY-27, PHY-29
Review: agent

- Primary files:
  - `src/scene/types.ts` (`mass?` em `Spring`)
  - `src/editor/doc.ts` (`SpringPatch` ganha `'mass'`)
  - `src/scene/codec.ts`, `src/scene/codec.test.ts` (`mass ≥ 0` na mola)
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`
  - `src/render/overlay.ts`, `src/render/overlay.test.ts` (`F_el` diferente em cada ponta)
  - `src/App.tsx`, `src/App.test.ts` (campo de massa no inspetor, leitura por ponta)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

Uma mola pode ter massa `mₛ`. Por dentro, o simulador a representa como uma cadeia escondida de N corpos pequenos ligados por N+1 molas, sem colisão; por fora, continua sendo uma mola só, desenhada igual. A força elástica passa a poder diferir entre as pontas, e a leitura, as setas e o painel mostram as duas. `mass` ausente ou 0 mantém a mola ideal do PHY-26 exatamente como é.

Pode ser cortado sem prejuízo do resto do ciclo.

#### Acceptance criteria

1. O codec aceita `mass ≥ 0` na mola e rejeita negativa; ausente = 0
2. Massa-mola horizontal com `mₛ = 0,1·m`: período dentro de 3% de `2π√((m + mₛ/3)/k)`
3. Durante a aceleração, `F_el` lida em cada ponta difere; com `mₛ = 0`, é igual nas duas (critério 5 do PHY-26 continua)
4. Os corpos escondidos não aparecem em `readStates`, não colidem, e `replaceScene` com carry não produz salto (trajetória contínua dentro da tolerância do critério 2)
5. Setas e rótulos `F_el` usam o valor da própria ponta
6. Inspetor da mola ganha o campo de massa; o painel mostra `F_el` por ponta quando `mₛ > 0`
7. Strings novas nos dois catálogos
8. Testes de regressão mutate-verified; testes novos no `App.test.ts` com mutação e saída vermelha registradas
9. Gate verde

#### Verification

    npx vitest run src/scene/codec.test.ts src/sim src/render src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: `mass` da mola (1).
- `src/sim/acceptance.test.ts`: período com massa, `F_el` por ponta, carry sem salto (2–4). Vermelho porque o simulador ignora `mass` da mola.
- `src/render/overlay.test.ts`: seta por ponta com valor próprio (5).
- `src/App.test.ts`: campo de massa e leitura por ponta (6).

## Comments

Proxy decided: add `src/scene/types.ts` (`mass?` on `Spring`) and `src/editor/doc.ts` (`SpringPatch` gains `'mass'`) to Primary files, no new criterion — both are type-only lines criteria 1 and 6 cannot typecheck without, mirroring `PulleyPatch`; a stage-1 omission, reversible, no new seam.

### Stage 2 (2026-09-24)

**Commits.** `664e362` test-only (the four test files plus this ticket, Stage → implementing). `41ec7b8` code, touches no test file. This commit: Stage → to-review and this record.

**The chain.** 8 nodes of mₛ/8 on the spring's axis, joined to each other and to the ends by 9 springs of 9k, x₀/9, 9c. With 8 nodes the end's effective mass is 0.315·mₛ against the continuum's 1/3. The nodes are plain numbers in the simulator, not Rapier bodies. So they never collide, never reach `readStates`, and stay on the axis: free 2D nodes buckle under compression and sag under gravity. The weight along the axis loads the chain; the part across it is dropped (mₛ ≪ m). How the stepping was chosen, all measured on the horizontal case m = 1, k = 40, mₛ = 0.1, A = 0.1:

- **Explicit, substepped chain** (first try): the period was fine, but energy pumped into the internal modes. At k = 400, mₛ = 0.01 the ends' forces jittered by ±100 N on a 40 N reading.
- **Implicit (backward Euler), tension at the step's end**: stable, but the block lost two thirds of its amplitude in 10 periods. The same energy error ADR-0004 found for PHY-26: the force must see the ends (1 − φ)Δt ahead, not Δt.
- **Chain run behind the bodies**: the nodes run (θ − 1 + φ)Δt behind the bodies, so the θ-weighted tension each end gets sees them (1 − φ)Δt ahead. With θ = 1 the loss dropped to 5.5% in 10 periods.
- **θ = 0.55**, and the readout is the force each end got over the last step. The θ-weighting cancels the nodes' Nyquist ringing exactly. The block keeps 99.4% of its amplitude over 10 periods and 97.4% over 30. Readout noise is 0.003 N (0.009 N at k = 400, mₛ = 0.01). θ = 0.5 keeps 100% of the amplitude but the node ringing never dies (0.23 N of noise).

Results at θ = 0.55: period within 0.12% of `2π√((m + mₛ/3)/k)` (the massless period is 1.5% off). F_b − F_a against mₛ·a/2 has a least-squares slope of 1.01. Vertical equilibrium is within 0.015% of `(m + mₛ/2)g/k`. A carried rebuild resumes each chain by spring id with zero trajectory difference. A spring with mₛ = 2.5·m (outside mₛ ≪ m) stays stable but damps. mass absent or 0 builds no chain: the PHY-26 path runs unchanged, and its tests pass untouched.

**Criterion 5, arrows.** `elasticArrows` already sized each end by its own reading (PHY-29). The new arrow test (`spring with mass (PHY-30): each end sized by its own F_el`) was green in the red commit, and mutation 10 is its proof. What was missing was the label: the key is now per end when the spring has mass, so the ends read `F_el,1` / `F_el,2`, the rule a pulley with mass already follows for T.

**Readout (criterion 6).** With mₛ > 0 the panel shows `F_el em <body>` for each end (`F_s on <body>` in en), in place of the single `F_el`. The inspector gains `mₛ (kg)`. A negative value is refused with the shared warning, now worded "k e x₀ devem ser positivos; c e mₛ, não negativos".

**Tests beyond the numbered criteria**, all in `acceptance.test.ts` and all red at the red commit: amplitude after 5 periods within 2% (pins the lag), the readout equals the force the block felt (m·Δv/Δt = −F_b within 0.5%), and the vertical equilibrium (pins the weight term).

**Red proof.** At `664e362`: 17 failed. Codec 6: `unknown key 'mass'`. Acceptance 8: the codec throws. Overlay 1: labels `['F_el', 'F_el']`. App 2: `missing input for mₛ (kg)`. With only `codec.ts` and `types.ts` from the code commit applied, the simulator tests go red for the simulator's own reason. Seven fail: the massless period (0.0169 ≥ the 0.00046 gap to the massive period), `F_b − F_a = 0`, weight `mg/k` (0.0245 off, 0.0054 allowed), and the readout off from the felt force (0.0278 vs 0.0209). The eighth, `mₛ = 0 is the ideal spring`, is green there: correct, since the ideal spring already reads the same at both ends.

**Mutate-verify** (each applied alone to production code, the listed suite run, then reverted):

| # | Mutation | Result |
|---|---|---|
| 1 | `codec.ts`: the optional-field loop reads only `c` (mass dropped) | 6 red (3 round-trips, 3 rejections) |
| 2 | `codec.ts`: negative mass accepted | 1 red (`rejects mass 'negative'`) |
| 3 | `simulator.ts`: `newChain` always null | 7 red (all PHY-30 but `mₛ = 0`) |
| 4 | `simulator.ts`: chain lag 0 | 2 red (horizontal ×2: amplitude 0.0213 and 0.0173 off, 0.002 allowed) |
| 5 | `simulator.ts`: readout takes the instantaneous chain tension | 2 red (slope 1.51; felt vs read 0.18 N off) |
| 6 | `simulator.ts`: no gravity on the chain | 1 red (vertical: 0.0248 off, 0.0054 allowed) |
| 7 | `simulator.ts`: carry re-places the chain evenly | 1 red (carry: F_a −3.024 after vs −3.234 before) |
| 7b | `simulator.ts`: carry leaves the chain at the document poses | 1 red (carry: F_a 4.000 after vs −3.234 before) |
| 8 | `simulator.ts`: end b gets end a's force | 6 red |
| 9 | `overlay.ts`: one label key per spring with mass | 1 red: `['F_el', 'F_el']` vs `['F_el,1', 'F_el,2']` |
| 10 | `overlay.ts`: b's arrow sized by `force.a` | 1 red: vec.y −1 vs −0.667 |
| 11 | `App.tsx`: mass field writes `{ c: v }` | 2 red: `mₛ (kg)` reads 0, expected 0.2; readout lacks `F_el em parede: 2.00 N` |
| 12 | `App.tsx`: `commitSpringEdit` drops `mass ≥ 0` | 1 red: `mₛ (kg)` reads −1, expected 0.2 |
| 13 | `App.tsx`: per-end readout branch never taken | 1 red: readout lacks `F_el em parede: 2.00 N` |
| 14 | `App.tsx`: b's line shows `force.a` | 1 red: readout lacks `F_el em bloco: 2.50 N` |
| 15 | `en.ts`: `spring.mass` removed | 2 red (`missing in EN: spring.mass`, key count) |

Mutations 11–14 are the DOM-seam record AGENTS.md asks for: each new `App.test.ts` test goes red under at least one of them, with the output above.

**Gate** on `41ec7b8`: `npm test` 30 files, 680 passed; lint clean; typecheck clean; build ✓ (the >500 kB warning names only the late `sim` chunk, as PHY-32 documents).

#### Resolution (2026-09-24)

Verdict: Needs your call: every criterion is met, but a spring with mass kicks the block and rings for eight steps when the user drags an end mid-play (carry without that body); fix deferred to CLEAN-09, decide whether v4 ships with that edge.

Stage 3 (claude-fable-5-1), branch `phy/PHY-30-mola-com-massa` (`664e362`, `41ec7b8`, `2f9a7f0`) merged `--no-ff` into `sweatshop/2026-09-24-1853` as `f8adf02`. Already on top of the session; no rebase needed.

- Test-first: `664e362` touches only the four test files and the ticket; `41ec7b8` touches no test file; `2f9a7f0` only the ticket. Every touched source file is in Primary files (`types.ts` and `doc.ts` by the proxy decision below).
- Criterion 1: `parseSpring` loops `c` and `mass` through one non-negative-finite check; absent stays absent (`serialize` round-trips without the key). Codec tests cover 0, 0.1, 2.5, absent, negative, string, Infinity.
- Criterion 2: two horizontal cases at 3% of `2π√((m + mₛ/3)/k)` and nearer it than the massless period; stage 2 measured 0.12%.
- Criterion 3: `F_b − F_a` against `mₛ·a/2`, least-squares slope within 10%; `mₛ = 0` reads `a === b` every step because `newChain(0)` is null and the PHY-26 path runs untouched.
- Criterion 4: the nodes are plain numbers in `Chain`, never Rapier bodies, so `readStates` and collisions cannot see them (test with a fixed bar across the spring's line); carry resumes the chain by spring id, forces equal to 9 decimals across the rebuild and the block within 3% of A of an uninterrupted run.
- Criterion 5: `elasticArrows` sizes each end by its own reading (mutation 10) and keys the label per end only when `mass > 0` (mutation 9): `F_el,1`/`F_el,2`, massless still `F_el`.
- Criterion 6: `SpringPanel` gains `mₛ (kg)`, `commitSpringEdit` refuses `mass < 0` with the shared warning; the readout shows `F_el em <body>` per end when `mass > 0`, the single `F_el` otherwise.
- Criterion 7: `spring.mass`, `readout.springForceAt` and the reworded `spring.invalid` in both catalogs; the parity test guards them (mutation 15).
- Criterion 8: all 15 recorded mutations rerun by this review, each alone with its suite and reverted. Every one goes red as recorded; mutation 5 trips 3 tests (the carry test too), one more than recorded. Mutations 11–14 are the DOM-seam record.
- Criterion 9: gate rerun on `2f9a7f0`: `npm test` 30 files / 680 tests, lint, typecheck, build green.
- Reviewer probes (scratch test, deleted, not committed): damped chain `c = 0.5` and `c = 2` with `mₛ = 0.1` follows the ideal spring's peak envelope within 1% over 10 peaks; two dynamic blocks with `mₛ = 0.15`, `c = 0` and `c = 1`, keep |p| ≤ 0.02 kg·m/s and the gap amplitude to 0.1%/period. The `c` terms and the symmetric end handling are right, but no committed test pins them.
- Finding, deferred to CLEAN-09: a carried rebuild whose carry lacks an end's body (the user dragged it mid-play, `carryOver` drops it) resumes the chain at the old node positions on the new axis. Measured with the block moved 0.5 m: first-step Δv −1.85 m/s against −0.40 for the ideal spring, then the block's F_el reads 110.7, −38.7, −9.1, 10.7 … N on a 24 N answer, the wall end −39.5 to 68.6 N. Not a criterion as written (criterion 4 compares against an uninterrupted run), not a regression (massless springs unchanged), and the fix needs a new test, so no small fix here.
- Also noted, no criterion: the readout labels ends by body name while the arrows say `F_el,1`/`F_el,2` (rope readout mirrors its arrows); `readSpring` computes tensions it discards once `chain.force` is set; `pushChain` computes `before` twice. All in CLEAN-09's comments.
- Proxy decided (stage 2): `src/scene/types.ts` and `src/editor/doc.ts` added to Primary files for the type-only lines; no criterion changed.
