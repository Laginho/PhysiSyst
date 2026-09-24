# PHY-24: Corda geral — pêndulo, folga, várias polias, polia móvel
Stage: to-implement
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
