# PHY-34: Torque de força aplicada acumula entre passos
Stage: implementing
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`step`, o reset por passo)
  - `src/sim/acceptance.test.ts`

#### What to build

`step()` zera as forças dos corpos tocados com `resetForces`, mas o Rapier guarda força e torque em separado: `resetForces` não zera o torque que `addForceAtPoint` acrescenta quando o ponto fica fora do centro de massa. O torque de cada passo soma ao dos anteriores, e o corpo gira cada vez mais rápido do que a física manda.

Medido na revisão do PHY-23 (2026-09-24), com o simulador de produção: bloco 1×1 m, 1 kg, g = 0, força de 1 N para cima aplicada em (0.5, 0). ω após 1 s = 40,4 rad/s; analítico τ/I·t = 0,5/(1/6)·1 = 3 rad/s. Sonda direta no Rapier 0.20: `userTorque()` depois de `resetForces` + `addForceAtPoint` lê 2, 4, 6 em três passos seguidos.

Afeta toda força aplicada fora do CM desde que as âncoras existem (o teste de âncora em `acceptance.test.ts` só checa `angvel > 0.05` em 30 passos, insensível à acumulação). Desde o PHY-23 afeta também pontas de corda fora do CM: as famílias do tracer têm braço zero e não veem o bug, e `freePointVelocity` lê `userTorque()`, herdando o lixo acumulado. A correção provável é uma linha, `resetTorques(true)` ao lado de `resetForces(true)`, mas é bug de física e leva teste de regressão.

#### Acceptance criteria

1. Bloco 1×1 m, 1 kg, g = 0, força de 1 N para cima em (0.5, 0): |ω(1 s) − 3 rad/s| ≤ 2% de 3 rad/s
2. O teste de âncora existente (`force anchor semantics`) continua verde
3. Teste de regressão mutate-verified conforme o `AGENTS.md` (sem o reset do torque, vermelho)
4. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`: ω após 1 s de força fora do CM contra τ/I·t (1). Vermelho porque o torque acumula (~40 rad/s em vez de 3).

## Comments

Aberto pela etapa 3 do PHY-23 (2026-09-24). Achado fora dos critérios daquele ticket; não bloqueou o merge.
