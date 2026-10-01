# PHY-49: O disco da polia com massa gira o quanto a previsão assume, e as tensões param de alternar
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-45
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`Grip`, `gripShares`, o `spin` em `pullPieces`, `correctPieces`, a criação dos grips em `buildWorld`)
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)` e o `atwoodScene` que ele já usa)

#### What to build

Uma Atwood sobre polia com massa lê T₁ e T₂ constantes e acelera certo enquanto o disco gira rápido. Hoje as duas tensões alternam a cada passo, a oscilação cresce com a velocidade do disco, e o movimento oscila junto.

Medido com probes descartáveis no motor público, sobre `ace3e09`, na Atwood 1/3 do repouso (`atwoodScene(1, 3, 2)`). A forma fechada dá a = 3,924 m/s², T₁ = 13,734 N e T₂ = 17,658 N:

| Passo | T₁ / T₂ (N) | Aceleração de `a` (m/s²) |
| --- | --- | --- |
| 50 | 14,028 / 17,885 | 4,218 |
| 73 | 12,767 / 16,947 | 2,957 |
| 74 | 14,727 / 18,418 | 4,917 |

**A causa.** O Rapier gira o disco menos do que ω·Δt. Em cada substep ele avança o ângulo por `atan(ω·h)`, e não por `ω·h`. Com ω = 16 rad/s faltam 0,0004 rad por passo; o ω ele integra certo. O `gripShares` mede as peças pelo ângulo do Rapier (`disk.rotation()`), mas a previsão de `pullPieces` assume que o disco gira `Δt·ω`. A cada passo, as duas peças ganham erros de posição de sinais opostos: uma fica do lado frouxo do `ropeAllowance` e a outra do lado esticado. Com inclinações diferentes nos dois lados e o `K` mal condicionado do disco, o laço do warm start (`residual`) passa a ter ganho de cerca de −1,05 por passo.

Para medir esse ganho, somei uma perturbação de 1 N ao residual de uma peça, com 2/2 e `M = 2`. Com o disco parado ela morre em 6 passos. Com ω = 16 ela alterna sem decair. Um disco mais leve (`M = 0,2`) amplifica o primeiro passo em 5,5 vezes. Sem o warm start das peças a alternância some, mas isso tiraria o warm start dos contatos e do atrito em toda cena com polia com massa.

**A decisão.** Cada grip integra o próprio giro do passo, `Δt·(ω₀ + φ·(ω₁ − ω₀))`, e para de ler `disk.rotation()`. `ω₀` é o ω do disco em `pullPieces`, antes do passo. `ω₁` é o ω depois do `world.step()`, antes da correção, quando `correctPieces` atualiza os shares. É a mesma conta que o `spin` da previsão já faz, então previsão e correção passam a ver o mesmo disco. O Rapier continua dono do ω do disco. O ângulo dele não é lido em mais nenhum lugar.

Um protótipo descartável de 7 linhas deu T₁ = 13,734 e T₂ = 17,658 em todo passo até o bloco chegar ao disco. Os 741 testes da suíte, o typecheck e o lint ficaram verdes, sem mudar tolerância.

**Fora do escopo:**
- O Rapier limita o ω de qualquer corpo a 15π ≈ 47,12 rad/s (Δt = 1/60, 4 substeps). Acima disso o disco para de responder ao torque, e a Atwood diverge. Fica para o PHY-50.
- O bloco que chega ao disco é o PHY-45.

#### Acceptance criteria

1. Atwood com `atwoodScene(1, 3, 2)` e o teto em `y = 40`, solta do repouso, ao longo de 160 passos (ω chega a 42 rad/s):
   - em todo passo, T₁ e T₂ (`segments`) ficam a menos de 1% de `m₁(g + a)` e `m₂(g − a)`, com `a = (m₂ − m₁)g/(m₁ + m₂ + M/2)`;
   - no passo 160, a velocidade de `a` fica a menos de 1% de `a·t`.
2. O mesmo para `atwoodScene(3, 2, 2)` com o teto em `y = 40`, ao longo de 300 passos (ω chega a 33 rad/s).
3. Os testes existentes de `acceptance.test.ts` e `simulator.test.ts` continuam verdes sem mudar tolerância, incluindo os da polia com massa (PHY-25), o PHY-43, a polia com massa no suporte em movimento (CLEAN-17) e a polia móvel com massa.
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`. A mutação é voltar a medir o giro do disco por `wrapAngle(disk.rotation() − rotation)`. Com ela, o critério 1 fica vermelho por volta do passo 41.
5. Gate verde.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-49
    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `pulley with mass (PHY-25)`, pelo motor público (`createSimulator(parse(scene))`, `step()`, `readStates()`, `readConstraints()`), sem mocks. O teto sobe mudando a `position.y` do corpo `teto` na cena, como o PHY-43 já muda o `vy` de `a`. Os dois cenários dos critérios 1 e 2 ficam vermelhos hoje porque as tensões alternam: o 1/3 sai de 1% no passo 41 e o 3/2 chega a 37% de erro.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-45, a partir de um achado lateral do diagnóstico descartável sobre `b29d75a`.
- 2026-10-01 Stage 1. Probes descartáveis sobre `ace3e09` acharam a causa (o Rapier gira o disco por `atan(ω·h)` a cada substep) e prototiparam a integração própria do giro. O Bruno aprovou método, critérios e o PHY-50 para o limite de ω. Os números da primeira versão deste ticket estavam errados: o par "T₁ / T₂" eram leituras de T₁ em passos seguidos. Nada do protótipo foi commitado.
- 2026-10-01 Bloqueado pelo PHY-45 no stage 1 de revisão dele: o sweatshop roda os dois em sequência, e o critério 3 daqui precisa manter verdes os 24 cenários novos do PHY-45. Medido com os protótipos empilhados sobre `9d81e26`: continuam verdes, e os 741 testes também.
