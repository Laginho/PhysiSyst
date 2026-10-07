# PHY-81: Legenda do gráfico clicável
Stage: done
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

- 2026-10-04 Stage 2: branch `phy/PHY-81-clickable-graph-legend` criada sobre `sweatshop/2026-10-04-1243`; PHY-76 e PHY-78 estão `done` na sessão. Costuras aprovadas: renderer público, DOM do App e canvas real via `withBrowserSession`. Consumidores examinados: `repaintGraph`, `seekGraph` (usa somente o eixo t de `graphLayout([])`), `seriesFor` e chips de Foco. Entradas degeneradas: lista vazia, todas escondidas, nome desconhecido, tipos sem corpo selecionado, energia do sistema com mola e cursor histórico. `Focus.hidden` será lido do documento atual, nunca do frame histórico.
- Prova vermelha do renderer: `npm test -- src/render/graph.test.ts -t 'PHY-81'` — **4 failed, 7 skipped (11)**. `colorOf is not a function` e `visibleSeries is not a function`; nenhuma produção alterada. O teste de eixo vazio também fixa o [-1, 1] descrito no ticket: a implementação anterior usava [-0.05, 0.05], sem afetar a inversão do eixo t.

- Segunda fatia, DOM: `npm test -- src/App.test.ts -t 'PHY-81'` — **6 failed, 211 skipped (217)**, todos com `HTML graph legend: expected null not to be null`. Dois casos de localização, isolamento por tipo/autosave/restauração, reabertura de curvas salvas/composição com chips, preset sem cópia e cursor 5/0 sem undo/step/reset. Testes chamam a interface do App e a persistência real; o simulador é o falso já usado pelo harness. Produção do App ainda inalterada neste commit.
- Renderer restaurado após quatro mutações: cor de `E_pg` igual à de `E_c` → `expected '#2563eb' to be '#c2410c'`; filtro removido → lista com 3 em vez de 2 e escala [-10, 0, 210] em vez de [-0.5, 0, 10.5]; eixo vazio anterior → [-0.05, 0, 0.05] em vez de [-1, 0, 1]; legenda `fillText('E_pg')` recolocada → `expected true to be false`. Verde: **11 passed (11)** em `src/render/graph.test.ts`.

#### Evidência de mutação das costuras DOM/browser (Stage 2, 2026-10-04)

Todos os arquivos de produção foram restaurados em `finally` após cada lote. Comando DOM: `npm test -- src/App.test.ts -t '<nome do teste>'`.

| Novo teste | Mutação de produção | Saída vermelha observada |
| --- | --- | --- |
| `shows localized accessible energy curves ... in pt-BR` | `<sub>` substituído por `<span>` na legenda | `expected [ undefined, undefined, undefined ] to deeply equal [ 'c', 'pg', 'mec' ]` |
| `shows localized accessible energy curves ... in en` | Mesma remoção dos subscritos HTML | Mesma saída; lote: **2 failed, 215 skipped (217)** |
| `keeps hidden curves per kind, autosaves ...` | Removido `...focus?.hidden` ao alternar uma curva, apagando preferências de outros tipos | Ao voltar a energia: `expected 'true' to be 'false'`; **1 failed, 216 skipped (217)** |
| `opens stored hidden curves ...` | `const visible = true`, ignorando o Foco salvo | `expected 'true' to be 'false'` para `E_pg` na abertura; **1 failed, 216 skipped (217)** |
| `keeps preset hidden curves only ...` | `editFocus` passou a chamar `copyOpenPreset()` | `expected 'cena-2' to be 'preset:free-fall'`; **1 failed, 216 skipped (217)** |
| `PHY-81 toggles current graph visibility at record five and zero ...` | `toggleGraphCurve` retornava sem editar quando `cursor > 0` | No registro 5: `expected 'true' to be 'false'`; **1 failed, 216 skipped (217)** |
| `PHY-81 removes hidden curve pixels ...` | `repaintGraph` passou `undefined` ao filtro de curvas | Depois do clique: `expected 1976 to be +0`; **1 failed, 26 skipped (27)** |
| Mesmo teste Chromium, caminho histórico | Filtro passou a ler `displayedScene().focus` em vez de `docRef.current.focus` | Depois de confirmar slider 5: `expected 1971 to be +0`; **1 failed, 26 skipped (27)** |

- Teste browser também executado contra `src/App.tsx` do HEAD anterior à legenda HTML: **1 failed, 26 skipped (27)**, `Cannot read properties of undefined (reading 'click')`, pois não havia botão `E_pg`. O commit exclusivo de teste não inclui produção. No sandbox o Chromium desconectou; executado fora do sandbox, usando o harness existente, passou **1 passed, 26 skipped (27)** com pixels, tolerância ±5%, geometria e histórico reais. DOM sem mutações: **6 passed, 211 skipped (217)**.

#### Handoff Stage 2 (2026-10-04)

- Implementado: legenda HTML com lista acessível traduzida, botões `aria-pressed`, amostras por `colorOf` e subscritos via `splitLabel`. `editFocus` é o caminho compartilhado dos chips e das curvas: fora do undo e das edições físicas. `focus.hidden` é preservado por tipo e salvo pelo autosave existente nas cenas do usuário; presets mantêm apenas a edição em memória. Renderer recebe somente as visíveis para escala e traçado, usando o Foco atual também no histórico; canvas mantém eixos/cursor sem legenda.
- Separação de commits: `1f52225` testes vermelhos do renderer + `implementing`; `9155fbf` somente produção do renderer; `9f275e0` somente testes DOM/registro; `54dd2f1` somente teste Chromium/registro. O commit deste handoff contém App/i18n/registro, sem alterar testes.
- Mutação adicional do renderer: troca de `colorOf(s.name)` por cor conforme índice no array → `strokes only passed curves ...` falha, `E_mec` recebe `#c2410c` em vez de `#15803d`; **1 failed, 10 skipped (11)**. Arquivo restaurado.
- Verificação focada: `npm test -- src/render/graph.test.ts src/App.test.ts src/App.browser.test.ts` — **3 files passed, 255 tests passed (255)**.
- Gate completo, sequencial e em primeiro plano: `npm test && npm run lint && npm run typecheck && npm run build` — **33 files passed, 1287 tests passed (1287)**; ESLint e TypeScript sem erros; Vite concluiu o build (52 módulos). Aviso de chunk maior que 500 kB, incluindo o chunk separado do simulador/Rapier (2,136.71 kB); nenhuma falha do gate.
- Conferência final: diff limitado aos Primary files e ao ticket; nenhum arquivo de teste no commit de produção, segredo, log acidental ou artefato gerado incluído. `git diff --check` verde. `src/render/draw.ts` e `src/scene/types.ts` somente consumidos, sem alteração. `CONTEXT.md` já descreve curvas escondidas no Foco; nenhuma documentação de mecanismo ficou desatualizada. Todos os critérios cobertos, sem validação pendente nesta etapa. `Stage: to-review`; revisão/merge ficam para Stage 3, sem push nesta etapa.

#### Resolution (2026-10-04)

Verdict: Approve

Integração aprovada dos critérios 1–10 na sessão `sweatshop/2026-10-04-1243`, sem squash, pelo merge `1cacf9e`. Único ajuste da revisão: `159a2ec` reorganiza o histórico de comentários em ordem cronológica, conforme `docs/agents/issue-tracker.md`, preservando o contrato e a produção. Rebase sem alterações: a branch já estava atualizada sobre `5984894`.

**Standards**

Uma ocorrência documental: os comentários da Stage 2 estavam antes do histórico existente da Stage 1; o tracker exige acrescentar comentários ao final de `## Comments`. Corrigida em `159a2ec`; não exige teste nem reabertura. Nenhuma violação nos arquivos de produção/testes ou ocorrência da baseline de smells. Diff limitado aos Primary files e registros do fluxo. Commits de teste precedem as respectivas fatias de produção; nenhum commit de produção altera testes. Cada teste novo de DOM/browser tem mutação e saída vermelha registrada.

Examinados: `seriesFor`, `repaintGraph`, `seekGraph`, edição compartilhada do Foco, autosave/presets, histórico, seleção/fallback de tipo, séries vazias/todas escondidas, nomes desconhecidos, energia com mola e botões acessíveis traduzidos. Caminhos existentes de contexto canvas e avisos de storage preservados; nenhum consumidor alterado relevante ficou sem inspeção.

**Spec**

Zero ocorrências de requisito numerado ausente/parcial, escopo extra ou implementação incorreta. Os critérios 1–10 são atendidos. Revisão completa do diff de oito arquivos contra `5984894`, incluindo cores por identidade, filtro em ordem, escala das visíveis, eixos vazios, cursor, Foco corrente no histórico, seleção corpo/sistema, repaint, autosave/codec, reabertura de presets, boot/recording e edições físicas. O clique fica fora do undo e das operações do simulador.

A evidência vermelha cobre cada caso DOM, incluindo ambos os idiomas; no browser, os mutantes de filtro e Foco histórico falham em assertions de pixels, além da ausência inicial do botão. Nenhuma inconsistência ou costura sem contato com a produção encontrada. As variantes de energia do sistema com quatro curvas foram verificadas no renderer e por inspeção; não houve cenário Chromium dedicado a essa variante nem passe manual de todos os presets. Não há linhas `Proxy decided` neste ticket.

| Critério | Resultado |
| --- | --- |
| 1 | ✅ Cores por nome, distintas em cada tipo; quatro cores na energia com mola. |
| 2 | ✅ Filtro por nome preserva ordem e amostras; undefined, nomes desconhecidos e todas escondidas cobertos. |
| 3 | ✅ Escala somente das visíveis: [-0.5, 0, 10.5], contra [-10, 0, 210] com ambas. Todas escondidas: [-1, 0, 1]. |
| 4 | ✅ Traços usam `colorOf`; canvas sem legenda, mantendo eixos/cursor. |
| 5 | ✅ Lista traduzida, três botões de energia, subscritos HTML e amostras com a mesma cor do traço. |
| 6 | ✅ Preferências isoladas por tipo, alternância reversível e autosave real. |
| 7 | ✅ Cursor 5/0, slider e gravação preservados; sem undo/redo, step ou reset adicional. |
| 8 | ✅ Foco carregado do storage aparece na legenda e compõe com os chips. |
| 9 | ✅ Chromium real: pixels de E_pg somem, E_c fica em ±5%, legenda contida e borda direita ≤8 px; Foco corrente também no registro 5. |
| 10 | ✅ Tradução pt-BR/en e teste de paridade verdes. |

**Prova vermelha/verde reproduzida nesta revisão**

Todas as 12 mutações documentadas foram reaplicadas sequencialmente e restauradas byte a byte em `finally`. Cada execução terminou com falha de assertion esperada, não com erro de harness.

| Mutação reaplicada | Saída vermelha observada |
| --- | --- |
| E_pg com a cor de E_c | `expected '#2563eb' to be '#c2410c'`; 1 failed, 10 skipped (11). |
| Filtro de séries removido | Lista com 3 em vez de 2; escala [-10, 0, 210] em vez de [-0.5, 0, 10.5]; 2 failed, 9 skipped (11). |
| Margem vazia anterior | [-0.05, 0, 0.05] em vez de [-1, 0, 1]; 1 failed, 10 skipped (11). |
| Legenda E_pg recolocada no canvas | `expected true to be false`; 1 failed, 10 skipped (11). |
| Traços com cores por índice | Array de cores diferente: E_mec recebe a cor de E_pg; 1 failed, 10 skipped (11). |
| Subscritos substituídos por spans | Ambos os idiomas: [undefined, undefined, undefined] em vez de ['c', 'pg', 'mec']; 2 failed, 215 skipped (217). |
| Preferências de outros tipos apagadas | `expected 'true' to be 'false'` ao voltar à energia; 1 failed, 216 skipped (217). |
| Visibilidade ignora Foco salvo | `expected 'true' to be 'false'` na abertura; 1 failed, 216 skipped (217). |
| Edição de Foco copia preset | `expected 'cena-2' to be 'preset:free-fall'`; 1 failed, 216 skipped (217). |
| Alternância bloqueada no histórico | `expected 'true' to be 'false'` no registro 5; 1 failed, 216 skipped (217). |
| Canvas ignora hidden | `expected 1976 to be +0` pixels; 1 failed, 26 skipped (27). |
| Canvas lê Foco do registro histórico | `expected 1971 to be +0` pixels no registro 5; 1 failed, 26 skipped (27). |

Após restaurar a produção: `npm test -- src/render/graph.test.ts src/App.test.ts src/App.browser.test.ts -t PHY-81` — **3 files passed; 11 passed, 244 skipped (255)**.

**Gate e conferência final**

`npm test && npm run lint && npm run typecheck && npm run build` executado sequencialmente e lido até o fim: **33 files passed; 1287 tests passed (1287)**; ESLint e TypeScript sem erros; Vite construiu 52 módulos. A tentativa no sandbox falhou somente nos 29 casos Chromium por desconexão/DevTools; o gate integral fora do sandbox passou. Continua o aviso não bloqueante de chunk maior que 500 kB, incluindo simulador/Rapier separado (2,136.71 kB).

Arquivos revistos: `src/render/graph.ts`, `src/render/graph.test.ts`, `src/App.tsx`, `src/App.test.ts`, `src/App.browser.test.ts`, `src/i18n/pt-BR.ts`, `src/i18n/en.ts` e este ticket. Fechamento inclui o ledger. `CONTEXT.md` já descreve as curvas escondidas no Foco. Sem mutação residual, segredo, log acidental ou artefato gerado no diff. Nenhuma mudança de produção após o gate; rebase sem mudança de conteúdo e merge preservam exatamente a produção validada.

Padrões: 1 ocorrência documental corrigida, 0 pendentes; especificação: 0 ocorrências. `Stage: done`, ledger com `1cacf9e`, sem validação bloqueada. A sessão fica responsável pelo push/PR do lote.
