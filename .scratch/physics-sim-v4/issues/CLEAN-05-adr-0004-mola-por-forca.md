# CLEAN-05: ADR-0004 e spec dizem que a mola usa a junta do Rapier; resíduos do PHY-26 fora dos Primary files
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md`
  - `.scratch/physics-sim-v4/spec.md` (só a linha 125, a nota sobre a junta de mola)
  - `src/scene/index.ts`, `src/sim/index.ts` (exports)
  - `src/sim/simulator.ts` (só `freePoint` e a linha de velocidade em `pullPieces`; nenhuma mudança de comportamento)
  - `src/render/draw.ts` (só o nome da variável `lead` em `drawSpring`)

#### What to build

O PHY-26 implementou a mola pelo gancho de forças (`pushSpring`, com a força tomada `(1 − φ)Δt` à frente) depois de a junta de mola do Rapier perder ~30% da amplitude em 5 períodos. O ticket registrou a escolha em `## Comments`, mas dois documentos ainda afirmam o contrário, e o review do PHY-26 (2026-09-24) achou três resíduos fora dos Primary files daquele ticket:

1. `docs/adr/0004-*.md`, Consequences: "The spring does **not** use this mechanism. It uses Rapier's spring joint". Falso desde `a5547d0`. O ADR precisa descrever o mecanismo real: força própria em ambas as pontas, aplicada antes das cordas para a predição delas enxergá-la, com o mesmo fator de substep φ da corda, e por quê (os números do `## Comments` do PHY-26: amplitude, equilíbrio, picos perdidos).
2. `spec.md` linha 125: "A mola usa a junta de mola do Rapier". Nota de que a implementação é a força própria, apontando para o ADR.
3. `Spring` (`src/scene/index.ts`) e `SpringState` (`src/sim/index.ts`) não são exportados; `Rope`/`RopeState` são. Os testes chegam neles por `Extract<…>`. PHY-27 (painel de leitura) e PHY-30 vão precisar.
4. `pointVelocity` foi adicionado em `simulator.ts`, mas o mesmo ternário `rigid.isDynamic() ? rigid.velocityAtPoint(p) : { x: 0, y: 0 }` continua inline em `freePoint` e em `pullPieces`. Usar o helper nos dois.
5. `lead` significa "segundos à frente" em `springAt` e "trecho reto da ponta" em `drawSpring`. Renomear o de `drawSpring`.

#### Acceptance criteria

1. O ADR-0004 descreve a mola como força própria no gancho, com o fator φ e os números que descartaram a junta do Rapier; a frase sobre a junta some
2. `spec.md` linha 125 diz que a mola é força própria e aponta para o ADR
3. `Spring` e `SpringState` exportados; `src/sim/acceptance.test.ts` e `src/playback/routing.test.ts` podem trocar o `Extract<…>` pelo tipo (opcional)
4. `freePoint` e `pullPieces` usam `pointVelocity`; `npx vitest run src/sim` verde sem mudar nenhum número
5. `drawSpring` não usa o nome `lead`
6. Gate verde

#### Verification

    npx vitest run src/sim src/scene
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: docs, exports e uma extração sem efeito observável. O critério 4 se prova pela suíte existente verde.

## Comments

- 2026-09-24 Aberto pelo review do PHY-26 (stage 3). Nenhum item é critério daquele ticket, então o PHY-26 fechou como está.
