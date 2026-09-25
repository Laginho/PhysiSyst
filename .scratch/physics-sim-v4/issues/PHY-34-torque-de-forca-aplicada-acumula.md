# PHY-34: Torque de força aplicada acumula entre passos
Stage: implementing
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`step`, o reset por passo)
  - `src/sim/acceptance.test.ts`
  - `src/sim/simulator.test.ts` (as pré-condições do spinner em `particle mode (T7/M2)`)

#### What to build

`step()` zera as forças dos corpos tocados com `resetForces`, mas o Rapier guarda força e torque em separado: `resetForces` não zera o torque que `addForceAtPoint` acrescenta quando o ponto fica fora do centro de massa. O torque de cada passo soma ao dos anteriores, e o corpo gira cada vez mais rápido do que a física manda.

Medido na revisão do PHY-23 (2026-09-24), com o simulador de produção: bloco 1×1 m, 1 kg, g = 0, força de 1 N para cima aplicada em (0.5, 0). ω após 1 s = 40,4 rad/s; analítico τ/I·t = 0,5/(1/6)·1 = 3 rad/s (supõe braço fixo; a âncora gira com o corpo, ~81° em 1 s, e o valor certo é √(6·sin θ) ≈ 2,43 — ver critério 1). Sonda direta no Rapier 0.20: `userTorque()` depois de `resetForces` + `addForceAtPoint` lê 2, 4, 6 em três passos seguidos.

Afeta toda força aplicada fora do CM desde que as âncoras existem (o teste de âncora em `acceptance.test.ts` só checa `angvel > 0.05` em 30 passos, insensível à acumulação). Desde o PHY-23 afeta também pontas de corda fora do CM: as famílias do tracer têm braço zero e não veem o bug, e `freePointVelocity` lê `userTorque()`, herdando o lixo acumulado. A correção provável é uma linha, `resetTorques(true)` ao lado de `resetForces(true)`, mas é bug de física e leva teste de regressão.

#### Acceptance criteria

1. Bloco 1×1 m, 1 kg, g = 0, força de 1 N para cima em (0.5, 0), 60 passos: |ω − √(6·sin θ)| ≤ 2% de √(6·sin θ), com θ lido do simulador (braço 0.5·cos θ, τ = 0.5·cos θ N·m; energia: ½·I·ω² = 0.5·sin θ)
2. O teste de âncora existente (`force anchor semantics`) continua verde
3. Teste de regressão mutate-verified conforme o `AGENTS.md` (sem o reset do torque, vermelho)
4. Gate verde
5. Os testes de `particle mode (T7/M2)` continuam mostrando o corpo livre girando (|ω| > 0.1 após 60 passos) e o travado não

#### Verification

    npx vitest run src/sim/acceptance.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`: ω após 1 s de força fora do CM contra √(6·sin θ) (1). Vermelho porque o torque acumula (~40 rad/s em vez de ~2,4).

## Comments

Aberto pela etapa 3 do PHY-23 (2026-09-24). Achado fora dos critérios daquele ticket; não bloqueou o merge.

Proxy decided: critério 1 passa a comparar ω com √(6·sin θ) na mesma cena de 1 s e banda de 2% — o "3 rad/s" supunha braço fixo, mas a âncora gira com o corpo e a força fica no referencial do mundo; com o fix o simulador dá ω = 2,445 contra a integração de θ'' = 3·cos θ em 2,431, e nenhuma física correta atinge 3 (2026-09-25).

Proxy decided: `src/sim/simulator.test.ts` entra nos Primary files (critério 5) e as duas pré-condições do spinner passam a `Math.abs(angvel) > 0.1` — com o fix o círculo é um pêndulo físico em torno de θ = π/2 e em 60 passos está na volta (ω = −7,83); o sinal positivo só valia porque o torque acumulava (2026-09-25).
