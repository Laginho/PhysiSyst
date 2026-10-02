# CLEAN-26: `wrapAngle` duplicado em `ropePath.ts` e `simulator.ts`
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/scene/ropePath.ts (`wrapAngle`: passa a ser exportada)
  - src/scene/index.ts (a linha que reexporta de `./ropePath`)
  - src/sim/simulator.ts (a cópia local de `wrapAngle` e o import de `../scene`)
  - src/scene/ropePath.test.ts (um bloco novo `wrapAngle (CLEAN-26)`)

#### What to build

Uma só `wrapAngle`, no módulo de geometria pura `ropePath`, que o simulador já importa. O simulador apaga a sua cópia e usa a exportada. A fórmula não muda (`angle − 2π·round(angle / 2π)`), então nenhum comportamento muda: é só a remoção da duplicação que o PHY-54 criou.

#### Acceptance criteria

1. `wrapAngle` é exportada de `src/scene/ropePath.ts` e reexportada por `src/scene/index.ts`.
2. `wrapAngle(x)` devolve o ângulo equivalente a `x` módulo 2π com valor absoluto ≤ π: `0 → 0`, `2π → 0`, `3π/2 → −π/2`, `−3π/2 → π/2`, `π/2 + 4π → π/2`.
3. `src/sim/simulator.ts` não define mais nenhuma função `wrapAngle`; o seu único uso (`gripShares`) chama a importada de `../scene`.
4. Nenhum teste existente muda e todos seguem verdes (os blocos PHY-25, PHY-45 e PHY-54 cobrem os dois chamadores).

#### Verification

    npx vitest run src/scene/ropePath.test.ts
    git grep -n "function wrapAngle" -- src
    npm test && npm run lint && npm run typecheck && npm run build

O `git grep` lista exatamente uma linha, em `src/scene/ropePath.ts`.

## Tests stage 2 writes (own commit, red)

- `src/scene/ropePath.test.ts`, bloco novo `wrapAngle (CLEAN-26)`: importa `wrapAngle` de `./ropePath` e confere os cinco valores do critério 2 com tolerância 1e-12. Vermelho antes da mudança porque `ropePath.ts` não exporta `wrapAngle` (a importação é `undefined` e a chamada lança). Os critérios 3 e 4 não ganham teste próprio: o critério 3 é o `git grep` da Verification e o 4 é a suíte existente.

## Comments

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir do PHY-54. O PHY-54 (`0ab658e`) criou `wrapAngle` em `src/scene/ropePath.ts:78` com a mesma fórmula que já existia em `src/sim/simulator.ts:442`: `angle - 2π·round(angle / 2π)`. O stage 2 do PHY-54 sinalizou a duplicação como candidata a CLEAN, e o stage 3 a anotou como Duplicated Code sem bloquear. Nada foi commitado além deste ticket. Cabe ao stage 1 escolher onde a função mora (o módulo de geometria pura `ropePath` já é importado pelo simulador) e se a mudança precisa de teste próprio ou é coberta pelos testes de PHY-45/PHY-54.
- 2026-10-02 Stage 1: a função mora em `ropePath.ts`, que já é a dependência do simulador (o contrário, `scene` importando de `sim`, inverteria a direção dos módulos). As duas cópias são idênticas, então a troca não muda número nenhum; o teste próprio só fixa a exportação e o intervalo, e os testes de PHY-25/45/54 cobrem os chamadores.
