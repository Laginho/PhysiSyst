# PHY-55: A corda se solta da polia com massa quando o bloco passa por ela, sem ganho de energia
Stage: done
Status: ready-for-agent
Blocked by: CLEAN-25, CLEAN-26, PHY-56
Review: agent
Difficulty: hard

- Primary files:
  - src/sim/simulator.ts (`Grip`: o comentário da interface e o campo novo `loose`; os comentários de `RopeBinding.sweeps` e `Piece.length`; `ropeFrame`: histórico para toda corda; `pieceBounds`, `gripShares`, `pieceLengths`, `piecePulls`: só os grips presos; `segmentTensions`, que chama `pieceBounds`: a peça juntada dá a mesma `T` a todas as pernas dela; `pullPieces`: a soltura, na leitura das poses reais e na previsão do fim do passo; `correctPieces`: giro e parte só dos grips presos; a montagem dos grips em `buildWorld`)
  - src/sim/acceptance.test.ts (bloco `rope over a fixed pulley (PHY-23)`, ao lado dos testes do PHY-54 e do CLEAN-25)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (seção `Pulleys with mass (PHY-25)`, item `Grips and pieces`; seção `The rim and the kept wrap direction (PHY-45)`, item `The unwound sweep (PHY-54)`)

#### What to build

O mesmo que o PHY-54, para a polia com massa (PHY-25): quando o bloco passa por cima do disco e segue além dele, a corda sai do disco e fica reta, sem ganho de energia. Vale também para a corda mista (polia com massa e polias ideais no mesmo caminho). Hoje uma corda com grip não recebe histórico de varredura em nenhuma polia. A varredura cruza a costura 0/2π e o comprimento salta perto de 2πR, como no PHY-54 antes da correção.

Medido no `Simulator` público sobre `7590eec`, cena da mesa do PHY-23/PHY-54 com `mass: 2` na polia, 1/2 com μ = 3, 600 passos:
- no passo 152, a varredura no disco é 0,41 rad e a energia dos blocos está em −72,9 J;
- no passo 154, a energia está em +935,8 J (`T` = 795 N);
- no passo 155, a varredura vai de 0,00 para 6,08 rad, `T` = 2627 N e a energia chega a +964,2 J;
- `T` chega a 4797 N no passo 172.

Na grade do PHY-54 com `M = 2`, os ganhos vão de +231 J a +40,8 kJ (critério 1).

**Caminho.**

- **Histórico em toda corda.** `ropeFrame` passa `rope.sweeps` a `ropePath` também quando a corda tem grip. Assim toda polia do caminho, ideal ou com massa, tem a varredura desenrolada do PHY-54. Uma polia ideal solta dentro de uma peça já soma 0 em `pieceLengths` (o `Math.max(0, …)` do PHY-54).
- **O grip solto.** Um grip fica solto quando a varredura dele é negativa:
  - na leitura das poses reais, **ou**
  - na previsão do fim do passo em `pullPieces`.

  Ao se soltar, as duas peças em volta dele viram uma só, de comprimento igual à soma das duas. Tensão, residual, `predicted` e `target` da peça nova começam em 0. Daí em diante `pieceBounds`, `gripShares`, `pieceLengths` e `piecePulls` só contam os grips presos. O grip solto fica dentro da peça como uma polia ideal solta (a junção do CLEAN-25) e não puxa o disco. O disco segue girando com o ω que tinha. Só um grip preso guarda e atualiza a parte (`share`/`start`). A soma das peças continua sendo `L`. `segmentTensions` já lê os limites de `pieceBounds`, então as pernas da peça juntada leem todas a `T` dela.
- **A previsão só solta.** As poses previstas continuam sem atualizar `keep` nem `sweeps`. A única coisa que elas mudam é a soltura, num sentido só: a previsão nunca prende um grip.
- **Por que a previsão.** Soltar só na leitura das poses reais não basta. No passo em que a corda sai, a previsão do fim do passo ainda calcula as duas peças, mas sobre um caminho em que a polia já é a junção no meio da perna reta, e a parte de cada peça salta. No protótipo isso dá +12,5 kJ no 1/2 com μ = 3 e de +587 J a +45,9 kJ na grade.
- **Sem reengate aqui.** Um grip solto fica solto pela vida do mundo. O reengate é o PHY-57. Até lá, uma corda que volta a passar pelo disco desliza sobre ele como numa polia ideal, sem ganho de energia (critério 3).

Rejeitado: só passar o histórico ao grip, com a regra do PHY-54 (varredura negativa = perna reta), sem juntar as peças. É o que o ticket media antes: +285 kJ. Hoje, com a regra do CLEAN-25, dá de +42,4 kJ a +213,7 kJ na grade do critério 1. A parte (`share`) é a contabilidade da marca e continua valendo fora do arco. Mas sem arco não há disco segurando a corda, e as duas peças de comprimento fixo viram um vínculo que não existe.

Protótipo descartável: uma cópia de `simulator.ts` com cerca de 40 linhas a mais, sobre uma cópia de `ropePath.ts` com a regra do CLEAN-25 (as junções das polias soltas de uma perna em `t = k/(n + 1)`, na ordem de `via`). Os 39 cenários dos critérios 1 a 3 ficam em ≤ +0,08 J. Os 305 testes de `src/sim`, `src/playback` e `src/presets` ficam verdes.

**Fora do escopo:**
- O reengate da corda no disco (PHY-57).
- O desenho: o PHY-56 já desenha o `RopeState.path`. A corda com grip passa a ser desenhada solta sem mudança lá.

#### Acceptance criteria

1. **Grade da mesa.** Cena da mesa do PHY-54 (`tableScene` do bloco do PHY-23) com `mass: 2` na polia `p`, 600 passos, nos 11 cenários do critério 2 do PHY-54 (m₁/m₂, μs = μk = μ, `vx` inicial de `a`):
   - 1/2, 1/3, 1/4, 2/3 e 1/1,5 com μ = 3;
   - 1/2 com μ = 1 e com μ = 0,5;
   - 2/1 com μ = 0,2, com e sem `vx = 6`;
   - 1/2 com μ = 3 e `vx = 4`;
   - 1/1 com μ = 0,1 e `vx = 8`.

   A energia é a do PHY-54: só os blocos, `Σ (½m·v² + ½I·ω² + m·g·y)`, com `I = m·(w² + h²)/12`. O disco fica de fora porque parte do repouso: se os blocos passam de `E₀`, o sistema ganhou energia. Em cada cenário, essa energia nunca passa de `E₀ + 0,5 J`.

   Hoje, na ordem: +964,2 J; +4219,3 J; +6436,7 J; +2898,7 J; +9580,9 J; +1798,6 J; +2846,8 J; +2080,5 J; +40 833,7 J; +23 632,6 J; +231,5 J. Protótipo: ≤ 0,0 J em todos.
2. **Corda mista.** A cena é `twoPulleyTableScene(m1, m2, mu, vx?)` do CLEAN-25:
   - os corpos de `tableScene`;
   - uma segunda polia `q` (r = 0,2) na `mesa`, na âncora (4,6; −0,1), isto é, em (4,6; −0,6) no mundo;
   - `b` em (4,8; −1,8);
   - `via: ['p', 'q']`;
   - as duas polias ideais.

   Duas cordas: **A**, com `mass: 2` em `q`; **B**, com `mass: 2` em `p`. Rodam os cenários do critério 1, com os mesmos 600 passos e a mesma energia, exceto o 1/1 com μ = 0,1 e `vx = 8` na corda A: ele já passa hoje (−0,14 J) e nenhuma mutação o deixa vermelho. São 21 cenários. Nenhum passa de `E₀ + 0,5 J`.

   Hoje: A de +589,6 J a +204,7 kJ; B de +724,5 J a +16,96 kJ. Protótipo, com a regra do CLEAN-25: ≤ 0,0 J nos 21.

   Com a regra de hoje (junção na projeção limitada a [¼, ¾], na ordem de `via`), 7 falham:
   - A 1/3 com μ = 3: +113,7 J;
   - A 2/3 com μ = 3: +60,0 J;
   - B 1/2 com μ = 1: +188,4 J;
   - B 1/2 com μ = 0,5: +215,0 J;
   - B 2/1 com μ = 0,2 e `vx = 6`: +202,0 J;
   - B 1/2 com μ = 3 e `vx = 4`: +12,7 J;
   - B 1/1 com μ = 0,1 e `vx = 8`: +66,2 J.

   É por isso que este ticket espera o CLEAN-25.
3. **A corda volta a passar pelo disco.** A cena do critério 1, com `mass: 2` na polia e `b` lançado de lado (`vx` inicial de `b`), 600 passos, em 7 cenários (m₁/m₂, μ, `vx` de `b`):
   - 5/0,5 com μ = 0 e `vx = 7`;
   - 5/0,5 com μ = 0 e `vx = 9`;
   - 3/1 com μ = 0 e `vx = 8`;
   - 2/1 com μ = 0,2 e `vx = 8`;
   - 5/1 com μ = 3 e `vx = 8`;
   - 5/1 com μ = 3 e `vx = 10`;
   - 50/1 com μ = 3 e `vx = 9`.

   `b` sobe pelo lado de fora, a corda sai do disco e depois volta a encostar nele. A energia dos blocos nunca passa de `E₀ + 0,5 J`.

   Hoje: +893,7 J; +5406,9 J; +3557,4 J; +1906,1 J; +3342,2 J; +2946,0 J; +4409,1 J. Protótipo: de −0,09 J a +0,08 J.
4. **A leitura da corda solta.** Vale em cada passo de cada cenário dos critérios 1 a 3 em que o `RopeState.path` (PHY-56) dá varredura negativa ao arco do grip (`arcs[0]` em `p`, `arcs[1]` em `q`):
   - `readConstraints()` dá à corda `via.length + 1` segmentos;
   - todos os segmentos são iguais à `tension` da corda.

   Cada cenário tem pelo menos um desses passos. Hoje nenhum tem, porque a corda com grip não tem histórico e a varredura nunca é negativa. Protótipo: 17 160 passos, nenhum fora.
5. **Os testes existentes ficam verdes sem mudar tolerância.** Isso inclui:
   - a grade do PHY-45 com `M = 2` (com os dois cenários do PHY-52);
   - as guardas da mesa do PHY-52;
   - os testes do PHY-25, do PHY-41, do PHY-54, do CLEAN-25 e do PHY-56.

   Uma corda cujo grip nunca se solta segue a mesma física de hoje: a varredura de um grip preso não é negativa, então o histórico só muda o caminho quando a corda já teria saltado. A soma do comprimento passa pelo `release` e pode diferir no último bit. Nenhum teste de corda com grip compara bit a bit: o do PHY-25 compara `mass: 0` com `mass` ausente, sem grip.
6. **O ADR-0004 e os comentários.**

   No item `Grips and pieces`, o ADR-0004 diz:
   - o comprimento de cada peça é fixo enquanto os grips das pontas dela seguram;
   - um grip de varredura negativa, na leitura das poses reais ou na previsão do fim do passo, se solta;
   - as duas peças dele viram uma, de comprimento igual à soma;
   - o grip solto não puxa o disco e fica na peça como polia ideal;
   - o disco solto segue girando com o ω que tinha;
   - só um grip preso guarda e atualiza a parte;
   - a soma das peças é sempre `L`;
   - a frase exata `A loose grip stays loose for the world's life: re-engagement is PHY-57.`

   No item `The unwound sweep (PHY-54)`, o ADR diz que toda corda guarda o histórico, inclusive a que tem polia com massa. Diz também que as poses previstas nunca atualizam `keep` nem `sweeps`, e que a única coisa que escrevem é a soltura, num sentido só. Sai a frase que manda a corda com grip para o PHY-55.

   No código:
   - o comentário da interface `Grip` deixa de dizer "splits the rope into two pieces, each of fixed length" e diz que isso vale enquanto o grip segura;
   - o comentário do campo novo `Grip.loose` e o de `Piece.length` contêm `stays loose for the world's life`;
   - o comentário de `RopeBinding.sweeps` deixa de dizer "Unused with grips";
   - o comentário de `Piece.length` deixa de dizer "Fixed for the world's life".

   Conferido por `git grep` na Verification.
7. **Mutate-verify** conforme o `AGENTS.md`, com o registro no ticket. Cada mutação roda contra os testes dos critérios 1 a 4:
   1. Soltar só na leitura das poses reais, sem a previsão do fim do passo.
      - Critério 1: vermelho em 10 dos 11 (de +587 J a +45,9 kJ).
      - Critério 2: vermelho em 10 dos 10 da corda A (de +4,4 kJ a +46,0 kJ).
      - Critério 3: vermelho em 7 dos 7 (de +205,7 J a +3683,6 J).
      - Ficam verdes: no 1, o 1/1 com `vx = 8`; no 2, os 11 da corda B.
   2. O histórico sem juntar as peças (o grip solto segue cortando a corda em duas).
      - Critério 1: vermelho em 10 dos 11 (de +42,4 kJ a +213,7 kJ).
      - Critério 2: vermelho em 10 dos 10 da A e em 9 dos 11 da B.
      - Critério 3: vermelho em 7 dos 7.
      - Ficam verdes: no 1, o 1/1 com `vx = 8`; na B, o 2/1 com `vx = 6` e o 1/1 com `vx = 8`.
   3. O histórico só nas polias com massa (as ideais de uma corda com grip sem histórico, como hoje).
      - Critério 2: vermelho nas duas cordas (10 dos 10 da A, de +410,8 J a +5287,3 J; 11 dos 11 da B, de +162,2 J a +3135,0 J).
      - Ficam verdes os critérios 1 e 3, que não têm polia ideal.
   4. `segmentTensions` com os limites de todos os grips, presos ou soltos.
      - Critério 4: vermelho em todos os 17 160 passos, porque sai um segmento só onde deviam sair dois.

   O 1/1 com `vx = 8` do critério 1 só fica vermelho sem histórico nenhum (hoje: +231,5 J), e esse é o vermelho do commit de testes.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-55
    git grep -n -e "stays loose for the world's life" -e "PHY-57" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md src/sim/simulator.ts
    git grep -n -e "Unused with grips" -e "Fixed for the world's life" -e "two pieces, each of fixed length" -- src/sim/simulator.ts
    npm test && npm run lint && npm run typecheck && npm run build

O primeiro `git grep` acha a frase do ADR e os comentários de `Grip.loose` e `Piece.length`. O segundo não acha nada.

#### Resolution (2026-10-02)

Verdict: Approve

- Criterion 1 ✅ `it.each` of the 11 PHY-54 table scenarios, `mass: 2` on `p`, 600 steps, `maxEnergyGain` ≤ 0.5 J.
- Criterion 2 ✅ 21 scenarios: rope A (`mass: 2` on `q`, arc 1) 10, without the 1/1 μ = 0.1 `vx = 8`; rope B (`mass: 2` on `p`, arc 0) 11. Built on CLEAN-25's `twoPulleyTableScene`.
- Criterion 3 ✅ the 7 scenarios, with `vx` on `b`.
- Criterion 4 ✅ on every step where the grip's arc in `RopeState.path` has a negative sweep, the test checks `arcs.length + 1` segments (one arc per pulley, so `via.length + 1`), each strictly equal to `tension`. It also requires at least one loose step per scenario.
- Criterion 5 ✅ `acceptance.test.ts` only gains lines; no existing test or tolerance changed. Full suite green.
- Criterion 6 ✅ every ADR statement is present, including the exact PHY-57 sentence in `Grips and pieces`. The PHY-54 item says every rope keeps the history and the predicted poses write only the release; the pointer to PHY-55 is gone. Before the review fix, two of the code checks passed only because of line wrapping (fix below). The `git grep`s now find `stays loose for the world's life` on one line in `Grip.loose` (172), `Piece.length` (187) and the ADR (34), and nothing for the three removed phrases.
- Criterion 7 ✅ all four mutations are recorded under the ticket. The review reproduced two of them on `bdadc09`:
  - Mutation 1 (`releaseGrips(rope, endFrame.path)` removed): 27 red, namely 10 of criterion 1, 10 of rope A and 7 of criterion 3. Rope B and criterion 4 stay green, exactly the record's pattern.
  - Mutation 4: 39 of 39 criterion-4 scenarios red. With the assertion temporarily changed to `split === loose`, all 39 pass, so every loose step splits (16,627 of 16,627). The ticket's 17,160 was the prototype's loose-step count. Both files were reverted afterwards.
  - Mutation 1's ranges for criterion 1 and rope A differ from the ticket's prototype numbers. That is harmless: removing the end-of-step release still leaves the real-pose release in `correctPieces`, which the prototype probably lacked. The red/green pattern matches, and the tests assert ≤ 0.5 J, not the size of the gain.
- Test-first ✅ `06ca814` touches only `acceptance.test.ts` and the ticket's `Stage:`. `632bffc` touches only `simulator.ts`. `b7b0bbc` touches only the ADR. Every changed file is in Primary files.
- Red-green: 78/78 PHY-55 tests red with `simulator.ts` from `8ac107c`, 78/78 green at HEAD.
- Regressions: none found.
  - `releaseGrips` keeps piece and grip indices aligned: `held` counts the held grips before the one that lets go, which is the index of its arriving piece.
  - `spin`, `turns`, `gripShares`, `pieceLengths` (`k < shares.length`), `piecePulls` and `segmentTensions` all count held grips only.
  - `placeDisks` and the shared-body grouping in `step()` still walk every grip. That is harmless: a loose disk stays on its axle and only widens a group.
- The release is also in `correctPieces`, on its real-pose read. That function's Primary-files scope names only "giro e parte só dos grips presos". It still falls under "na leitura das poses reais", and criterion 4 depends on it, since `RopeState.path` comes from that read.
  - Side effect: a piece joined there starts the correction with base tension 0, although `pullPieces` already applied the two old pieces' forces that step. The ticket asks for that 0, and all 39 scenarios stay ≤ 0.5 J.
- Review fix in `e791745`, comments only, no behaviour change: the `Grip` docblock no longer carries "two pieces, each of fixed length" across a line break, and `Piece.length` keeps "stays loose for the world's life" on one line.
- Standards judgement calls, not fixed:
  - `PHY55_TABLE` repeats the inline PHY-54 grid line for line.
  - `PHY55_AWAY_RUNS` builds its name next to `phy55Label` instead of with it.
  - The piece literal with zero tension, residual, `predicted` and `target` appears in both `releaseGrips` and `buildWorld`.
  - `held` is a piece index in `releaseGrips` but a `Grip[]` in `piecePulls` and `correctPieces`.
  - The rope A exclusion predicate carries no reason in the test. The reason is under Comments.
  - The `gripScene` docblock describes the runs' `arc` field, not one of its own parameters.
- Proxy decided, on the human's behalf (9 lines under Comments):
  - the loose grip joins the two pieces into one and sits there as an ideal pulley;
  - release on the end-of-step prediction too, one way only;
  - history on every pulley of a rope with a grip;
  - re-engagement cut to PHY-57;
  - criterion 2 uses the mixed rope and is blocked by CLEAN-25;
  - A 1/1 `vx = 8` out of criterion 2;
  - `Blocked by: CLEAN-25, CLEAN-26, PHY-56`;
  - the loose disk keeps its ω and the energy counts only the blocks;
  - 0.5 J threshold, `hard`/`agent`.

Gate on the branch at `e791745`, based on the session tip `8ac107c`: `npm test` 30 files, 930 tests passed; `lint`, `typecheck` and `build` clean.

Merged into `sweatshop/2026-10-02-1156` as `4cdc99d` (`--no-ff`).

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, no bloco `rope over a fixed pulley (PHY-23)`, pelo motor público (`createSimulator(parse(scene))`), sem mocks. Os testes reaproveitam `tableScene`, `maxEnergyGain` e a `twoPulleyTableScene` do CLEAN-25.
  - De `twoPulleyTableScene(m1, m2, mu, vx?)`, este ticket precisa da cena descrita no critério 2, com as duas polias sem `mass` e os ids `p` e `q`. O teste põe `mass: 2` na polia certa.
  - A cena é um objeto: o teste põe `mass` na polia e `vx` em `b` sem mudar os helpers.
  - Testes:
    - o critério 1 num `it.each` de 11, vermelho hoje pela energia (+231 J a +40,8 kJ);
    - o critério 2 num `it.each` de 21 (cordas A e B), vermelho hoje pela energia;
    - o critério 3 num `it.each` de 7, vermelho hoje pela energia (+894 J a +5,4 kJ);
    - o critério 4 num teste próprio sobre os mesmos 39 cenários, vermelho hoje porque nenhum passo tem varredura negativa no arco do grip.
- O nome de cada teste leva `PHY-55`, para o `-t PHY-55` da Verification.

## Registro do mutate-verify (stage 2, 2026-10-02)

Os testes são `it.each` por cenário no `Simulator` público, então "vermelho" é por cenário (39 no total). Cada mutação foi aplicada em `src/sim/simulator.ts` sobre `b7b0bbc`, rodou `npx vitest run src/sim/acceptance.test.ts -t PHY-55` e foi desfeita com `git checkout` antes da seguinte. O ganho é o `expected N to be less than or equal to 0.5` da asserção de energia; no critério 4 é a asserção de `split` (`expected 447 to be +0`) ou a de `loose` (`expected 0 to be greater than 0`).

**Vermelho do commit de testes (`06ca814`, sem a correção):** 78 de 78 vermelhos (os 39 de energia e os 39 do critério 4). Ganhos de hoje batem com os do ticket (critério 3: +893,7; +5406,9; +3557,4; +1906,1; +3342,2; +2946,0; +4409,1 J). O 1/1 com μ = 0,1 e `vx = 8` do critério 1 só fica vermelho aqui, sem histórico nenhum (+231,5 J).

| # | Mutação | Critério 1 (11) | Critério 2 (A 10 + B 11) | Critério 3 (7) | Critério 4 (39) |
|---|---|---|---|---|---|
| 1 | tira `releaseGrips(rope, endFrame.path)` de `pullPieces` (solta só nas poses reais) | vermelho 10/11, de +530,5 J a +189 294,4 J; verde: 1/1 μ = 0,1 `vx = 8` | A vermelho 10/10, de +4829,7 J a +45 267,3 J; B verde 11/11 | vermelho 7/7, de +205,7 J a +3683,6 J | verde 39/39 |
| 2 | `releaseGrips` vira no-op (histórico sem juntar as peças) | vermelho 10/11, de +42 445,1 J a +213 718,1 J; verde: 1/1 μ = 0,1 `vx = 8` | A vermelho 10/10, de +58 465,1 J a +393 826,6 J; B vermelho 9/11, de +11 542,5 J a +265 106,7 J; verdes na B: 2/1 μ = 0,2 `vx = 6` e 1/1 μ = 0,1 `vx = 8` | vermelho 7/7, de +205,7 J a +360 087,0 J | vermelho 39/39 |
| 3 | `ropeFrame` passa `sweeps` só nos índices com grip quando a corda tem grip | verde 11/11 | A vermelho 10/10, de +410,8 J a +5287,3 J; B vermelho 11/11, de +162,2 J a +3135,0 J | verde 7/7 | vermelho 1/39 (A 1/3 μ = 3: `loose` = 0) |
| 4 | `segmentTensions` com os limites de todos os grips, presos ou soltos | verde 11/11 | verde 21/21 | verde 7/7 | vermelho 39/39 (10 da A, 11 da B, 18 do critério 1 e 3) |

As mutações 2, 3 e 4 batem com o que o critério 7 prevê. A 1 bate no padrão (o que fica vermelho e o que fica verde) e a faixa do critério 3 é exata. As faixas do critério 1 e da corda A do critério 2 divergem das do ticket: ver `## Comments`.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-54, a partir de probes descartáveis sobre `0ab2f57`. Nada foi commitado.
- 2026-10-02 Stage 1, depois do PHY-52 e do PHY-54. Medido de novo sobre `7590eec`, com probes e um protótipo descartáveis (nada commitado). O 1/2 com μ = 3 e `M = 2` ganha +964,2 J no passo 155 (era +1,94 MJ). A regra do PHY-54 só no grip dá +122,5 kJ com a regra do CLEAN-25 (era +285 kJ). Caminho: histórico em toda corda; o grip se solta na leitura real ou na previsão do fim do passo; as duas peças viram uma. O reengate foi cortado para o PHY-57. Os números do protótipo nos critérios 1 a 4 e nas mutações usam a regra das junções do CLEAN-25 (`t = k/(n + 1)` na ordem de `via`). Com a regra de hoje, 7 dos 21 cenários do critério 2 falham.
- 2026-10-02 Proxy decided: o grip solto junta as duas peças numa só, de comprimento somado, e fica nela como polia ideal — a regra do PHY-54 só no grip dá de +42,4 kJ a +213,7 kJ; juntar dá ≤ 0,0 J sem mudar a corda cujo grip segura.
- 2026-10-02 Proxy decided: soltar também pela previsão do fim do passo, num sentido só — só na leitura real dá até +45,9 kJ, e a previsão segue sem escrever `keep` nem `sweeps`.
- 2026-10-02 Proxy decided: histórico em todas as polias de uma corda com grip — só no grip, a corda mista ganha até +5,3 kJ; custa uma linha em `ropeFrame`.
- 2026-10-02 Proxy decided: cortar em dois, soltura aqui e reengate no PHY-57 — a corda mista não pede código a mais, e o reengate tem critérios próprios que nenhum critério de energia separa.
- 2026-10-02 Proxy decided: o critério 2 fica com os cenários da corda mista e bloqueia por CLEAN-25 — 7 deles só passam com a regra de junções do CLEAN-25, e são os casos em que a corda sai das duas polias.
- 2026-10-02 Proxy decided: o A 1/1 com `vx = 8` sai do critério 2 — passa hoje (−0,14 J) e não fica vermelho com nenhuma das mutações do critério 7.
- 2026-10-02 Proxy decided: `Blocked by: CLEAN-25, CLEAN-26, PHY-56` — o CLEAN-26 muda `gripShares` e o PHY-56 guarda o caminho em `ropeFrame`, as duas funções que este ticket muda; o PHY-56 não diz nada sobre grip que conflite.
- 2026-10-02 Proxy decided: o disco solto segue com o ω que tinha, e o critério de energia conta só os blocos — o disco parte do repouso, então blocos acima de `E₀` já é ganho do sistema.
- 2026-10-02 Proxy decided: limiar de 0,5 J (o do PHY-54); `Difficulty: hard`, `Review: agent` — critérios que interagem e lógica numérica em funções que todo grip usa; nada de gosto.
- 2026-10-02 Stage 2: duas faixas da mutação 1 do critério 7 não batem com o texto do ticket, e deixei o critério como está. Critério 1: medi de +530,5 J a +189 294,4 J (o ticket diz de +587 J a +45,9 kJ). Corda A do critério 2: de +4829,7 J a +45 267,3 J (o ticket diz de +4,4 kJ a +46,0 kJ). Não investiguei de onde vem a diferença; a mutação que apliquei foi tirar a linha `releaseGrips(rope, endFrame.path)` de `pullPieces`, e o protótipo do ticket pode ter tirado a previsão de outro jeito. O padrão do que fica vermelho e do que fica verde é o do ticket, e a faixa do critério 3 bate exato (de +205,7 J a +3683,6 J).
- 2026-10-02 Stage 2: a mutação 3 deixa vermelho um cenário do critério 4 (corda A, 1/3 com μ = 3), que o critério 7 não prevê. Sem o histórico na polia ideal `p`, a corda nunca sai do disco nesse cenário (`loose` = 0), então o teste falha pelo lado de "pelo menos um passo solto". É coerente com o critério 4 e não muda nada nos critérios 1 a 3.
