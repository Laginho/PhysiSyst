# PHY-24: Corda geral — pêndulo, folga, várias polias, polia móvel
Stage: done
Status: ready-for-agent
Blocked by: PHY-23
Review: agent

- Primary files:
  - `src/scene/codec.ts`, `src/scene/codec.test.ts` (tira a restrição temporária do PHY-23)
  - `src/scene/ropePath.ts`, `src/scene/ropePath.test.ts`
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`
  - `src/render/draw.ts`

#### What to build

A corda passa a cobrir todo o escopo ideal: sem polia (pêndulo: uma ponta num Corpo fixo), com qualquer sequência de polias, e com polia montada em Corpo dinâmico (polia móvel, sem massa). A corda é unilateral: afrouxa quando as pontas se aproximam, com `T = 0`, e volta a esticar sem ganhar comprimento. Tudo pelo mesmo mecanismo do ADR-0004.

#### Acceptance criteria

1. O codec aceita `via` vazio (desde que as pontas estejam em corpos diferentes), qualquer número de polias e polia em Corpo dinâmico; rejeita a mesma polia duas vezes seguidas no `via`
2. Pêndulo simples, θ₀ = 10°: período `2π√(L/g)` dentro de 2%, medido em 3 oscilações
3. Volta completa: com `v_topo² < gL` a leitura dá `T = 0` perto do topo e a distância do corpo ao pivô fica menor que `L` (sai do círculo); com `v_topo² > gL` completa a volta com `T > 0` o tempo todo
4. Folga: dois corpos ligados, empurrados um contra o outro, não se repelem pela corda (`T = 0` e distância < `L`); ao se afastarem, a corda estica de novo no mesmo `L` (±1 mm)
5. Polia móvel sem massa: corpo pendurado no eixo e contrapeso na outra ponta; `a_corpo = a_contrapeso/2` e `T` analítica dentro de 2%
6. Atwood com duas polias fixas em sequência dá o mesmo `a` e `T` da Atwood de uma polia (2%)
7. `ropePath` contorna polias em série e polia móvel; o desenho acompanha a polia móvel em movimento
8. Testes de regressão mutate-verified
9. Gate verde

#### Verification

    npx vitest run src/scene src/sim
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: aceitações novas e a rejeição de polia repetida (1). Vermelho pela restrição temporária do PHY-23.
- `src/scene/ropePath.test.ts`: caminhos com várias polias e polia móvel (7).
- `src/sim/acceptance.test.ts`: pêndulo, volta completa, folga, polia móvel, polias em série (2–6). Vermelho porque o codec ainda rejeita essas cenas.

## Comments

Etapa 3 do PHY-23 (2026-09-24): PHY-34 registra que `resetForces` não zera o torque de `addForceAtPoint`, então uma ponta de corda fora do CM (pêndulo preso num canto) gira cada vez mais até o PHY-34 fechar. As famílias deste ticket com âncora no CM não veem o bug; se alguma âncora ficar fora do CM, fechar o PHY-34 antes.

Etapa 2 (2026-09-24), mutate-verify (critério 8). Red no commit de teste `deae6d5`: 13 falhas, todas nas travas temporárias do PHY-23 (`a rope must pass over exactly one pulley for now`, `pulley on dynamic body … is not supported yet`); os casos novos de `ropePath` já passavam (a geometria é geral desde o PHY-23) e ficam presos pelas mutações abaixo. Cada mutação aplicada ao código final e revertida; saída vermelha resumida:

| Teste | Mutação | Vermelho |
|---|---|---|
| codec `rejects: rope with no pulley and both ends on one body` | tira a checagem de mesmo corpo | `expected function to throw an error, but it didn't` |
| codec `rejects: the same pulley twice in a row` | tira a checagem de polia repetida | `expected function to throw an error, but it didn't` |
| codec `accepts: a movable pulley on a dynamic body` | volta a trava de polia em corpo dinâmico | `SceneParseError: dyn` |
| codec `accepts:` pêndulo, sem polia, série, polia revisitada | trava do PHY-23 (commit de teste) | `a rope must pass over exactly one pulley for now` |
| acceptance polia móvel (5) | polia não recebe puxão no eixo (`u = 0`) | `expected 8.4086 to be less than or equal to 0.0280` (dv da carga) |
| acceptance volta completa (3, `v_top² > gL`) | puxão ao longo das pernas do fim do passo, não do meio | `expected 0 to be greater than 0` (T some antes do topo) |
| acceptance volta incompleta (3, `v_top² < gL`) | puxão ao longo das pernas do início do passo | `expected false to be true` (nunca fica frouxa perto do topo) |
| acceptance pêndulo (2), folga (4), série (6) | corda 5% mais longa que o caminho do documento | `expected 0.0536 to be less than or equal to 0.0401` (período); `expected 0.1031 to be less than or equal to 0.001` (folga); `expected 0.4227 to be less than 0.001` (série) |
| acceptance pêndulo, volta, folga, polia móvel, série (2–6) | trava do PHY-23 (commit de teste) | `SceneParseError: … exactly one pulley for now` / `… dynamic body 'carga' …` |
| ropePath `two pulleys in series`, `crossed tangent`, `movable pulley`, scenePath `moves with it` | lado do enrolamento ignora a curva (`rho = −r`) | `expected [ -1, -1 ] to deeply equal [ -1, 1 ]` e mais 3 |
| scenePath `moves with it` | centro da polia ignora a pose do corpo | `expected +0 to be close to 4` |
| ropePath `no pulley`, série, cruzada, móvel | arco sem comprimento | `expected 18 to be close to 19.5708` e mais 8 |

Mecanismo (ADR-0004), o que mudou e por quê — medido com sondas descartáveis:
- O PHY-23 não fechava a volta vertical nem a folga. A predição por taxa não via a curvatura (pêndulo rápido ficava ~4 mm curto), e o impulso que estica uma corda frouxa virava warm start e puxava os corpos 2 cm para dentro de `L`.
- Agora a predição é por posição: aplica a tensão que leva o comprimento livre do fim do passo ao alvo, integrando como o Rapier integra (4 subpassos: um corpo anda φ = 5/8 de Δt²·a — medido). O puxão vai ao longo das pernas do meio do passo (ao longo das do fim, drenava ~2% de v² por passo; das do início, perdia a centrípeta). A leitura esperada é a forma em taxa do mesmo puxão, então o resíduo só carrega o que os contatos acrescentam (≈ 0 sem contatos, e o tranco da folga não entra mais).
- A correção usa a mesma folga permitida que a predição (`ropeAllowance`); visando taxa zero com a corda esticada, ela desfazia o recuo de 20% e o warm start cancelava o próximo.
- Volta de 1 m, `v₀² = 6gL`: |dist − L| ≤ 0,05 mm (era 119 mm com a primeira tentativa e ~4 mm no mecanismo do PHY-23). Sobra ~4% de perda de energia por volta na projeção de velocidade (`ponytail:` no código).

Para a etapa 3:
- φ não está preso por teste: com `φ = 1` a volta estica ~12 mm e os 20 testes continuam verdes, porque nenhum critério pede comprimento na volta. Código de teste não entra em commit de código; fica para um `CLEAN-*` ou um critério novo.
- `docs/adr/0004-rope-as-own-constraint-around-world-step.md` descreve a predição antiga (taxa, sem φ, sem pernas do meio) e `src/scene/index.ts` ainda cita as travas do PHY-24 no comentário; os dois estão fora dos Primary files.
- `src/render/draw.ts` não mudou: o desenho já sai do `scenePath` na pose da playback view, então segue a polia móvel (teste `scenePath follows a movable pulley`).
- Todas as âncoras dos testes estão no CM; PHY-34 continua aberto.

#### Resolution (2026-09-24)

Verdict: Approve

Merged into `sweatshop/2026-09-24-1853` with `--no-ff` (merge commit `6e19338`, branch `phy/PHY-24-corda-geral`, commits `deae6d5` → `72fa123` → `146faeb`). Reviewed with `code-review` (Standards + Spec) against this ticket and `spec.md`, fixed point `d7d52d8` (the session head; the branch sat on it, so no rebase was needed).

Criteria, each against its test:

| # | Verdict | Where |
|---|---|---|
| 1 | ✅ | `codec.test.ts`: rejects `via: []` with both ends on one body and `['p','p']`; accepts `[]` (pendulum, two dynamic bodies), `['p','q']`, `['p','q','p']` (non-consecutive revisit), a pulley on a dynamic body; every accepted document round-trips |
| 2 | ✅ | `acceptance.test.ts` pendulum: 4 interpolated crossings, period over 3 oscillations within 2% |
| 3 | ✅ | loop `v_top² > gL`: sweeps 2π with min `T > 0`; loop `v_top² < gL`: `slack && T = 0` above `0.5L`, then `dist < L − 1 cm` |
| 4 | ✅ | slack: `T = 0`, `slack`, `d < L`, launch velocity kept while closing; `|d − L| ≤ 1 mm` after reopening; never `> L + 1 mm` |
| 5 | ✅ | movable pulley: `a_M` within 2%, `dv_M + dv_m/2` within 2%, every `T` in the window within 2% of `3Mmg/(M+4m)`, path length within 1 mm |
| 6 | ✅ | series Atwood against the same closed forms the one-pulley test uses; `a`, `T` within 2%, length within 1 mm (nit: the `a` tolerance is written as `0.02·a`, right only because the window is exactly 1 s) |
| 7 | ✅ | `ropePath.test.ts`: series, crossed tangent, movable pulley; `scenePath follows a movable pulley`. `draw.ts` unchanged is right: `App.tsx` draws `applyStates(doc, states)` and `drawRopes` calls `scenePath` on that view, so a moving pulley is followed with no code change |
| 8 | ✅ | all eleven recorded mutations rerun on the merged code, each reverted after; every one reproduced the ticket's red (below) |
| 9 | ✅ | gate green on `146faeb`, run in the foreground: 29 files, 541/541 tests, lint, typecheck, build clean |

Test-first: `deae6d5` touches only the three test files and this ticket. Checked out its `src` over the final tree: `13 failed | 147 passed (160)`, 10 of them on `exactly one pulley for now` / `is not supported yet`, the reason the ticket names. `72fa123` touches only `codec.ts`; `146faeb` only `simulator.ts` and this ticket. No test file in a code commit. All `src` changes sit inside Primary files.

Mutations rerun (seam tests only, each reverted with `git checkout`):

| Mutation | Red |
|---|---|
| codec: drop same-body check | `1 failed`: `expected function to throw an error, but it didn't` |
| codec: drop repeated-pulley check | `1 failed`: same |
| codec: restore the dynamic-body lock | `1 failed`: `accepts: 'a movable pulley on a dynamic body'` — `dyn` |
| sim: pulley gets no pull (`u = 0`) | `1 failed`: movable pulley, `expected 8.4086 to be less than or equal to 0.0280` |
| sim: pull along end-of-step legs | `1 failed`: loop `v_top² > gL`, `expected 0 to be greater than 0` |
| sim: pull along start-of-step legs | `1 failed`: loop `v_top² < gL`, `expected false to be true` |
| sim: rope 5% longer than the document path | `11 failed`, PHY-23 and PHY-24 families, e.g. `expected 0.3977 to be less than 0.001` |
| sim: `φ = 1` | `20 passed` — as the ticket admits, unpinned; CLEAN-03 |
| ropePath: `rho = −r` | `4 failed`: `expected 0.923 to be close to -1` and 3 more |
| scenePath: center ignores the body pose | `2 failed`: `expected -0.75 to be close to 5.25` |
| ropePath: arc without length | `9 failed`: `expected 10 to be close to 13.1416` |

Findings (none a criterion, none a reopen):

- **ADR-0004 is stale.** Its Mechanism step 1 describes the PHY-23 rate prediction; `pullRope` now predicts by position with the substep factor `φ`, mid-step legs, an asymmetric `K` and a pull on the movable pulley's axle. Stage 2 surfaced the conflict here, per `docs/agents/domain.md`; the file is outside Primary files → **CLEAN-03**.
- **`src/scene/index.ts:16-19` comment** still lists the removed locks. Outside Primary files → **CLEAN-03**.
- **`φ` unpinned** (`φ = 1` stays green, ~12 mm stretch on the loop). No criterion asks for length on the loop; new criterion → **CLEAN-03**.
- Judgement calls left as they are: `[rope.a, ...rope.via, rope.b]` built in `ropeFrame` and `step()`; the lengthening dot product written twice (`pullRope`, `correctRope`); `{x, y, w, x2, y2, w2}` in `ropeInvMass` names the second Jacobian poorly; `k <= 0` in `pullRope` vs `k === 0` in `correctRope` (the asymmetric `K` can go negative and is silently read as "no rope"). Series Atwood's `a` tolerance omits `· window` (equal to 1 s). `docs` vocabulary: "axle" where CONTEXT.md says anchor.
- The `ponytail:` in `correctRope` (~4% energy per fast loop) is named with its ceiling and upgrade path; accepted.
- The stage-2 note "all anchors at the CM" is slightly off: the series Atwood pulls at `{0, 0.2}` on dynamic bodies. Harmless: the pull is vertical through the CM, so no torque and PHY-34 does not bite.
- No `Proxy decided` lines on this ticket.
