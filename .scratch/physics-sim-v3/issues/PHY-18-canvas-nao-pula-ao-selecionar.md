# PHY-18: Selecionar um corpo não pode mover o canvas debaixo do cursor
Stage: to-implement
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/App.tsx` (a linha `display: flex` que põe coluna do canvas e coluna do inspetor lado a lado, ~1100, o wrapper do canvas, ~1107, e a coluna direita `alignSelf: 'flex-start'`, ~1245 — a altura dela é o que empurra a linha). Fora do escopo: `src/render/fitCanvas.ts`, que é Primary file do PHY-20
  - `src/App.test.ts`

#### What to build

O primeiro arraste de um corpo ainda não selecionado larga o corpo onde o cursor
soltou, e não ~2 m acima.

Hoje não larga. Pressionar um corpo o seleciona, o inspetor da coluna da direita
aparece, a página cresce (784 → 954 px medidos no site publicado), e a linha que
contém as duas colunas cresce junto. O canvas é centrado verticalmente dentro
dessa linha (`alignItems: 'center'`), então ele desce ~85 px **no meio do
arraste**: o `pointerdown` mediu o mundo em um enquadramento e os `pointermove`
seguintes medem em outro. O corpo segue o cursor com um deslocamento constante
igual ao salto do layout.

Medido no site publicado (PHY-17, passe manual D2), canvas 653×436, ppm 43.53:

| arraste | alvo | resultado |
|---|---|---|
| corpo **não** selecionado | (5, 6) | (4.99, **7.98**) — erro de +1.98 m em y |
| corpo **não** selecionado | (3, 4) | (3.00, **5.22**) |
| corpo **já** selecionado | (8.5, 3) | (8.52, 3.01) — exato |

x nunca erra; só y, e exatamente pelo salto do layout. A mesma causa faz a cena
inteira pular na tela toda vez que a seleção troca entre corpos de inspetores com
alturas diferentes (retângulo ↔ cunha), o que por si só já é desagradável.

A correção é de layout, não de aritmética de arraste: a altura da linha não pode
depender do conteúdo da coluna do inspetor. Reservar a altura, ancorar o canvas
no topo em vez de centrá-lo, ou dar à coluna direita altura própria com scroll —
o que for menor. Não compensar o salto no handler de arraste: isso conserta o
arraste e deixa a cena pulando.

#### Acceptance criteria

1. ✅ (2026-09-13, medido em navegador na 2ª revisão) Selecionar um corpo não muda a posição nem o tamanho do retângulo do canvas: `getBoundingClientRect()` do canvas é igual antes e depois da seleção, com o inspetor renderizado
2. ✅ (2026-09-13, medido em navegador na 2ª revisão) Trocar a seleção entre corpos de shapes diferentes (retângulo ↔ cunha ↔ bola, inspetores de alturas diferentes) também não move o canvas
3. ✅ (2026-09-13, medido em navegador na 2ª revisão) Um arraste que começa em um corpo **não selecionado** larga o corpo na mesma posição de mundo que o mesmo arraste em um corpo **já selecionado** — a seleção deixa de ser um estado que muda o resultado do arraste
4. A cena inteira continua visível e o canvas continua 3:2 depois da mudança de layout (não regredir o PHY-15)
5. ❌ (2026-09-13, ver 2ª revisão) Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/App.test.ts src/render/fitCanvas.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, no espelho do layout: com um corpo selecionado e sem, a geometria do canvas é a mesma (critérios 1 e 2). Vermelho porque hoje a altura da linha depende do inspetor.
- `src/App.test.ts`, no seam de arraste: o mesmo arraste (mesmos pontos de tela) sobre um corpo selecionado e sobre um não selecionado termina na mesma posição de mundo (critério 3). Vermelho porque hoje o segundo caso erra por uma constante.

## Comments

Aberto pelo passe manual desktop do PHY-17 (D2), no site publicado.

Implementação nesta sessão GPT-6 autorizada pelo usuário como exceção ao binding Sonnet.
Red inicial: `npx vitest run src/App.test.ts -t PHY-18`: 2 failed, 28 skipped.
Geometria: top 85 recebido, 0 esperado. Arraste: (8, 7.416666666666666)
sem seleção prévia versus (8, 6) com seleção prévia. O espelho de layout do
jsdom lê `alignItems` do wrapper real; eventos usam os handlers reais do App.

#### Stage 2 — implementação (2026-09-13)

- Commit red: `f51f8aa` (somente testes e metadados deste ticket).
- `src/App.tsx`: wrapper do canvas ancorado com `alignItems: 'flex-start'`.
- Mutação aplicada após o verde: restaurar `alignItems: 'center'` no wrapper
  real de produção e executar `npx vitest run src/App.test.ts -t PHY-18`.

| Teste novo em `src/App.test.ts` | Saída vermelha com a mutação |
|---|---|
| keeps the same 3:2 rectangle through rectangle, triangle, circle and empty selection | `top: 85` / `bottom: 685`, esperados `top: 0` / `bottom: 600` |
| drops at the same world position with and without selection before pointerdown | recebido `{ x: 8, y: 7.416666666666666 }`, esperado `{ x: 8, y: 6 }` |

Resultado da mutação: **2 failed, 28 skipped**. Mutação removida antes do gate.
Verificação focada: **2 arquivos, 36 testes passaram**.
Gate: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0;
**27 arquivos, 461 testes passaram**, lint e tipos sem erros, build concluído.
Vite emitiu aviso de bundle acima de 500 kB.

Limite da verificação: geometria exercitada pelo espelho de layout aprovado no
ticket, pois jsdom não calcula flex layout; não houve passe em navegador real
nesta etapa. O espelho lê o estilo do DOM de produção a cada medição e os testes
de PHY-15/fitCanvas continuam verdes. Pronto para a etapa 3.

#### Stage 3 — revisão (2026-09-13): reaberto

Decisão: **reabrir**. A âncora `alignItems: 'flex-start'` está certa e fica, mas
resolve só metade do problema: ela impede o canvas de ser **recentrado**, não
impede a linha de **crescer**. A altura da linha continua sendo a do conteúdo da
coluna do inspetor — o princípio que o próprio ticket enuncia ("a altura da linha
não pode depender do conteúdo da coluna do inspetor") continua violado.

Consequência: onde o canvas é limitado pela **altura** (`containerHeight * 1.5 <
containerWidth` em `fitCanvas`), selecionar um corpo faz a caixa crescer, o
`ResizeObserver` (`src/App.tsx:568`) redispara e o canvas **muda de tamanho**. O
ppm muda no meio do arraste, então agora **x também erra**, não só y.

Medido no navegador (Chromium, dev server, cena demo). A pane não estava
desenhando, então o `ResizeObserver` real não entregava; os números abaixo são a
geometria da caixa lida por `getBoundingClientRect()` (layout síncrono, confiável
mesmo sem paint) com `fitCanvas()` aplicado em cima — não a leitura do
`canvas.style`:

| viewport | caixa antes | canvas antes | caixa depois de selecionar | canvas depois |
|---|---|---|---|---|
| 1920×1080 | 1546×960 | **1440×960** (limitado pela altura) | 1546×1264 (`caixa`) | **1545×1030** |
| 2560×700 | 2186×888 | **1332×888** (limitado pela altura) | 2186×1264 (`bola`) | **1896×1264** |
| 1600×900 | 1226×888 | 1226×817 (limitado pela largura) | 1226×1264 | 1226×817 — ok |

Uma janela 1920×1080 maximizada, a resolução de desktop mais comum, cai no caso
quebrado. A medição manual do PHY-17 (D2) pegou só o caso limitado pela largura,
que é onde a correção funciona.

O que falta:

1. Critérios 1, 2 e 3 em viewport limitada pela altura. O caminho é um dos outros
   dois que o ticket já lista: dar à coluna direita altura própria com scroll, ou
   reservar a altura — algo que faça a altura da linha parar de depender do
   inspetor. `fitCanvas.ts` não deve ser tocado aqui (PHY-20 é dono dele).
2. Um teste que **enxergue tamanho**, não só posição. Os dois testes novos são
   cegos para este bug por construção: `mirrorLayout` devolve
   `parseFloat(canvas.style.width)` como largura, e `FakeResizeObserver`
   (`src/App.test.ts:50`) dispara uma vez só, no `observe()`, com um
   `containerSize` fixo. Nenhuma mudança de altura da caixa chega ao `fitCanvas`
   nos testes. O seam é fazer o fake reentregar quando a altura espelhada muda.
3. Critério 5 fica ⚠ parcial pelo mesmo motivo: a mutação aplicada
   (`flex-start` → `center`) é exatamente a única string de produção que o
   espelho lê, então o vermelho prova que o espelho lê `alignItems`, não que o
   canvas fica parado. `extraHeight` (170/230/130) é inventado pelo teste e nunca
   lido do inspetor renderizado.

Menores, para a mesma passada (não bloqueiam sozinhos):

- `const origin = preselected && … ? 85 : 0` — o nome não diz o que guarda e `85`
  é `170 / 2` repetido à mão duas linhas abaixo do 170.
- `[...host.querySelectorAll('fieldset')].find(f => f.querySelector('legend')…)`
  aparece três vezes neste bloco e já existia em quatro outros pontos do arquivo
  (`currentPosition`, `contactPairs`, PHY-15). Cabe um `panelFor(host, id)`.

Não regrediu: PHY-15 e `fitCanvas` continuam verdes; a cena segue 3:2 e visível
(critério 4 ✅). Gate na revisão: `npm test && npm run lint && npm run typecheck
&& npm run build`, exit 0 — **27 arquivos, 461 testes**, lint e tipos limpos,
build ok (aviso de bundle > 500 kB, pré-existente). Critério 6 ✅.

A correção continua na branch `phy/PHY-18-canvas-estavel`; o commit `81aa8fe`
fica como está.

#### Stage 2 — retomada (2026-09-13)

Usuário autorizou novamente a implementação com o modelo desta sessão.
O espelho agora mede controles presentes no DOM do inspetor e reentrega a
geometria ao ResizeObserver real do App depois da seleção. Sem alturas por shape.
Red antes da correção: `npx vitest run src/App.test.ts -t PHY-18`:
**2 failed, 2 passed, 28 skipped**. Na caixa 1600×600, selecionar alterou
900×600 para 1332×888; arraste sem seleção terminou em
(7.351351351351351, 6.972972972972974), contra (~8, 6) com seleção.

#### Stage 2 — correção da reabertura (2026-09-13)

Pendências dos critérios 1, 2, 3 e 5 implementadas; marcas da revisão acima
preservadas como histórico para a próxima etapa 3.

- Red: `9609ed8`, somente testes e ticket. Commit de produção não altera testes.
- Linha com `contain: size` recebe o espaço do viewport sem crescer pelo tamanho
  intrínseco das colunas/canvas. Inspetor com contenção, largura de 270 px,
  stretch e rolagem própria; canvas permanece ancorado no topo.
- Nenhuma alteração em `fitCanvas.ts` ou na aritmética dos handlers de arraste.
- FakeResizeObserver reentrega mudanças após pointerdown; o espelho conta os
  controles realmente renderizados, em vez de atribuir alturas por shape.

Mutate-verify em `src/App.tsx`, comando `npx vitest run src/App.test.ts -t PHY-18`:

| Teste / largura da caixa | Mutação | Saída vermelha |
|---|---|---|
| geometria / 1600 | contenção do inspetor `size` → `none` | 1332×888, esperado 900×600; left 134, esperado 350 |
| arraste / 1600 | contenção do inspetor `size` → `none` | (7.351351351351351, 6.972972972972974), esperado (~8, 6) |
| geometria / 900 | contenções `size` → `none` e âncora `flex-start` → `center` | top 144, esperado 0 |
| arraste / 900 | contenções `size` → `none` e âncora `flex-start` → `center` | (8, 8.4), esperado (8, 6) |

Primeira mutação: **2 failed, 2 passed, 28 skipped**. Segunda: **4 failed,
28 skipped**, incluindo novamente as duas falhas em 1600. Mutações removidas.

Validação adicional no Chromium real, DOM/getBoundingClientRect:

- 1920×1080: caixa 1611×960 e canvas 1442×962 (inclui borda de 1 px),
  dimensões estáveis com inspetores de retângulo, cunha e bola renderizados.
  Medição feita antes do ajuste final da largura do inspetor de 250 para 270 px.
- 2560×700, largura final do inspetor: caixa 2231×580, canvas 872×582
  (conteúdo 870×580, 3:2), retângulo `{left:695.5, top:48, width:872,
  height:582}` idêntico sem seleção e após clique direto na bola.
  Inspetor `clientWidth === scrollWidth === 255`: sem rolagem horizontal.
- Screenshot confirmou cena inteira visível e rolagem vertical do inspetor.
  A contenção da linha foi necessária também para eliminar realimentação do
  tamanho intrínseco do canvas, observada no navegador durante a implementação.

Limite: o arraste comparativo usa handlers reais sob jsdom; o passe no navegador
confere layout e seleção, não repete esse arraste. O espelho continua uma
aproximação de layout, complementada pelas medições reais acima.

Verificação focada: **2 arquivos, 38 testes passaram**. Gate completo exit 0:
**27 arquivos, 463 testes passaram**, lint, typecheck e build verdes.
Aviso de bundle >500 kB permanece pré-existente. Pronto para etapa 3.

#### Stage 3 — revisão (2026-09-13): reaberto (2ª vez)

Decisão: **reabrir**, e só pelo critério 5. A correção de produção está certa e
esta revisão a verificou em navegador real; o que não se sustenta é o valor de
prova dos testes.

Medições desta revisão (Chromium, dev server, viewport 1920×1080 — exatamente o
caso limitado pela altura que a revisão anterior mostrou quebrado), retângulo do
canvas por `getBoundingClientRect()`:

| ação | retângulo do canvas |
|---|---|
| sem seleção | `{left: 90.5, top: 64, width: 1442, height: 962}` |
| selecionar `caixa` | idêntico |
| selecionar `bola` | idêntico |
| desselecionar | idêntico |

`document.body.scrollHeight` ficou 1080 (= viewport) em todas elas, e o inspetor
rola sozinho (`clientHeight` 1016 contra `scrollHeight` 1358 com a bola
selecionada) em vez de crescer a linha. Arraste de `caixa` **sem seleção
prévia**, de (9, 3) para (8, 6): leitura final **(8.00, 6.00) m**, exato.
Em 1280×360 a linha recebe 296 px e não colapsa.

Critérios 1, 2, 3 e 4 ✅. Critério 6 ✅: gate desta revisão exit 0, **27 arquivos,
463 testes**, lint, typecheck e build limpos (aviso de bundle > 500 kB,
pré-existente).

Critério 5 ❌, por duas verificações feitas aqui:

1. **O `contain: 'size'` da linha (`src/App.tsx:1102`) não tem teste nenhum.**
   Removê-lo e rodar `npx vitest run src/App.test.ts -t PHY-18` dá **4 passed**.
   A tabela da etapa 2 conta "contenções `size` → `none`" como uma mutação só;
   as duas declarações são independentes e só a do inspetor é vista pelos testes.
   Ou um teste enxerga essa linha, ou ela sai — a etapa 2 afirma que ela era
   necessária no navegador, então o caminho é provar isso.
2. **O oráculo do espelho continua sendo a própria string da correção.**
   `flush()` decide se a caixa cresce lendo
   `getComputedStyle(inspector).contain.split(' ').includes('size')`
   (`src/App.test.ts:661`). Troquei `contain: 'size'` por `contain: 'strict'` —
   superconjunto que contém `size` e corrige o bug igual ou melhor no navegador —
   e os testes ficaram **2 failed, 2 passed**. Os outros dois remédios que o
   próprio ticket lista ("reservar a altura, ou dar à coluna direita altura
   própria com scroll") também ficariam vermelhos. O teste afirma uma palavra-chave
   de CSS, não geometria parada: é a circularidade da revisão anterior, movida de
   `alignItems` para `contain`. Caminho: o espelho decidir a contribuição do
   inspetor por uma regra (contenção de tamanho **ou** altura definida com rolagem
   própria), não por uma string literal.

O encanamento novo fica: `FakeResizeObserver.deliver` + `flush` resolvem o resto
do item 2 da revisão anterior — em 1600 a mudança de caixa chega ao `fitCanvas` e
o teste enxerga **tamanho**, não só posição.

Menores, para a mesma passada (não bloqueiam sozinhos):

- `width: 270, flexShrink: 0` (`src/App.tsx:1251`) é política de largura, e o
  contrato deste ticket é altura. Medido em 900×700: coluna do canvas com 571 px,
  contra os 526 px que o PHY-20 mediu antes — não piorou, melhorou. Ainda assim
  quem cede primeiro na horizontal é decisão do PHY-20; manter aqui só com um
  critério que justifique.
- `controlHeight()` (`src/App.test.ts:656`) devolve `length * 24`: o nome diz
  altura, o valor é contagem de controles.
- `canvas.parentElement.parentElement.nextElementSibling` (`src/App.test.ts:653`)
  prende o espelho ao aninhamento exato do `App`; um wrapper a mais faz o espelho
  medir o elemento errado calado, em vez de falhar.
- `makeTransform({ centerX: 6, centerY: 4, … })` repetido em `:676` e `:713`, com
  `TRANSFORM` já definido em `:142`.
- `panelFor(host, id)` continua pendente da revisão anterior.
- Vocabulário: o código novo diz *inspector*, o resto do arquivo diz *painel*.

Não regrediu: PHY-15 e `fitCanvas` verdes. O trabalho continua na branch
`phy/PHY-18-canvas-estavel`; os commits existentes ficam como estão.
