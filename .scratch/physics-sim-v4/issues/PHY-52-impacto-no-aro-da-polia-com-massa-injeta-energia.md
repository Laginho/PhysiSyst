# PHY-52: Um bloco que bate no aro da polia com massa ganha energia no impacto
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-45
Review: agent
Difficulty: normal

- Primary files:
  - src/sim/simulator.ts (`Piece`/`RopeBinding`: campo novo `target`; `pullPieces`; `correctPieces`; constante nova `ROPE_SLIP` ao lado de `ROPE_BETA`)
  - src/sim/acceptance.test.ts (`PHY45_GRID`/`PHY45_IDEAL_ONLY`; o bloco `acceptance: pulley with mass (PHY-25)`)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (passo 3 do Mechanism, sobre o residual; a seção do aro, PHY-45)

#### What to build

Um bloco que bate no aro de uma polia com massa (PHY-45) para ali sem que o sistema ganhe energia. Hoje o impacto dá um pico: a energia dos blocos sobe e depois cai, sem divergir.

Medido com probes descartáveis no motor público, sobre `9d81e26` com os protótipos do PHY-45 revisado (aro, guarda e direção guardada), `atwoodScene` com o teto em `y = 6`, 600 passos:

| Cenário, `M = 2` | `max ΔE` dos blocos | Passo |
| --- | --- | --- |
| 3/1 do repouso | +54 J | 89 |
| 1/2 do repouso | +3,1 J | 96 |

Com os protótipos do PHY-49 e do PHY-50 por cima, os números ficam os mesmos. Com polia ideal, os dois cenários não ganham energia.

O que se viu no 3/1:
- Antes do impacto, a energia total, contando o disco (cerca de 15 J), está conservada. No passo 89 os blocos estão +54 J acima de E₀, então o sistema ganhou pelo menos 40 J.
- `b` bate no aro a 5,5 m/s. A correção da corda não enxerga o contato: ela calcula um impulso que moveria `b`, o contato o cancela, e o warm start (`residual`) acumula tensão passo a passo. As peças ficam esticadas de 5 a 15 cm.
- A corda puxa `b` contra o aro sem atrito, e `b` escorrega por cima dele: sobe 0,6 m em 4 passos, até acima do centro da polia. Enquanto isso, `a` (3 kg) é parado e jogado para cima a 1,66 m/s.
- A peça entre o disco e `b` fica com poucos centímetros, e a perna gira rápido dentro do passo. A diagonal de `K` na previsão cai para 0,074, contra cerca de 2 antes do impacto, sem ficar negativa, e a tensão vai a 674 N.
- Uma guarda com limiar relativo (`ropeInvMass(pulls, along) ≤ f·ropeInvMass(pulls, pulls)`, com f = 0,25, 0,5 e 0,75) não ajudou: o 3/1 ficou em +27 J, e o 1/3 e o 1/4 passaram a falhar.

**Caminho.** `pullPieces` guarda em cada peça o `target` que mirou. Em `correctPieces`, se o passo deixou a peça mais de `ROPE_SLIP = 0,01 m` além desse alvo, um contato cancelou o puxão, e o warm start viraria tensão armazenada. Nesse caso o `residual` da peça vai a 0. A tensão e o impulso de correção do passo não mudam. A regra vale para qualquer contato que cancele o puxão, não só para o aro.

O caminho escalar (`pullRope`/`correctRope`) não muda: com a mesma regra lá, a 2/2 ideal com vy = 4 ganha +2,34 J.

`ROPE_SLIP` é absoluto, em metros, com um comentário `ponytail:` que nomeia o teto: cenas longe da escala do metro, ou impactos que nunca passam 1 cm do alvo. O próximo passo, se precisar, é um limiar relativo ao deslocamento previsto no passo.

Medido sobre `d0b8303`, com protótipos descartáveis:
- O atrito que segura uma carga fica até 0,68 mm além do alvo; os impactos ficam entre 42 e 94 mm. A regra funciona com limiar de 3 mm a 4 cm.
- Com 1 cm, 3/1, 1/2, 1/3 e 1/4 ficam ≤ 0 J, o resto da grade `M = 2` passa, as cenas de atrito não zeram o residual nenhuma vez, e a suíte inteira fica verde.
- Rejeitados: residual sempre 0 (o bloco da mesa segurado por atrito escorrega 14,6 e 35,5 mm, contra 0,27 e 0,49 mm na main); residual limitado a |predicted| (o estiramento da 3/2 com μ = 1 vai de 0,98 para 1,58 mm); `ROPE_SLIP = 0` (8,9 e 19,2 mm, e T oscila entre 4,94 e 14,84 N onde devia ser 9,81).

#### Acceptance criteria

1. Os cenários `1/2 from rest` e `3/1 from rest` entram no `PHY45_GRID`, e o `PHY45_IDEAL_ONLY` some. Com `M = 2`, ao longo de 600 passos, a energia dos blocos nunca passa de `E₀ + 0,5 J`, e nenhuma âncora cruza `x = 0` acima do eixo. Hoje: +54,52 J no 3/1 e +3,03 J no 1/2.
2. Cena da mesa do PHY-23, com `mass: 2` na polia, do repouso, 300 passos: 2/1 com μs = μk = 0,8 e 3/2 com μs = μk = 1. No passo 300 o bloco da mesa está a menos de 1 mm de x = −2, e cada segmento tem `T` a 1% de m₂·g do passo 30 em diante. A física confere: o atrito segura (μ·m₁·g > m₂·g) e o bloco não tomba (T < m₁·g). Hoje passa (0,27 e 0,49 mm) e fica como guarda.
3. `correctRope` não muda. Os testes existentes ficam verdes sem mudar tolerância, incluindo os 13 cenários ideais do PHY-45, o PHY-41 e o PHY-25.
4. O ADR-0004 diz que `correctPieces` zera o residual da peça que termina o passo mais de `ROPE_SLIP` além do alvo guardado por `pullPieces`, que a tensão e o impulso de correção não mudam, e que `correctRope` fica de fora de propósito, pelo +2,34 J da 2/2 ideal com vy = 4. Conferido por grep na Verification.
5. Mutate-verify conforme o `AGENTS.md`, com o registro no ticket:
   - tirar a regra: o critério 1 fica vermelho com `M = 2`;
   - `residual = 0` sempre em `correctPieces`: o critério 2 fica vermelho;
   - `ROPE_SLIP = 0`: o critério 2 fica vermelho;
   - a regra também em `correctRope`: a 2/2 ideal com vy = 4 fica vermelha.

#### Verification

    grep -n "ROPE_SLIP" docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, pelo motor público, sem mocks:
  - o critério 1, movendo os dois cenários para o `PHY45_GRID`, vermelho hoje no 3/1 e no 1/2 com `M = 2`;
  - o critério 2, num `it.each` no bloco do PHY-25, verde hoje como guarda e registrado como tal.

## Comments

- 2026-10-02 Stage 2: `pullPieces` e `correctPieces` são chamados por `step()` para polias com massa e grupos de cordas que compartilham corpos dinâmicos; nestes grupos uma corda ideal usa `RopeBinding` como peça. O alvo precisa existir nos dois tipos. Peças frouxas, tensões zero, sistemas redundantes/singulares e o limite do alvo continuam cobertos pela grade PHY-45 e pelos testes existentes do PHY-41/PHY-25; o caminho escalar fica intacto.
- 2026-10-02 Red antes da implementação: `npm test -- src/sim/acceptance.test.ts -t 'PHY-45|PHY-52'`: 2 failed, 26 passed, 99 skipped (127). Os novos casos com M = 2 falham por energia: 1/2 `expected 3.0258298162083648 to be less than or equal to 0.5`; 3/1 `expected 54.51779497203695 to be less than or equal to 0.5`. As duas guardas novas da mesa já passam, assim como os 13 cenários ideais, sem alteração de tolerância.

- 2026-10-01 Aberto no stage 1 de revisão do PHY-45, a partir de probes descartáveis sobre `9d81e26`. Nada foi commitado.
- 2026-10-01 Triagem (stage 1). Investigação com protótipos descartáveis sobre `d0b8303`; nada commitado. Caminho e critérios acima.
- 2026-10-01 Proxy decided: `ROPE_SLIP` absoluto de 1 cm — o que se compara é um comprimento, e os dois grupos medidos estão separados por uma folga absoluta (≤ 0,68 mm contra ≥ 42 mm).
- 2026-10-01 Proxy decided: o texto do ADR-0004 entra neste ticket, não num CLEAN à parte — a regra dos Primary files põe o ADR do mecanismo em jogo, e os CLEAN-20 a 22 só existiram porque o ADR tinha ficado de fora.
- 2026-10-01 Achado lateral: a cena da mesa 1/2 com μ = 3 diverge também com polia ideal. Proxy decided: abrir à parte, virou o PHY-54.
