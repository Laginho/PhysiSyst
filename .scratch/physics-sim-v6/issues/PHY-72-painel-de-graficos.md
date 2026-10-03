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
  - src/App.browser.test.ts (critério 6, `withBrowserSession`)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`graph.*`)
  - src/sim/energy.ts (consumido)

#### What to build

Um painel recolhível abaixo da barra de transporte, na largura da coluna do canvas (`size.width`, segue o resize), altura fixa 180 px, fechado por padrão; botão `t('graph.toggle')` ('gráfico' / 'graph') na barra de transporte, à direita do rótulo de tempo, com `aria-pressed` e `aria-controls` apontando para o painel. Estado aberto/fechado só em React (não persistido).

Dentro do painel: um `<select>` nativo no canto superior esquerdo com os tipos `position`, `velocity`, `acceleration`, `energy`, `momentum` (rótulos `graph.kind.*`), padrão `energy`; um `<canvas>` com `role="img"` e `aria-label` = `t('graph.aria', { kind, id })` ('gráfico de energia — bloco-1'); legenda no canto superior direito com os nomes das curvas na cor de cada uma, usando `splitLabel` para os subscritos.

Curvas por tipo, do corpo selecionado (nada selecionado → sistema, só para `energy` e `momentum`; a desabilitação dos tipos cinemáticos é o PHY-73, aqui o `<select>` só cai em `energy` quando não há seleção e o tipo é cinemático):

- posição: `x`, `y` (m)
- velocidade: `v_x`, `v_y`, `|v|` (m/s)
- aceleração: `a_x`, `a_y`, `|a|` (m/s²) — do `acceleration` gravado por quadro
- energia: `E_c`, `E_pg`, `E_mec` (J); no corpo `E_mec = E_c + E_pg`, sem `E_el` mesmo com molas; no sistema também `E_el` (só com molas), com `E_mec` vindo de `systemEnergy`
- momento: `p_x`, `p_y`, `|p|` (kg·m/s)

Séries vêm da `Recording` do PHY-64 (um ponto por registro, `t = i·TIMESTEP`), calculadas a cada repaint sem cache. Eixo do tempo de 0 ao máximo entre o fim da gravação e 1 s, crescendo até 10 s (`RECORDING_CAP·TIMESTEP`); eixo y auto-escala no mín/máx de todas as curvas do tipo, com margem de 5% e incluindo o zero quando as curvas cruzam; 2 a 3 marcas por eixo com rótulo via `fmtNum` e a unidade no fim do eixo. Linha vertical do cursor no tempo do slider (`playback.cursor`; ao vivo, no último registro). Paleta fixa de 4 cores (`GRAPH_COLORS`), independente das cores dos vetores.

Módulo puro `src/render/graph.ts`:

- `graphLayout(series: Series[], tMax: number, width: number, height: number): Layout` com `plot` (retângulo interno), `ticksT`, `ticksY`, `mapT(t)`, `mapY(v)`.
- `seriesFor(kind, frames, bodyId | null, scene): Series[]` — nomes, unidade e pontos, usando `bodyEnergy`/`systemEnergy`.
- `drawGraph(ctx, layout, series, cursorT, lang)`.

#### Acceptance criteria

1. `graphLayout` com uma série de 0 a 10 e `tMax = 2`: `ticksT` tem 2 ou 3 valores dentro de [0, 2]; `ticksY` tem 2 ou 3 valores dentro de [−0,5, 10,5]; `mapT(0)` é a borda esquerda do `plot` e `mapT(2)` a direita; `mapY` é decrescente em pixels.
2. Séries com valores −3 e 5 dão `ticksY` que inclui 0; série constante 4 dá um eixo y com extensão não nula (não divide por zero).
3. `seriesFor('energy', …)` com um corpo selecionado devolve 3 séries (`E_c`, `E_pg`, `E_mec`) com ou sem molas na cena, com `E_mec = E_c + E_pg` em cada ponto; sem seleção (sistema) devolve 3 séries sem molas e 4 com mola (`E_el`); os valores do primeiro ponto batem com `bodyEnergy` (corpo) ou `systemEnergy` (sistema) do quadro 0.
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

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-72-painel-de-graficos-asked-20261003-2023`): PHY-72 ficou `blocked`, registrado no commit `5e80601`. /  / Falta definir `E_el` para um corpo selecionado. Recomendo reservar energia elástica ao sistema e mostrar, por corpo, `E_c`, `E_pg` e `E_mec = E_c + E_pg`. /  / A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige “`Stage: blocked` with the question under `## Comments`” nessa situação, sem proxy disponível. /  / Nenhuma alteração de código; testes não executados. Árvore limpa.
- Proxy decided: com corpo selecionado o gráfico de energia mostra `E_c`, `E_pg` e `E_mec = E_c + E_pg` (3 curvas, sem `E_el` mesmo com molas), somado em `graph.ts` sem mexer em `bodyEnergy`; `E_el` e a 4ª curva ficam só no escopo sistema, com `E_mec` de `systemEnergy`; `src/App.browser.test.ts` entra em Primary files — a spec (§Energia, leitura do corpo) e o PHY-71 já dão ao corpo só E_c/E_pg e ao sistema E_el; a energia da mola não tem atribuição por corpo definida e inventar uma seria convenção física nova, enquanto E_c+E_pg é a energia mecânica de um corpo do livro; o teste de browser já era costura nomeada. Retomar da branch `asked/phy72-painel-graficos-20261003-2023` (só o commit de docs `5e80601`, sem código).

- 2026-10-03 Attempt 1 stopped to ask: PHY-72 está `blocked` na branch `asked/phy72-painel-graficos-20261003-2023`. /  / A decisão que resolve o bloqueio já está na branch de sessão (`221000f`), mas ainda não foi incorporada à branch do ticket. /  / A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige parar quando a etapa registrada é `blocked`. Nenhum código alterado; testes não executados.
- 2026-10-03 Foreman: o segundo bloqueio foi causado pelo ponteiro "Retomar da branch asked/..." da linha Proxy decided acima: aquela branch só tem o commit de docs `5e80601` (Stage blocked, nenhum código). Não há nada a retomar: criar `phy/PHY-72-painel-de-graficos` a partir da sessão e implementar com o contrato já corrigido aqui (critério 3, bullet de energia, Primary files).
