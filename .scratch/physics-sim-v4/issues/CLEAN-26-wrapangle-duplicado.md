# CLEAN-26: `wrapAngle` duplicado em `ropePath.ts` e `simulator.ts`
Stage: blocked
Status: needs-triage
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

(A definir pelo stage 1. Este arquivo ainda não autoriza implementação.)

#### Acceptance criteria

(A definir pelo stage 1.)

#### Verification

(A definir pelo stage 1.)

## Tests stage 2 writes (own commit, red)

(A definir pelo stage 1.)

## Comments

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir do PHY-54. O PHY-54 (`0ab658e`) criou `wrapAngle` em `src/scene/ropePath.ts:78` com a mesma fórmula que já existia em `src/sim/simulator.ts:442`: `angle - 2π·round(angle / 2π)`. O stage 2 do PHY-54 sinalizou a duplicação como candidata a CLEAN, e o stage 3 a anotou como Duplicated Code sem bloquear. Nada foi commitado além deste ticket. Cabe ao stage 1 escolher onde a função mora (o módulo de geometria pura `ropePath` já é importado pelo simulador) e se a mudança precisa de teste próprio ou é coberta pelos testes de PHY-45/PHY-54.
