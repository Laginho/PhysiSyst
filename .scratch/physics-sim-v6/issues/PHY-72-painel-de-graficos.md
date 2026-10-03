# PHY-72: Painel de gráficos da gravação
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-71
Review: human
Difficulty: hard

- Primary files:
  - src/render/graph.ts (novo, puro: `graphLayout`, séries por tipo, desenho)
  - src/render/graph.test.ts (novo)
  - src/render/draw.ts (`splitLabel` :29 reutilizado na legenda)
  - src/App.tsx (barra de transporte ~:1763-1849, slider :1839-1848; `recording`, `displayedScene` ~:836-839; `repaint` ~:841-860; `size` do canvas)
  - src/App.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`graph.*`)
  - src/sim/energy.ts (consumido)

#### What to build

Um painel recolhível abaixo da barra de transporte, na largura da coluna do canvas (`size.width`, segue o resize), altura fixa 180 px, fechado por padrão; botão `t('graph.toggle')` ('gráfico' / 'graph') na barra de transporte, à direita do rótulo de tempo, com `aria-pressed` e `aria-controls` apontando para o painel. Estado aberto/fechado só em React (não persistido).

Dentro do painel: um `<select>` nativo no canto superior esquerdo com os tipos `position`, `velocity`, `acceleration`, `energy`, `momentum` (rótulos `graph.kind.*`), padrão `energy`; um `<canvas>` com `role="img"` e `aria-label` = `t('graph.aria', { kind, id })` ('gráfico de energia — bloco-1'); legenda no canto superior direito com os nomes das curvas na cor de cada uma, usando `splitLabel` para os subscritos.

Curvas por tipo, do corpo selecionado (nada selecionado → sistema, só para `energy` e `momentum`; a desabilitação dos tipos cinemáticos é o PHY-73, aqui o `<select>` só cai em `energy` quando não há seleção e o tipo é cinemático):

- posição: `x`, `y` (m)
- velocidade: `v_x`, `v_y`, `|v|` (m/s)
- aceleração: `a_x`, `a_y`, `|a|` (m/s²) — do `acceleration` gravado por quadro
- energia: `E_c`, `E_pg`, `E_el` (só com molas), `E_mec` (J)
- momento: `p_x`, `p_y`, `|p|` (kg·m/s)

Séries vêm da `Recording` do PHY-64 (um ponto por registro, `t = i·TIMESTEP`), calculadas a cada repaint sem cache. Eixo do tempo de 0 ao máximo entre o fim da gravação e 1 s, crescendo até 10 s (`RECORDING_CAP·TIMESTEP`); eixo y auto-escala no mín/máx de todas as curvas do tipo, com margem de 5% e incluindo o zero quando as curvas cruzam; 2 a 3 marcas por eixo com rótulo via `fmtNum` e a unidade no fim do eixo. Linha vertical do cursor no tempo do slider (`playback.cursor`; ao vivo, no último registro). Paleta fixa de 4 cores (`GRAPH_COLORS`), independente das cores dos vetores.

Módulo puro `src/render/graph.ts`:

- `graphLayout(series: Series[], tMax: number, width: number, height: number): Layout` com `plot` (retângulo interno), `ticksT`, `ticksY`, `mapT(t)`, `mapY(v)`.
- `seriesFor(kind, frames, bodyId | null, scene): Series[]` — nomes, unidade e pontos, usando `bodyEnergy`/`systemEnergy`.
- `drawGraph(ctx, layout, series, cursorT, lang)`.

#### Acceptance criteria

1. `graphLayout` com uma série de 0 a 10 e `tMax = 2`: `ticksT` tem 2 ou 3 valores dentro de [0, 2]; `ticksY` tem 2 ou 3 valores dentro de [−0,5, 10,5]; `mapT(0)` é a borda esquerda do `plot` e `mapT(2)` a direita; `mapY` é decrescente em pixels.
2. Séries com valores −3 e 5 dão `ticksY` que inclui 0; série constante 4 dá um eixo y com extensão não nula (não divide por zero).
3. `seriesFor('energy', …)` para um quadro gravado devolve 3 séries sem molas e 4 com mola; os valores do primeiro ponto batem com `bodyEnergy`/`systemEnergy` do quadro 0.
4. `seriesFor('velocity', …)` para um corpo devolve `v_x`, `v_y`, `|v|` com `|v|² = v_x² + v_y²` em cada ponto.
5. No `App`, o botão `graph.toggle` existe na barra de transporte com `aria-pressed="false"` e o painel não está no DOM; depois do clique, `aria-pressed="true"` e o painel tem um `<select>` com valor `energy` e um `<canvas>` com `role="img"`.
6. O `<canvas>` do painel tem a largura CSS da coluna do canvas da cena e 180 px de altura; redimensionar o canvas da cena (alça do PHY-63) muda a largura do gráfico junto (teste de browser com geometria real).
7. Com um corpo selecionado o `aria-label` inclui o id do corpo; sem seleção inclui `t('readout.system')`.
8. Chaves `graph.*` em pt-BR e en; paridade verde.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/graph.test.ts`: critérios 1 a 4 chamando o módulo direto; vermelhos hoje porque não existe.
- `src/App.test.ts`: critérios 5 e 7 com o simulador falso; vermelhos hoje (não há botão nem painel). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.
- `src/App.browser.test.ts`: critério 6 com `withBrowserSession`; vermelho hoje. Mesma regra de evidência.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy). Bruno decidiu: painel recolhível sob a barra de transporte, largura da coluna do canvas, botão na barra.
- Proxy decided: 180 px fixos, estado só em React, fechado por padrão; `<select>` nativo com padrão energia; paleta de 4 cores própria; legenda no canto; Canvas 2D sem lib; y auto-escala, t até 10 s, 2–3 marcas, `fmtNum`; `graphLayout` puro com testes unitários; a11y com `role="img"`, `aria-label`, `aria-pressed`, `aria-controls`; sem cache.
