# PHY-24: Corda geral — pêndulo, folga, várias polias, polia móvel
Stage: to-review
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
