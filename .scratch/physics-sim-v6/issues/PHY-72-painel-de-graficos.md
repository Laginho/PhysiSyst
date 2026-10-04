# PHY-72: Painel de gráficos da gravação
Stage: done
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

#### Stage 2 implementation (2026-10-03)

- Base: `sweatshop/2026-10-03-1618`; new branch `phy/PHY-72-painel-de-graficos`, as directed by the foreman. PHY-71 is `done`. The archived `asked/*` branch was not resumed.
- Read-around: `splitLabel` callers are `drawScene` and `drawArrow`; only its export changes. `repaint` is called by resize, selection/language effects, document edits, stepping and playback seeking. The graph shares these repaint paths and reads recorded frames, without changing transport or energy calculation. Examined empty/constant series, missing body, no selection, null initial states, spring/no-spring energy, and stored acceleration.
- TDD vertical slices: `ab6f2ba` adds module tests (red: `Cannot find module './graph'`), followed by production commits `7ac3443` and `7f3a89b`; `bcdb8a6` adds DOM/browser tests before their App implementation (DOM: `expected undefined to be defined`; browser: `Error: missing graph toggle`). No production commit edits tests.
- Module mutate-verify: shifting `mapT` by 1 produced `expected 65 to be 64`; replacing y ticks with `[1, 2]` produced `expected [ 1, 2 ] to include +0`; replacing sample values with zero failed both energy cases (`[0,0,0]` versus `[25,60,85]`) and recorded vectors (`0` versus `3,4,5`). All 5 module tests failed under these temporary mutations; source restored.
- DOM mutate-verify, `toggles an accessible panel, defaults to energy and follows selection`: replaced graph aria id with system label unconditionally. Red: `expected 'gráfico de energia — sistema' to contain 'caixa'` at `src/App.test.ts:157`. Source restored.
- Browser mutate-verify, `resizes the recording graph with the scene canvas (PHY-72)`: replaced graph CSS width `size.width` with `500`. Red: `expected 500 to be 1161` at `src/App.browser.test.ts:129`. Source restored. This test drags the real PHY-63 corner handle and checks both widths plus 180 px height.
- Focused unmutated validation: 3 files passed; 7 tests passed, 149 unrelated tests skipped by the PHY-72 filter. Typecheck passed. Chromium initially disconnected inside the sandbox; rerunning with external execution permission produced the expected red and green results.
- Final gate: standard command first stopped on Vitest worker startup timeout (948 tests passed, 1 unhandled worker error). Full retry with `npm test -- --maxWorkers=2` followed by lint, typecheck and build passed: **33 test files, 1085 tests**, no skipped tests or failures. Lint/typecheck exit 0; Vite built 52 modules. Worker limit is command-only, no project configuration changed.
- Final diff checked for scope and whitespace; only Primary files plus this ticket changed. Ready for independent stage-3 review; no merge performed in stage 2.

#### Resolution (2026-10-03)

Verdict: Approve

Os oito critérios escritos passam. Merge local sem squash `0d4a242` na sessão `sweatshop/2026-10-03-1618`; a árvore do merge é idêntica à implementação validada `9e07b70`. Este fechamento registra `Stage: done`, resolução e ledger juntos. `Review: human` permanece para destacar este ticket no PR da sessão, conforme o fluxo; esta revisão não fez push nem abriu PR.

##### Standards

Nenhuma violação acionável de padrão de código ou regressão identificada. Todas as alterações de produção estão nos Primary files; `ab6f2ba` antecede o módulo e `bcdb8a6` antecede a integração no App. Nenhum commit de produção altera testes. O ticket registra a mutação e a saída vermelha de cada teste novo de DOM/browser, conforme o mutate-verify do AGENTS.md.

Dois achados não bloqueantes, preservados da revisão independente:

- Possível **Duplicated Code** (heurística): `src/App.tsx:732` e `:867` repetem a normalização `bodyId === null && kind !== 'energy' && kind !== 'momentum' ? 'energy' : kind`, nas variantes de estado e ref. O comportamento atual é coerente; compartilhar essa regra é uma sugestão opcional, sem fundamento para reabrir.
- **Omissão de processo nas mensagens de commit**: `ab6f2ba`, `7ac3443`, `7f3a89b` e `bcdb8a6` não têm corpo explicando o motivo, solicitado pela seção Commits and closing da skill ticket-flow. Os títulos seguem Conventional Commits em inglês e citam PHY-72. A omissão não é uma das causas de reopen definidas pelo fluxo; nenhum histórico foi reescrito.

Standards: **0 violações acionáveis de código, 1 sugestão heurística e 1 observação de processo não bloqueante**. Nenhuma correção permanente de produção ou teste foi necessária nesta revisão.

##### Spec

Revisão independente sem achados: **0 critérios reprovados, 0 expansões de escopo, 0 regressões identificadas**.

1. ✅ `graphLayout`: três marcas delimitadas, tempo nas bordas do plot e y decrescente em pixels.
2. ✅ Marcas incluem zero em séries que cruzam; séries constantes e vazias têm escala finita e extensão não nula.
3. ✅ Corpo: três séries e `E_mec = E_c + E_pg`, mesmo com mola. Sistema: três séries sem mola, quatro com mola; funções de energia recebem os estados, vínculos e polias do próprio registro.
4. ✅ Velocidade: componentes gravadas e magnitude por `Math.hypot`, com amostras em `i·TIMESTEP`.
5. ✅ Painel ausente inicialmente; botão na barra controla montagem, `aria-pressed` e `aria-controls`; select inicia em energy e canvas tem role img.
6. ✅ Largura CSS segue `size.width`, altura de 180 px; teste em Chromium arrasta a alça real e mede ambas as larguras antes/depois.
7. ✅ Nome acessível usa o id do corpo selecionado ou a tradução de sistema.
8. ✅ Oito chaves graph.* presentes nos dois catálogos; paridade verde.

##### Inspeção e verificação independente

- Ponto fixo: `8c7bfea249138c958f6e74516915d046f5d40463`. Foram lidos todos os hunks e commits, os consumidores de splitLabel, o transporte e os caminhos de repaint: seleção, idioma, resize, edição, passo, seek, replay e reset. Examinados também troca de cena, boot/rebuild com falha, limite da gravação, séries vazias/constantes, corpo ausente, estados iniciais nulos, aceleração gravada, molas e polias. As interações e opções disabled do PHY-73 continuam no ticket próprio.
- Conferidas as duas linhas **Proxy decided** deste ticket: (1) painel de 180 px fechado por padrão, estado React, select nativo, paleta, legenda, Canvas 2D, eixos/formatador, acessibilidade e ausência de cache; (2) três energias por corpo sem E_el, energia elástica apenas no sistema, sem alterar bodyEnergy, e teste de browser nos Primary files. Nenhuma decisão foi acrescentada ou alterada pela revisão.
- Gate completo independente: `npm test -- --maxWorkers=2`, seguido por lint, typecheck e build, todos com exit 0: **33 arquivos / 1085 testes passed**, sem skips. O limite de workers segue a mitigação do timeout registrada no stage 2 e não altera configuração. Vite compilou 52 módulos; permanece o aviso existente de chunk maior que 500 kB.
- Rebase sobre a sessão retornou up to date. `git diff --exit-code 9e07b70 HEAD` após o merge confirmou árvore idêntica; nenhuma mudança de produção ocorreu desde o gate.
- Reexecutadas as mutações temporárias abaixo na produção real em uma rodada: **7 failed / 149 skipped (156)**. Os dois arquivos foram restaurados byte a byte em finally; o foco restaurado passou com **7 passed / 149 skipped**, e `git diff --check` passou.

| Teste novo | Mutação de produção reexecutada | Saída vermelha independente |
| --- | --- | --- |
| maps time edges and decreasing y with two or three ticks | deslocar mapT por 1 px | expected 65 to be 64 |
| includes zero when crossing and handles constant or empty data | substituir ticksY por [1, 2] | expected [ 1, 2 ] to include +0 |
| separates body and system energy with spring=false | zerar valores das amostras | expected [0, 0, 0] to deeply equal [25, 60, 85] |
| separates body and system energy with spring=true | zerar valores das amostras | expected [0, 0, 0] to deeply equal [25, 60, 85] |
| reads recorded vectors, time, and system momentum | zerar valores das amostras | received values 0, 0, 0; expected 3, 4, 5 at t = 1/60 |
| toggles an accessible panel, defaults to energy and follows selection | forçar sistema no aria-label mesmo com corpo selecionado | expected 'gráfico de energia — sistema' to contain 'caixa' |
| resizes the recording graph with the scene canvas (PHY-72) | fixar largura CSS do gráfico em 500 | expected 500 to be 1161 |

- Limites de verificação: não houve passe visual manual nem perfil de desempenho. A geometria real e as regressões de layout/transportes foram verificadas pela suíte em Chromium. O histórico foi preservado, sem squash, e o fechamento muda somente este ticket e o ledger.
