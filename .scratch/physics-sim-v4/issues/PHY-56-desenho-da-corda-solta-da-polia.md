# PHY-56: O desenho da corda mostra a corda solta da polia
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/sim/simulator.ts (`RopeState`: campo novo `path`; `RopeBinding`: o caminho da última leitura das poses reais, guardado em `ropeFrame` onde `keep` e `sweeps` são e nascido em `buildWorld`; `readConstraints`)
  - src/sim/acceptance.test.ts (bloco `rope over a fixed pulley (PHY-23)`: os testes novos do PHY-56, e o `toStrictEqual` do teste `the constraint readout lists every rope by id, taut with T > 0 once the scene runs`, que ganha `path`)
  - src/render/draw.ts (`drawScene`: parâmetro `constraints` e o arco da corda)
  - src/render/draw.test.ts (bloco novo `drawScene, rope path (PHY-56)`)
  - src/render/overlay.ts (`tensionArrows`)
  - src/render/overlay.test.ts (bloco `tensionArrows`)
  - src/App.tsx (`paint`: as leituras passadas a `drawScene` e a `tensionArrows`)
  - src/App.test.ts (bloco novo `desenho da corda durante o playback (PHY-56)`)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (seção `The rim and the kept wrap direction (PHY-45)`: os itens `The kept direction` e `The unwound sweep (PHY-54)`)

#### What to build

Durante o playback, a corda desenhada é a corda que o simulador resolve. Depois que ela sai de uma polia ideal (PHY-54), o canvas mostra a perna reta entre as pontas, e as setas de `T` seguem essa perna. No editor (t = 0, antes do primeiro passo, depois de reiniciar ou durante uma edição estrutural) o desenho fica como hoje.

Hoje o desenho (`scenePath`, chamado por `drawScene` e por `tensionArrows`) refaz o caminho a cada quadro a partir das poses, sem direção guardada e sem histórico de varredura. Na cena da mesa do PHY-54 a corda simulada se solta e fica reta, os dois blocos caem juntos para longe da polia, e a corda desenhada continua subindo até a polia, dando a volta nela e descendo. No passo 600 de 1/2 com μ = 3 ela mede 592,7 m a mais que a distância entre as pontas.

**A costura.** O simulador já tem o caminho que resolve: o `RopePath` que `ropeFrame` monta nas poses reais, com `keep` e `sweeps`. A última leitura dessas poses é a da correção, depois do `world.step()`. A correção só muda velocidades, então esse caminho está exatamente nas poses que `readStates()` devolve. O simulador guarda esse caminho por corda e o expõe em `RopeState.path`. O `readConstraints()` já entrega esse estado ao App junto com `T` a cada quadro (`constraintsRef`, atualizado nos mesmos pontos que `statesRef`). O desenho não recalcula nada: lê `path` do estado da corda. Antes do primeiro passo, `path` é o caminho nas poses do documento, ou seja, o `scenePath` do documento.

Uma polia está **solta** quando `sweep < 0`. Varredura 0 é corda engatada e ainda é desenhada como arco.

- `drawScene` recebe um `constraints` opcional (o mesmo `readonly ConstraintState[]` que `tensionArrows` recebe). Uma corda cujo estado tem `path` é desenhada desse `path`. Sem `constraints`, sem estado para a corda ou sem `path`, ela é desenhada do `scenePath`, como hoje.
- `tensionArrows` usa o `path` do estado quando ele existe, e o `scenePath(view)` quando não existe. Uma polia solta numa montagem dinâmica não ganha seta: ela não puxa nada (PHY-54).
- `paint` monta uma variável só com as leituras da corda: `constraints` quando há leitura do simulador (`states` não nulo), `[]` quando não há. Essa variável alimenta `drawScene` e `tensionArrows`. `elasticArrows` continua recebendo `constraints` sem guarda, porque mostra `F_el` em t = 0. No editor o `constraintsRef` pode estar velho, porque só é atualizado no boot, no reset e no rebuild. Sem a guarda, a corda ficaria parada enquanto o bloco é arrastado. Pior: depois de uma edição em t = 0 que dá à corda um `via` mais longo que o da leitura velha (um undo que devolve uma polia numa montagem dinâmica), `tensionArrows` lê `segments[i + 1]` indefinido antes de olhar a magnitude, e o `paint` lança.
- O arco: `drawScene` desenha com `ctx.arc(…, arc.start, arc.start + arc.direction * arc.sweep, arc.direction < 0)`. Com uma varredura negativa, o canvas desenharia quase a volta inteira, e o `arc` ainda ligaria a junção na perna ao ponto do aro com uma reta. Por isso a polia solta não tem arco: nenhuma chamada de `arc` da corda para ela, só os dois segmentos colineares. Acima de 2π a chamada fica como está: o canvas desenha a circunferência inteira quando `|fim − início| ≥ 2π`, que é a corda dando mais de uma volta.
- De graça: o desenho passa a guardar a direção do PHY-45, então as pernas que se cruzam por baixo do disco não invertem mais no desenho. Uma corda com polia com massa é desenhada com `keep` e sem histórico, como o simulador a resolve hoje. Quando o PHY-55 der histórico ao grip, o desenho acompanha sem mudar.
- Nada aqui depende de onde fica a junção de uma polia solta na perna (o CLEAN-25 a muda para `t = k/(n+1)`). O texto do ADR, os comentários e os testes deste ticket não dizem onde ela fica. Os `path` montados à mão nos testes são entradas, não afirmações sobre o `release`.

**Fora do escopo:**
- O clique na corda durante o playback (`ropeAtPoint`) segue testando as pernas do `scenePath`. Vai para o CLEAN-27.
- O `L` do painel da corda (`RopePanel`) é o comprimento no documento e continua vindo de `scenePath(doc)`.
- O caminho que o `release` devolve com duas polias soltas de projeções invertidas é o CLEAN-25. Aqui o desenho mostra o caminho do simulador, seja qual for.

#### Acceptance criteria

1. Simulador, pelo motor público (`createSimulator(parse(scene))`):
   1. Antes de qualquer passo, a entrada de cada corda em `readConstraints()` tem `path` `toStrictEqual` a `scenePath(parse(scene), corda)`, na cena da mesa do PHY-54 (1/2, μ = 3) e na Atwood do PHY-23 (`atwoodScene(3, 2)`).
   2. Cena da mesa do PHY-54, 1/2 com μ = 3, 600 passos. Depois de cada passo, `path.segments[0].from` e `path.segments.at(-1).to` são as âncoras da corda em `a` e em `b` nas poses de `readStates()`, a 10⁻⁹. `path.arcs[0].sweep` fica negativa em algum passo antes do 200 (medido: passo 129, e não volta a ser positiva até o 600). Em todo passo com varredura negativa, `|path.length − |a − b|| ≤ 10⁻⁹`, com `a` e `b` essas âncoras.
2. `drawScene`, chamado direto com um contexto que grava as chamadas (o `recordingCtx` de `draw.test.ts`), numa cena com uma corda sobre uma polia. Os arcos dos `path` montados à mão usam o centro e o raio da polia da cena. "Solta" é `sweep < 0`.
   1. Sem `constraints`, as chamadas de `moveTo`, `lineTo` e `arc` da corda são as do `scenePath` da cena: um `moveTo(from)`/`lineTo(to)` por segmento e um `arc(center, radius, start, start + direction·sweep, direction < 0)` por arco.
   2. Com `constraints` trazendo para a corda um `path` montado à mão e diferente do `scenePath` (polia solta: dois segmentos colineares e um arco de varredura −0,5):
      - há um `moveTo(from)`/`lineTo(to)` para cada segmento desse `path`;
      - nenhum `lineTo` cai nos pontos de tangência do `scenePath`;
      - as chamadas de `arc` com o centro da polia são só as duas do disco e do eixo, nenhuma da corda.
   3. Com um `path` de arco engatado e varredura 7 rad, nas duas direções: uma chamada de `arc` da corda com `fim − início = direction · 7`. Com varredura 0: uma chamada de `arc` da corda, com `fim = início`.
   4. Com `constraints` sem entrada para a corda, ou só com estados de mola, a corda é desenhada como no item 1.
3. `tensionArrows`, chamado direto:
   1. Com o estado da corda trazendo um `path` montado à mão (ponta `a` dinâmica em (0, 0), ponta `b` dinâmica em (3, 4), polia numa montagem fixa fora da reta `a–b`, solta no `path`, com a junção montada à mão em (1,5; 2)): a seta em `a` aponta ao longo de (0,6; 0,8) e a de `b` ao longo de (−0,6; −0,8), a 10⁻⁹.
   2. Com o `path` do estado dando varredura negativa a uma polia numa montagem dinâmica: nenhuma seta no centro dessa polia, e as setas das pontas seguem os segmentos das pontas do `path`.
   3. Sem `path`, como hoje: os testes existentes do bloco `tensionArrows` ficam como estão.
4. App, com um contexto de canvas que grava as chamadas e um simulador falso. O `readConstraints` falso devolve para a corda um `path` marcador, longe de tudo no documento (por exemplo os segmentos (100, 100)–(101, 100)–(102, 100) e um arco de varredura −0,5):
   1. Depois do boot, antes de qualquer passo, nenhum `lineTo` da tela cai nos pontos do marcador, e a corda é desenhada do `scenePath` do documento.
   2. Depois de `⏭ passo`, a tela tem `lineTo(101, 100)` e `lineTo(102, 100)`.
   3. Depois de `⟲ reiniciar`, volta a valer o item 1.
   4. Leitura velha. No documento, a `corda` passa por uma polia numa montagem dinâmica. O `readConstraints` falso devolve para a `corda` um `path` de um segmento só, sem arco. Depois do boot, o `paint` não lança e a corda é desenhada do `scenePath` do documento.
5. ADR-0004:
   - O item `The kept direction` diz que durante o playback a corda é desenhada do `RopeState.path` do simulador, e que `scenePath` (sem direção guardada, sem histórico) desenha o editor.
   - No item `The unwound sweep (PHY-54)`, a frase "Drawing the loose rope is PHY-56." sai, e o item passa a dizer que a polia solta (`sweep < 0`) é desenhada sem arco. Ele não diz onde fica a junção.
   - O comentário de `RopeState.path` diz de onde o caminho vem: a última leitura das poses reais, ou as poses do documento antes do primeiro passo.

   Conferido por `git grep` na Verification.
6. Os testes existentes ficam verdes sem mudar tolerância. O único teste existente que muda é `the constraint readout lists every rope by id, taut with T > 0 once the scene runs`: o `toStrictEqual` dele ganha `path: expect.any(Object)`.
7. Mutate-verify conforme o `AGENTS.md`. Para cada teste, o ticket registra a mutação aplicada e a saída vermelha:
   - `readConstraints` entrega o caminho montado nas poses atuais com `keep` e sem `sweeps`: o item 2 do critério 1 fica vermelho, porque a varredura nunca é negativa.
   - `readConstraints` sem `path`: o item 1 do critério 1 fica vermelho.
   - `paint` passa a `drawScene` as leituras sem guarda, sem olhar `states`: os itens 1 e 3 do critério 4 ficam vermelhos.
   - `paint` não passa leituras a `drawScene`: o item 2 do critério 4 fica vermelho.
   - `paint` passa a `tensionArrows` as leituras sem guarda: o item 4 do critério 4 fica vermelho.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-56
    npx vitest run src/render/draw.test.ts src/render/overlay.test.ts
    npx vitest run src/App.test.ts -t PHY-56
    git grep -n "RopeState.path" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    git grep -n "Drawing the loose rope is PHY-56" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

O primeiro `git grep` acha o item `The kept direction`. O segundo não acha nada.

O gate precisa de um Chromium na máquina (`CHROME_BIN` aponta para ele quando está fora dos caminhos padrão), por causa dos testes de layout do `AGENTS.md`. Os testes deste ticket não precisam dele.

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `rope over a fixed pulley (PHY-23)`, pelo motor público, sem mocks: os itens 1 e 2 do critério 1, com `PHY-56` no nome. Ficam vermelhos hoje porque `RopeState` não tem `path`. No mesmo commit, o `toStrictEqual` do teste do readout ganha `path: expect.any(Object)` (critério 6), vermelho hoje pela mesma razão. Registro: as duas primeiras mutações do critério 7.
- `src/render/draw.test.ts`, bloco novo `drawScene, rope path (PHY-56)`, chamando `drawScene` direto com o `recordingCtx`. Os itens 2 e 3 do critério 2 ficam vermelhos hoje: o oitavo argumento é ignorado e a corda vem do `scenePath` da cena, cuja varredura fica abaixo de 2π e acima de 0. Os itens 1 e 4 passam antes e ficam registrados como guarda. Chamada direta, sem registro de mutação.
- `src/render/overlay.test.ts`, bloco `tensionArrows`: os itens 1 e 2 do critério 3. Ficam vermelhos hoje porque as setas seguem o `scenePath`: a polia da cena fica fora da reta `a–b`, então a seta em `a` aponta para o ponto de tangência no aro, e a polia na montagem dinâmica ganha setas. Chamada direta, sem registro de mutação.
- `src/App.test.ts`, bloco novo `desenho da corda durante o playback (PHY-56)`: o critério 4. O `getContext` do canvas devolve um contexto que grava as chamadas, e o simulador falso de `makeFakeSimulator` tem `readConstraints` e `readStates` próprios. O item 2 fica vermelho hoje, porque o marcador nunca é desenhado. Os itens 1, 3 e 4 passam hoje e são as guardas do editor, que só as mutações mostram. Costura de DOM: registro das três últimas mutações do critério 7 no ticket.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-54 por decisão do proxy. Nada foi commitado.
- 2026-10-02 Stage 1. Probe descartável no `Simulator` público sobre `506b021`, nos 11 cenários da mesa do PHY-54, 600 passos, lendo o `RopeBinding` interno só para medir:
  - Em todos a corda se solta e fica solta até o passo 600. O primeiro passo com varredura negativa fica entre 64 e 223 (129 em 1/2 com μ = 3).
  - Nos passos soltos, o caminho do simulador mede `|a − b|` a 2,7·10⁻¹⁵. No passo 600, o `scenePath` das poses de `readStates()` passa de `|a − b|` em 404 a 876 m.
  - Remontar o caminho com o `keep` e os `sweeps` guardados, nas poses de `readStates()`, devolve a mesma varredura a 7·10⁻¹⁷: o caminho da correção está nas poses que o App desenha.
  - Nenhuma varredura passou de 2π (máximo 2,04 rad, mínimo −3,32).

  Nada commitado. O probe foi apagado.
- 2026-10-02 Bruno decidiu (stage 1): a polia de onde a corda saiu é desenhada como sempre, e a corda reta passa por fora dela.
- 2026-10-02 Bruno decidiu (stage 1): a corda com varredura acima de 2π é desenhada como a circunferência inteira, que é o que o canvas faz sozinho; `Review: agent`.
- 2026-10-02 Proxy decided: a costura é `RopeState.path`, o caminho que o simulador resolveu na última leitura das poses reais — desenho = simulação por construção, e o `readConstraints` já viaja até o `paint` a cada quadro; recalcular com `keep`/`sweeps` repetiria a regra do grip, e um `readRopePaths()` pediria outro ref no App.
- 2026-10-02 Proxy decided: `path` opcional no tipo `RopeState` — obrigatório quebraria o typecheck do helper `ropeState` de `overlay.test.ts` e de dois literais de `App.test.ts`; o fallback para `scenePath` existe de qualquer jeito para o editor.
- 2026-10-02 Proxy decided: a guarda do editor fica no `paint`, numa variável só que alimenta `drawScene` e `tensionArrows` (`[]` sem `states`), e `elasticArrows` fica sem guarda — o `constraintsRef` só é atualizado no boot, no reset e no rebuild; uma leitura velha com `via` mais curto faz `tensionArrows` ler um segmento indefinido e o `paint` lançar, e `F_el` aparece em t = 0.
- 2026-10-02 Proxy decided: `drawScene` e `tensionArrows` entram os dois — sem as setas, com a corda solta, a seta em `a` aponta para o aro enquanto a corda desenhada vai reta.
- 2026-10-02 Proxy decided: o clique na corda (`ropeAtPoint`) fica fora e vai para o CLEAN-27 — é outra costura (editor, não render), e selecionar a corda solta durante o playback é raro.
- 2026-10-02 Proxy decided: `Blocked by: none` — o desenho mostra o caminho do simulador qualquer que seja, os testes daqui usam uma polia só e nada aqui diz onde fica a junção; o item `The unwound sweep (PHY-54)` do ADR-0004 é editado aqui e no CLEAN-25, e o conflito de texto no rebase o stage 3 resolve, porque o ADR está nos dois Primary.
- 2026-10-02 Proxy decided: um ticket, não dois — umas vinte linhas de produção, uma fatia vertical do simulador até a tela; o simulador expondo `path` sozinho não muda nada que o usuário veja.
- 2026-10-02 Proxy decided: `Difficulty: normal`, `Review: agent` — nada numérico novo; o ponto que um primeiro passe pode errar, a leitura velha no editor, tem critério e mutação próprios.
- 2026-10-02 Proxy decided: sem critério próprio para a direção do PHY-45 no desenho — vem da mesma linha que o critério 1 testa; um cenário a mais mediria o PHY-45 de novo, não esta costura.
