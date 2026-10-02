# PHY-55: A corda se solta da polia com massa quando o bloco passa por ela, sem ganho de energia
Stage: implementing
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
