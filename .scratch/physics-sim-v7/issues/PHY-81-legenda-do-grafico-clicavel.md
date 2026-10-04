# PHY-81: Legenda do gráfico clicável
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-76, PHY-78
Review: agent
Difficulty: normal

- Primary files:
  - src/render/graph.ts (`GRAPH_COLORS` :9; `graphLayout` :32-48; `drawGraph` :89-145, legenda :132-143 removida; novos `colorOf`, `visibleSeries`)
  - src/render/graph.test.ts
  - src/App.tsx (painel do gráfico no dock do PHY-76; `repaintGraph` :857-872; caminho dos chips do PHY-78 para gravar `focus.hidden`)
  - src/App.test.ts
  - src/App.browser.test.ts
  - src/render/draw.ts (`splitLabel` :29, consumido para o subscrito em HTML)
  - src/scene/types.ts (`Focus.hidden`, consumido sem alterar)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`graph.legend`)

#### What to build

Hoje a legenda é texto pintado no canto superior direito do canvas do gráfico, e a cor de cada curva é `GRAPH_COLORS[i % 4]` pela posição na lista. Depois deste ticket a legenda é HTML, clicável, e as curvas escondidas ficam no Foco da cena.

**Legenda.** Dentro do painel do gráfico, no canto superior direito (o `<select>` de tipo fica no esquerdo), uma lista com `aria-label` `t('graph.legend')` ("curvas do gráfico" / "graph curves") e um `<button aria-pressed>` por série do tipo atual, na ordem de `seriesFor`: uma amostra de cor (`<span>` com `background` igual a `colorOf(nome)`) e o nome com o subscrito em `<sub>` via `splitLabel` (`E_pg` → `E` + `<sub>pg</sub>`). Pressionado = visível. O clique alterna o nome em `focus.hidden[kind]` pelo caminho dos chips do PHY-78: edição de visualização, fora do undo, sem reset, funciona com o slider para trás, salva em cenas do usuário, só da sessão em presets. `hidden` é por tipo: esconder `E_pg` em energia não afeta momento; trocar de tipo e voltar mantém o que estava escondido.

**Cor por identidade.** `colorOf(name: string): string` dá a cor pelo nome da série, não pela posição: `x`/`v_x`/`a_x`/`E_c`/`p_x` → cor 0; `y`/`v_y`/`a_y`/`E_pg`/`p_y` → cor 1; `|v|`/`|a|`/`E_mec`/`|p|` → cor 2; `E_el` → cor 3. Uma curva mantém a cor quando as vizinhas somem; a legenda e o traço usam a mesma função.

**Só as visíveis.** `visibleSeries(series, hidden: readonly string[] | undefined)` filtra pelo nome mantendo a ordem. `graphLayout` recebe só as visíveis (a auto-escala y ignora as escondidas) e `drawGraph` desenha só as visíveis, com `colorOf`, e não desenha mais legenda. `drawGraph` ganha `colorOf` como parâmetro ou o importa do próprio módulo; o cursor tracejado e os eixos ficam. Com todas escondidas, `graphLayout([])` já devolve um eixo [−1, 1] e nada é desenhado.

#### Acceptance criteria

1. `colorOf('E_pg')` é a mesma string com ou sem `E_c` presente (é função só do nome); dentro de cada tipo, `colorOf` é distinta para cada nome de `seriesFor` (energia com mola: 4 cores distintas; os outros, 2 ou 3); `colorOf('E_c') === colorOf('x') === colorOf('p_x')`.
2. `visibleSeries([E_c, E_pg, E_mec], ['E_pg'])` devolve `[E_c, E_mec]` na ordem; com `undefined` devolve todas; com todos os nomes devolve `[]`.
3. `graphLayout(visibleSeries(series, ['E_pg']), 2, 600, 180)` com `E_c` em [0, 10] e `E_pg` em [100, 200] tem `ticksY` dentro de [−0,5, 10,5]; sem o filtro, dentro de [−10, 210].
4. `drawGraph` com um `ctx` falso não chama `fillText` com `E_c`, `E_pg`, `E_mec` nem `c`/`pg`/`mec` (sem legenda no canvas) e chama `stroke` com `strokeStyle` igual a `colorOf(nome)` para cada série passada, só para as passadas.
5. No `App`, com o gráfico aberto em energia numa cena sem mola, a lista `t('graph.legend')` tem três botões `E_c`, `E_pg`, `E_mec` (texto com `<sub>`), todos `aria-pressed="true"`, cada um com uma amostra cujo `style.background` é `colorOf(nome)`.
6. Clicar em `E_pg`: `aria-pressed="false"`; trocar o tipo para momento mostra `p_x`, `p_y`, `|p|` todos pressionados; voltar a energia mantém `E_pg` despressionado; depois de `AUTOSAVE_DELAY_MS` a cena salva tem `focus.hidden.energy` igual a `['E_pg']`.
7. O clique na legenda deixa undo e redo `disabled`, não muda o número de chamadas a `step` nem o valor do slider, e funciona com o cursor no registro 5.
8. Uma cena carregada do storage com `focus: { show: [...], hidden: { energy: ['E_pg'] } }` abre o gráfico de energia com `E_pg` despressionado.
9. Browser (Chromium): depois de 60 passos num preset com corpo selecionado e o gráfico de energia aberto, contar os pixels do canvas do gráfico a até 40 de distância RGB de `colorOf('E_pg')` dá > 0; depois de clicar em `E_pg` na legenda, dá 0, e a contagem de `colorOf('E_c')` fica dentro de ±5 % da anterior; a lista da legenda está contida no retângulo do painel, com `right` a no máximo 8 px da borda direita dele.
10. `graph.legend` em pt-BR e en; paridade verde.

#### Verification

    npm test -- src/render/graph.test.ts src/App.test.ts src/App.browser.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/graph.test.ts`: critérios 1 a 4 chamando `colorOf`, `visibleSeries`, `graphLayout` e `drawGraph` direto; vermelhos hoje (não existem; `drawGraph` escreve a legenda).
- `src/App.test.ts`: critérios 5 a 8 com o simulador falso; vermelhos hoje (não há legenda HTML). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.
- `src/App.browser.test.ts`: critério 9 com `withBrowserSession` e `getImageData`; vermelho hoje. Mesma regra de evidência.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: depende de B e D1; legenda HTML cujas entradas ligam e desligam curvas; curvas escondidas em `focus`, por tipo de gráfico; cor por identidade da série, não por índice; auto-escala y só com as visíveis.
- Planner: botões `aria-pressed` com amostra de cor no canto superior direito; clique pelo caminho dos chips; `drawGraph` e `graphLayout` recebem só as visíveis; `colorOf` por nome.
