# PHY-76: Dock sob o canvas e tamanho dos controles
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: human
Difficulty: hard

- Primary files:
  - src/App.tsx (coluna do canvas :1690-1953: `canvasBoxRef` e `ResizeObserver` :903-918, alça de resize :1745-1788, barra de transporte :1834-1921, painel do gráfico :1922-1938, paleta :1939-1946, linha de dica da ferramenta :1947-1952; `fitCanvas` em :602, :914, :1773-1774)
  - src/App.test.ts
  - src/App.browser.test.ts
  - src/render/fitCanvas.ts (consumido; se a subtração do dock virar helper puro, ele mora aqui)
  - src/render/fitCanvas.test.ts
  - src/persistence/index.ts (`loadCanvasSize`/`saveCanvasSize` :11-27 como modelo; novos `loadControlsScale`/`saveControlsScale`, `CONTROLS_SCALE_KEY`)
  - src/persistence/persistence.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`controls.*`)

#### What to build

Hoje a barra de transporte, o painel do gráfico e a paleta são irmãos da caixa do canvas dentro da coluna, na largura da coluna, e nada escala os controles. Depois deste ticket existe um **dock** sob o canvas, na largura exata do canvas (`size.width`) e alinhado à borda esquerda dele, em todo layout (lado a lado e empilhado), com esta ordem: barra de controles, paleta (e a linha de dica da ferramenta), gráfico.

**Escala dos controles.** A barra e a paleta ficam dentro de um bloco com CSS `zoom: scale` e largura `(size.width − larguraDoSizer) / scale`, para a largura escalada continuar a do canvas. Ao lado desse bloco, fora dele, dois botões sempre visíveis `+` e `−` (`aria-label` `t('controls.bigger')` / `t('controls.smaller')`, `title` `t('controls.sizeTitle', { pct })`) mudam `scale` em passos de 0,1 dentro de [0,7, 1,6]; `+` fica `disabled` em 1,6 e `−` em 0,7. O valor persiste em localStorage pela chave `physics-sim:controlsScale` com `loadControlsScale(storage): number` (ausente, inválido ou não finito → 1; fora da faixa → limitado; arredondado ao passo de 0,1) e `saveControlsScale(storage, scale)`, no molde de `loadCanvasSize`/`saveCanvasSize`.

**Gráfico.** O painel do gráfico (PHY-72/73) fica no dock abaixo da paleta, fora do bloco escalado, com 180 px de altura e largura `size.width`; o botão `graph.toggle` continua na barra com `aria-pressed`/`aria-controls` e segue escondendo e mostrando o painel.

**Fit do canvas.** O canvas ocupa o que sobra da coluna depois do dock: o fit subtrai a altura do dock. Nunca dimensionar o canvas a partir de uma caixa que o envolve (shrink-wrap), porque isso realimenta o `ResizeObserver` e o canvas cresce alguns px por quadro. Duas formas válidas: manter o dock irmão da caixa medida (a caixa com `flex: 1` já recebe só o restante) ou medir a altura do dock e subtraí-la do `containerHeight` antes de `fitCanvas`, como `fitWithDock` faz no protótipo. Mudar a escala muda a altura do dock e o canvas refaz o fit no mesmo quadro; o canvas não pode oscilar.

**Protótipo.** Validado na branch descartável `proto/ui-scale`, variante D, commit `9080046` (`?variant=D`): tem `fitWithDock` e `ControlsSizer`. É leitura de referência; **essa branch nunca é mesclada** e `src/ProtoSwitcher.tsx` não entra.

#### Acceptance criteria

1. `loadControlsScale` devolve 1 com a chave ausente, `''`, `'abc'` ou `'NaN'`; devolve 1,3 para `'1.3'`; limita `'2'` a 1,6 e `'0.5'` a 0,7; arredonda `'1.26'` a 1,3. `saveControlsScale(storage, 1.2)` seguido de `loadControlsScale` devolve 1,2.
2. No `App`, os botões `t('controls.bigger')` e `t('controls.smaller')` existem, não são descendentes do elemento com `style.zoom`, e o bloco escalado contém a barra de transporte e a paleta mas não o painel do gráfico. Ao montar com `'1.3'` salvo, `style.zoom` do bloco é `1.3`.
3. Clicar em `+` leva `style.zoom` de 1 a 1,1 e grava `'1.1'` em `physics-sim:controlsScale`; seis cliques em `+` a partir de 1 param em 1,6 com `+` `disabled`; três em `−` a partir de 1 param em 0,7 com `−` `disabled`.
4. Ordem no DOM dentro do dock: barra de transporte, paleta, painel do gráfico (quando aberto); o dock tem `style.width` igual a `size.width` px tanto lado a lado (contêiner 1200×800) quanto empilhado (contêiner 700×900, abaixo de `CANVAS_MIN_WIDTH + INSPECTOR_WIDTH + ROW_GAP`).
5. O canvas do gráfico tem `style.height` 180 px e `style.width` `size.width` px com a escala em 1 e em 1,6.
6. Browser (Chromium, `withBrowserSession`), janelas 1920 e 1280, escala 1 e 1,6: `dock.left` = `canvas.left` e `dock.width` = `canvas.width` (±1 px); `canvas.bottom + dock.height ≤ coluna.bottom` e `document.documentElement.scrollHeight ≤ window.innerHeight` (sem rolagem vertical lado a lado).
7. Browser, janela 700 (empilhado), escala 1,6: `dock.left` = `canvas.left` e `dock.width` = `canvas.width` (±1 px).
8. Browser, escala 1,6: a altura da barra de transporte é 1,6× a medida em escala 1 (±10 %); a altura dos botões `+`/`−` e a altura do canvas do gráfico (180 px) não mudam.
9. Browser, depois de ir a 1,6 e esperar três `requestAnimationFrame`: três medições consecutivas do retângulo do canvas são iguais (sem crescimento quadro a quadro) e `canvas.height ≤ caixa.height`.
10. Arrastar a alça ◢ (PHY-63) para um canvas mais estreito leva `dock.width` à nova largura do canvas no mesmo frame (DOM ou browser).
11. `controls.bigger`, `controls.smaller` e `controls.sizeTitle` em pt-BR e en; paridade verde. Os testes de layout existentes (PHY-15/18/63) continuam verdes.

#### Verification

    npm test -- src/persistence/persistence.test.ts src/App.test.ts src/App.browser.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/persistence/persistence.test.ts`: critério 1 chamando `loadControlsScale`/`saveControlsScale` direto; vermelho hoje porque não existem.
- `src/App.test.ts`: critérios 2 a 5 e 10 com o `FakeResizeObserver` e o `containerSize` que o arquivo já usa; vermelhos hoje (não há botões, bloco escalado nem dock na largura do canvas). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.
- `src/App.browser.test.ts`: critérios 6 a 9 com `withBrowserSession` e geometria real; vermelhos hoje. Mesma regra de evidência. Para o 9, a mutação natural é dimensionar o canvas pela caixa que envolve o dock e observar o crescimento.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: dock sob o canvas na largura dele em todo layout, ordem barra → paleta → gráfico; `+`/`−` sempre visíveis, 70–160 % em passos de 10 %, persistido como `loadCanvasSize`/`saveCanvasSize`; CSS `zoom`, botões fora do bloco; gráfico 180 px sem escala com toggle; o fit subtrai o dock e nunca mede uma caixa que envolve o canvas; validado em `proto/ui-scale` variante D (`9080046`, `?variant=D`), que nunca é mesclada.
- Planner: `Review: human` porque o layout foi aceito a olho no protótipo; a largura interna do bloco escalado é `(size.width − sizer) / scale` para a largura escalada bater com a do canvas.
- 2026-10-04 Stage 2: costuras aprovadas no ticket: persistência pública, DOM do App com `FakeResizeObserver`, geometria real com `withBrowserSession`. Consumidores examinados: os três caminhos de `fitCanvas` (montagem, observer e alça), transformação/pintura do canvas, repaint/seek do gráfico, empilhamento com histerese e controles de reprodução/paleta. Entradas de borda: storage indisponível/não finito, limites 0,7/1,6, canvas preferido de 402 px, abertura do gráfico e quebra de linha dos controles. O dock continuará irmão da caixa medida; não haverá nova caixa envolvendo ambos. O commit de protótipo `9080046` não está disponível neste clone; o contrato escrito especifica a implementação.

#### Stage 2 — evidência DOM (2026-10-04)

- Red: `0d167a7`, nove casos novos falharam no App sem dock/zoom/sizer. Green: nove casos passaram após a implementação. Comandos: `npm test -- src/App.test.ts -t 'canvas dock and controls scale'`.
- Mutação real em `src/App.tsx`, depois de green: fixar `zoom: 1`, mudar a largura do dock para `size.width + 3` e trocar os dois títulos traduzidos por `"controls.sizeTitle"`. Resultado: **9 failed, 157 skipped (166)**; mutações removidas.

| Novo teste (nome abreviado) | Mutação que o matou | Saída vermelha |
|---|---|---|
| hydrates the saved scale… | `zoom: 1` | expected `'1'` to be `'1.3'` |
| increments in tenths… | `zoom: 1` | expected `'1'` to be `'1.1'` |
| stops bigger at its bound… | `zoom: 1` | expected `'1'` to be `'1.6'` |
| stops smaller at its bound… | `zoom: 1` | expected `'1'` to be `'0.7'` |
| orders… at 1200x800 | dock `width: size.width + 3` | expected `'1203px'` to be `'1200px'` |
| orders… at 700x900 | dock `width: size.width + 3` | expected `'702px'` to be `'699px'` |
| keeps the graph… | `zoom: 1` | expected `'1'` to be `'1.6'` |
| updates dock width… | dock `width: size.width + 3` | expected `'1023px'` to be `'1020px'` |
| translates both sizer labels… | títulos literais sem tradução | expected `'controls.sizeTitle'` to be `'Tamanho dos controles: 100%'` |

- Rodada ampliada de App/persistência/i18n: 245 passed e dois testes PHY-44 desconectados pelo sandbox. Reexecução dos mesmos dois testes com permissão para o Chromium: **2 passed, 164 skipped (166)**. As próximas verificações com browser rodam com essa permissão.

- 2026-10-04 Correção do harness do teste de 402 px (commit exclusivo de testes): o seletor inicial media `button, label, input`, mas não o `span` da leitura de velocidade. Um slider inflexível de 129 px deixava esse span vazar e sobrevivia. O teste agora confirma zoom 1,6 e mede todos os descendentes. A mesma mutação na produção (`style={{ width: 129, flexShrink: 0 }}` no slider de velocidade) produz **1 failed, 23 skipped (24)**: `expected 44.609375 to be less than or equal to 1`. Mutação removida; o contrato não mudou.

#### Stage 2 — evidência Chromium (2026-10-04)

- Red em `410a2c4`: quatro casos lado a lado com `scrollHeight` 1096 > 1080; altura da barra com razão 3,720788 > 1,76; canvas de 696 px em caixa de 694,640625 px. O caso empilhado foi morto pelo deslocamento de 12 px do dock. Red adicional em `df3ecb7`: razão 2,545673 > 1,76 em 1280 px e overflow de 49,40625 px no canvas mínimo.
- Ajustes de produção: `main` limitado ao viewport descontando as margens padrão do body; 3 px reservados na caixa para bordas e arredondamento do fit; sliders de velocidade/tempo em linhas próprias, com largura flexível. O dock permanece irmão da caixa que recebe só a altura restante da coluna, de modo que o próprio flex desconta sua altura antes de `fitCanvas`.
- Green: **9 passed, 15 skipped (24)** no grupo `canvas dock geometry`. Mutação conjunta de alinhamento, altura e shrink-wrap: **8 failed, 1 passed, 15 skipped (24)**. O caso de 402 px foi morto separadamente pelo slider inflexível; tabela por teste abaixo. Todas as mutações foram removidas.

| Novo teste (nome abreviado) | Mutação na produção | Saída vermelha |
|---|---|---|
| aligns… 1920 px, escala 1 | dock `transform: translateX(12px)` | expected 12 to be ≤ 1 |
| aligns… 1920 px, escala 1,6 | mesma | expected 12 to be ≤ 1 |
| aligns… 1280 px, escala 1 | mesma | expected 12 to be ≤ 1 |
| aligns… 1280 px, escala 1,6 | mesma | expected 12 to be ≤ 1 |
| aligns… 700 px, escala 1,6 | mesma | expected 12 to be ≤ 1 |
| scales transport height… 1920 px | barra `minHeight: 150 / controlsScale`, fixando sua altura física | expected 1 to be ≥ 1,44 |
| scales transport height… 1280 px | mesma | expected 1 to be ≥ 1,44 |
| refits… within three frames | caixa medida com `flex: controlsScale === 1.6 ? '0 0 auto' : 1`, shrink-wrap do canvas | expected 636 to be less than 630; o canvas cresceu em vez de refazer o fit |
| keeps the sizer… 402 px | slider de velocidade `width: 129, flexShrink: 0` | expected 44.609375 to be ≤ 1 |

- Verificação focada final: `npm test -- src/persistence/persistence.test.ts src/App.test.ts src/App.browser.test.ts` — **3 files passed, 241 tests passed**. Inclui os testes existentes de layout, seleção, alça, gráfico e edição numérica no Chromium, além dos novos casos.

#### Stage 2 — entrega (2026-10-04)

- Implementados os critérios 1–11: persistência normalizada de 70–160%, dock na largura lógica do canvas com as mesmas bordas laterais, ordem transporte → paleta/dica → gráfico, botões de tamanho fora do zoom e gráfico de 180 px sem escala. A alça atualiza a largura do dock no mesmo render. O fit usa a caixa independente que recebe a altura restante depois do dock.
- **21 casos novos** (3 persistência, 9 DOM, 9 Chromium), com testes em commits separados da produção. Mutações reais e saídas vermelhas por caso de DOM/Chromium registradas acima; o harness corrigido também tem commit próprio e prova vermelha.
- Gate oficial `npm test && npm run lint && npm run typecheck && npm run build`: **33 arquivos, 1.140 testes passaram; lint, typecheck e build concluíram com exit 0**. O build manteve o aviso de chunk >500 kB no módulo `sim`; nenhum arquivo gerado entrou no diff.
- Diff final limitado aos Primary files e ao ticket; `git diff --check` verde. Branch `phy/PHY-76-controls-dock`, criada da sessão `sweatshop/2026-10-04-1243`. Pronto para stage 3; `Review: human` preservado.
