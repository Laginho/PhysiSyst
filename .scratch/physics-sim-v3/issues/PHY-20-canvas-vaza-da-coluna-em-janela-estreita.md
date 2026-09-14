# PHY-20: Canvas vaza da própria coluna e fica atrás do inspetor em janela estreita
Stage: to-merge
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/render/fitCanvas.ts` (o piso `CANVAS_MIN_WIDTH = 600`, linha 2, aplicado sem olhar quanto a coluna realmente tem disponível)
  - `src/App.tsx` (a linha de duas colunas, ~1100; a coluna do canvas `canvasBoxRef` com `flex: 1, minWidth: 0`, ~1101–1107, dentro de um pai com `overflow: 'visible'`)
  - `src/App.test.ts`
  - `src/render/fitCanvas.test.ts`

#### What to build

Reduzir a janela para uma largura intermediária faz o canvas ficar maior que a
própria coluna que o contém, e como o pai tem `overflow: 'visible'`, o excesso
não aparece como scroll — ele vaza para a esquerda da tela e para debaixo da
coluna do inspetor à direita.

Medido no site publicado (PHY-17, passe manual D6), Chromium, `resize_window`
para larguras de viewport diferentes, canvas e coluna lidos por
`getBoundingClientRect()`:

| viewport | coluna do canvas (px) | canvas (px) | resultado |
|---|---|---|---|
| 1800×1000 | 1453 | 1427×952 (3:2) | ok, cabe |
| 1000×700 | 626 | 629×420 | ok (sobra ~1.5 px por arredondamento de múltiplo de 3, cosmético) |
| 950×700 | 576 | 602×402 | canvas 26 px mais largo que a coluna; ainda dentro da viewport (x=3) mas já sobrepõe o inspetor |
| 900×700 | 526 | 602×402, **x = −22** | canvas começa 22 px à esquerda da viewport (parte cortada) e termina sobre a coluna do inspetor |

`fitCanvas()` está correto isoladamente — `Math.max(CANVAS_MIN_WIDTH, ...)` é
intencional e testado (`fitCanvas.test.ts`, piso de 600×400). O bug é de
integração: o `ResizeObserver` (`App.tsx:570-573`) mede o `contentRect` da
coluna do canvas e alimenta esse número em `fitCanvas`, mas ninguém garante que
a coluna tenha pelo menos 600 px quando a janela toda encolhe — a coluna do
inspetor ao lado não cede espaço, e a coluna do canvas (`minWidth: 0`) pode
medir bem menos que 600. `fitCanvas` aplica o piso mesmo assim, o canvas nasce
maior que o pai, e o pai deixa vazar (`overflow: 'visible'`, necessário para
handles de arraste que passam da borda em uso normal).

Fora do escopo do PHY-15 (canvas cabe no container quando o container é grande
o bastante) e do PHY-17 (que só observa, não conserta): o piso de 600 px existe
para a simulação continuar legível, mas layout precisa decidir o que cede
primeiro — colapsar o inspetor, empilhar as colunas abaixo de uma largura de
corte, ou dar scroll horizontal à página — não deixar o canvas desenhar por
cima de outro elemento.

#### Acceptance criteria

1. Abaixo da largura de janela onde a coluna do canvas mediria menos que
   `CANVAS_MIN_WIDTH`, o layout muda (empilhar colunas, colapsar/scrollar o
   inspetor, ou dar scroll horizontal à página) antes que o canvas ultrapasse
   sua coluna — nunca o inverso
2. Em nenhuma largura de janela o canvas se sobrepõe a outro elemento
   interativo (inspetor, botões de cena): `getBoundingClientRect()` do canvas
   e da coluna do inspetor nunca se intersectam
3. Em nenhuma largura de janela o canvas fica parcialmente fora do viewport
   (`rect.left >= 0` e `rect.right <= window.innerWidth`)
4. O canvas continua 3:2 e a cena inteira visível nas larguras onde já
   funcionava (não regredir PHY-15/PHY-18)
5. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/App.test.ts src/render/fitCanvas.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, com o `FakeResizeObserver` já usado no arquivo: container
  raso o bastante para pedir o piso de 600 px produz um layout onde canvas e
  coluna do inspetor não se sobrepõem e o canvas não passa da viewport
  (critérios 1–3). Vermelho porque hoje o canvas nasce maior que o pai e vaza.
- `src/render/fitCanvas.test.ts` permanece como está — a função pura já faz o
  que deveria fazer; o teste novo é de integração de layout, não de aritmética.

## Comments

Aberto pelo passe manual desktop do PHY-17 (D6), no site publicado. Números
medidos com `resize_window` em três larguras (900/950/1000 px) e
`getBoundingClientRect()` do canvas e do seu pai, via `javascript_tool` — não é
a mesma classe de medida inválida que travou a sessão anterior (aquela tinha 0
tick de `requestAnimationFrame`; esta teve 60/61 ticks por segundo,
confirmados antes de cada leitura).

Revisão do PHY-18 (2026-09-13): o PHY-18 foi reaberto e a correção dele vai mexer
na mesma linha de duas colunas (`src/App.tsx`, ~1100–1245) para tirar a altura da
linha das mãos do inspetor. `fitCanvas.ts` ficou explicitamente fora do escopo do
PHY-18 para não colidir com este ticket. Fazer o PHY-18 primeiro evita retrabalho.

### Stage 2 (2026-09-14)

`fitCanvas.ts` não mudou — a integração é toda em `src/App.tsx`: abaixo de
`CANVAS_MIN_WIDTH` a linha de duas colunas passa a `flexDirection: 'column'`
(inspetor cede e desce) em vez de deixar o piso da `fitCanvas` desenhar o
canvas maior que a coluna. A decisão de empilhar usa histerese (empilha
abaixo de `CANVAS_MIN_WIDTH`; só desempilha acima de
`CANVAS_MIN_WIDTH + INSPECTOR_WIDTH + ROW_GAP`) porque um único limiar
oscila: a mesma caixa medida cheia (empilhado) sempre cruza de volta o
limiar de desempilhar, e medida espremida (lado a lado) sempre cruza de
volta o de empilhar — nenhum estado converge.

Teste novo em `src/App.test.ts` (`FakeResizeObserver`, sem Chromium, como
pedido). Mutate-verified:
- Colapsar a histerese num único limiar (`width < CANVAS_MIN_WIDTH` nos dois
  ramos): vermelho no segundo passo (820 px desempilhava quando devia
  continuar empilhado).
- Fixar `flexDirection: 'row'` (nunca empilha): vermelho no primeiro
  assert (`row.style.flexDirection` continuava `'row'`).

jsdom não faz layout de verdade, então os critérios 2–3 (sem sobreposição,
sem sair do viewport) são verificados estruturalmente — `flexDirection:
'column'` empilha os blocos, o que por construção do flexbox impede
compartilhar uma linha horizontal — e não por `getBoundingClientRect()`
como no PHY-18. Prova geométrica em Chromium real, se necessária, fica para
um ticket à parte (o padrão já existe no `describe` do PHY-18).

Gate verde: `npm test && npm run lint && npm run typecheck && npm run build`
(472 testes; um timeout solto em `simulator.test.ts` reproduziu-se isolado
como passou, falha não relacionada a este ticket).

### Stage 3 — revisão (2026-09-14): reaberto

Gate verde confirmado (472/472, lint, typecheck e build limpos), mas gate verde
não é o contrato — os critérios são. Medi a geometria real no Chromium com o
mesmo harness CDP do PHY-18 (`src/App.test.ts:668`), Vite servindo o app,
`Emulation.setDeviceMetricsOverride` em 14 larguras, `getBoundingClientRect()`
lido depois de 8 frames idênticos consecutivos. **O empilhamento não conserta o
vazamento: ele o gira 90°.** O canvas deixou de passar por cima do inspetor pela
direita e passou a passar por cima dele por baixo, em *todas* as larguras
empilhadas.

Causa: na linha empilhada (`flexDirection: 'column'`), o inspetor continua com
`flexShrink: 0` e passa a ter altura de conteúdo (~944 px) maior que a própria
linha (936 px). Não sobra espaço, e a coluna do canvas (`flex: 1, minHeight: 0`)
encolhe até **zero**. O canvas, de 402 px de altura, fica dentro de uma caixa de
0 px com `overflow: 'visible'` — desenha por cima do inspetor inteiro. Medido:

| viewport | `flexDirection` | coluna do canvas | canvas | inspetor | intersecta? |
|---|---|---|---|---|---|
| 1400 | row | 1071×936 | 1073×716 @ x 15 | x 1099–1369 | não |
| 950 | row | 621×936 | 623×416 @ x 15 | x 649–919 | não |
| 900 | column | 853×**0** | 602×402 @ y 64–466 | y 76–1020 | **sim** |
| 700 | column | 653×**0** | 602×402 @ y 64–466 | y 76–1020 | **sim** |
| 600 | column | 553×**0** | 602×402 @ **x −8,5** | y 76–1020 | **sim** |
| 360 | column | 313×**0** | 602×402 @ **x −128,5** | y 76–1039 | **sim** |

Screenshot em 900 px confirma a olho: o canvas cobre a galeria de cenas, os
botões `nova cena`/`excluir cena`/`exportar .json` e metade do painel de leitura.

Critérios:

1. ❌ O layout muda abaixo de 882 px, mas não "antes que o canvas ultrapasse sua
   coluna" — ele ultrapassa do mesmo jeito, agora no eixo vertical (coluna de
   0 px de altura contra canvas de 402 px).
2. ❌ Os retângulos do canvas e da coluna do inspetor se intersectam em **toda**
   largura empilhada medida (900, 882, 881, 850, 800, 700, 620, 600, 500, 400,
   360), tanto no carregamento quanto no redimensionamento sem reload.
3. ❌ Abaixo de ~610 px o canvas sai do viewport pela esquerda (`left = −8,5` em
   600; `−128,5` em 360). O piso de 600 px da `fitCanvas` continua maior que a
   coluna, e o `justifyContent: 'center'` da caixa reparte o excedente pelos dois
   lados — o scroll horizontal da página que aparece aí não alcança a metade
   esquerda, porque `left` negativo não é rolável.
4. ✅ Sem regressão: 1920/1400/1000/950 continuam 3:2 (aspecto 1.500), dentro do
   viewport e sem sobreposição; os testes de PHY-15/PHY-18 seguem verdes.
5. ❌ O mutate-verify registrado é real, mas protege um proxy que não implica os
   critérios. A inferência do stage 2 — "`flexDirection: 'column'` empilha os
   blocos, o que por construção do flexbox impede compartilhar uma linha
   horizontal" — é falsa: um item flex que colapsa a zero e tem
   `overflow: visible` volta a ocupar o espaço do irmão. Foi exatamente o que
   aconteceu. Nenhuma mutação que colapse a coluna do canvas teria ficado
   vermelha, porque nenhum assert olha altura nem sobreposição.
6. ✅ Gate verde (472/472, lint, typecheck, build).

Fica para o stage 2 (a direção de empilhar está certa; o estado empilhado é que
nunca foi dimensionado):

- Dar altura ao estado empilhado. O inspetor não pode ser `flexShrink: 0` quando
  a linha é coluna — ou ele ganha `flexShrink: 1` com `minHeight` próprio e
  `overflowY: 'auto'`, ou a linha inteira passa a rolar verticalmente e a coluna
  do canvas ganha altura definida (`flexBasis` da altura do canvas, ou
  `flexShrink: 0` no lado do canvas em vez do inspetor).
- Resolver o piso abaixo de ~632 px de viewport, que é o caso que sobra depois
  disso: com a coluna medindo `viewport − 32`, `Math.max(CANVAS_MIN_WIDTH, …)`
  ainda nasce maior que o pai. Se a decisão for scroll horizontal, a caixa do
  canvas precisa de `justifyContent: 'flex-start'` e um ancestral com
  `overflowX: 'auto'`, senão o excedente da esquerda fica inalcançável.
- **O teste precisa medir, não inferir.** Critérios 2 e 3 são geométricos e o
  jsdom não os enxerga; o harness Chromium do PHY-18 já existe no mesmo arquivo e
  aceita uma largura por parâmetro. Um caso que asserta
  `canvas.right <= innerWidth && canvas.left >= 0` e ausência de interseção com o
  retângulo do inspetor, em ~3 larguras empilhadas, é o que teria pego isto.
  Mantenha também o teste jsdom da histerese: a lógica de limiar dele está
  correta e o mutate-verify dela é válido.
- A histerese em si está certa e pode ficar: empilhado a caixa mede a linha
  inteira `W`, lado a lado mede `W − 282`, então os dois ramos cruzam no mesmo
  `W = 882` e o estado converge. O sweep 1400→500→1400 sem reload não oscilou em
  nenhum passo (`settled` em todas as 15 medidas).

### Stage 2, segunda rodada (2026-09-14)

Teste novo em `src/App.test.ts`: harness CDP-sobre-Vite reaproveitado do PHY-18
(mesmo arquivo, navega+settle+mede, sem interação), medindo
`getBoundingClientRect()` real do canvas e do inspetor em 6 larguras — 1400/950
(lado a lado, regressão) e 900/700/600/360 (empilhado, exatamente as larguras
que a revisão mediu como quebradas). Vermelho nas 4 larguras empilhadas antes da
correção, pelo mesmo motivo que a revisão relatou (interseção `true`); as duas
larguras lado a lado já passavam, confirmando que o teste em si não introduz
regressão. Teste jsdom da histerese mantido sem alteração, como pedido.

Causa raiz confirmada: a coluna do canvas tinha `flex: 1` (basis 0%, shrink 1)
igual em ambos os modos. Empilhado, o espaço negativo (inspetor sozinho já
maior que a linha) era todo absorvido por essa coluna porque sua basis de 0%
lhe dá peso de encolhimento zero — ela ia a zero, e o `<canvas>` real (piso
600×400, `overflow: visible`) pintava por cima do inspetor logo abaixo.

Correção (2 mudanças, ambas mutate-verified — revertida cada uma isoladamente
com o gate reaberto, confirmando vermelho exatamente na largura/critério que
ela protege):

1. `flex: stacked ? '1 0 auto' : 1'` na coluna do canvas (`src/App.tsx`, div
   pai do `canvasBoxRef`). Empilhado, `flex-shrink: 0` com `flex-basis: auto`
   faz essa coluna pedir sua altura real de conteúdo (piso do canvas + linhas
   de controles) e nunca encolher abaixo disso — quem cede espaço na disputa
   por altura passa a ser o que vem depois dela na coluna (o inspetor), não
   ela. Revertendo essa linha sozinha reproduz a interseção `true` exatamente
   nas 4 larguras empilhadas.
2. `justifyContent: stacked ? 'flex-start' : 'center'` na caixa do canvas.
   Resolve o critério 3 abaixo do piso (~632 px de viewport): centralizar
   dividia o excesso metade para cada lado, e a metade esquerda caía em
   `rect.left` negativo — inalcançável por scroll (scroll só expõe excesso
   positivo). `flex-start` fixa a borda esquerda do canvas dentro do viewport e
   empurra todo o excesso para a direita. Revertendo essa linha sozinha
   reproduz `rect.left` negativo (-8.5 e -128.5, os mesmos valores que a
   revisão mediu) em 600 e 360 px.

Duas mudanças cogitadas e descartadas por não serem cobertas por nenhum
critério nem pegas por nenhum teste (mutate-verify negativo — revertidas e o
gate continuou verde): dar `flexShrink`/`minHeight` ao inspetor quando
empilhado, e dar `minHeight` explícito à caixa do canvas quando empilhado. Com
a coluna do canvas já protegida (mudança 1), o canvas nunca escapa da própria
caixa, então o inspetor pode manter sua altura natural sem risco de
sobreposição — ele só empurra a página para baixo (rolagem vertical comum,
dentro das estratégias que o corpo do ticket já aceita), o que nenhum dos
critérios numerados proíbe.

Critério 3 abaixo de ~632 px de viewport continua parcialmente não satisfeito
por construção: o piso de 600 px é mais largo que qualquer coluna possível
nesses casos (fora do escopo deste ticket mudar o piso), então `rect.right`
excede `innerWidth` ali — o teste novo assume isso explicitamente e só cobra
`rect.left >= 0` (não vaza pela esquerda) e ausência de sobreposição com o
inspetor nessas larguras, não contenção total. `overflowX: 'auto'` num
ancestral não foi necessário: nada no caminho até a raiz do documento tem
`overflow` não-visible, então o excesso à direita já produz scroll horizontal
nativo da página (confirmado: nenhuma das larguras testadas ficou sem forma de
alcançar a área excedente).

Gate verde: `npm test` (478/478), `npm run lint`, `npm run typecheck`,
`npm run build`.

### Stage 3 — revisão (2026-09-14): needs your call

Não repeti a medição do stage 2 — medi de novo por conta própria, com uma sonda
CDP-sobre-Vite escrita nesta sessão (independente do harness do teste), varrendo
13 larguras sem reload, `settle` de 8 frames idênticos antes de cada leitura, e
medindo além do inspetor: interseção do canvas com **todo** elemento interativo
da página (`button, input, select, textarea, a[href]`), `scrollWidth`/
`scrollHeight` do documento, e `elementFromPoint` no centro do canvas.

Varredura descendente 1920→360 e ascendente 360→1920, sem reload:

| viewport | direção | canvas (x,y,w,h) | inspetor (x,y,w,h) | intersecta? | choques |
|---|---|---|---|---|---|
| 1920 | row | 376,64,872,582 | 1619,64,270,636 | não | nenhum |
| 1400 | row | 116,64,872,582 | 1099,64,270,636 | não | nenhum |
| 1000 | row | 15,64,674,450 | 699,64,270,636 | não | nenhum |
| 950 | row | 15,64,623,416 | 649,64,270,636 | não | nenhum |
| 900 | column | 16,64,854,570 | 16,702,853,944 | não | nenhum |
| 883 | column | 16,64,839,560 | 16,692,836,944 | não | nenhum |
| 882 | column | 16,64,836,558 | 16,690,835,944 | não | nenhum |
| 881 | column | 16,64,836,558 | 16,690,834,944 | não | nenhum |
| 800 | column | 16,64,755,504 | 16,636,753,944 | não | nenhum |
| 700 | column | 16,64,656,438 | 16,570,653,944 | não | nenhum |
| 620 | column | 16,64,602,402 | 16,562,573,944 | não | nenhum |
| 600 | column | 16,64,602,402 | 16,562,553,944 | não | nenhum |
| 500 | column | 16,64,602,402 | 16,562,453,944 | não | nenhum |
| 360 | column | 16,64,602,402 | 16,593,313,963 | não | nenhum |

O vazamento de 90° que reabriu o ticket sumiu: a coluna do canvas nunca mais
mede 0 px de altura, e o inspetor passa a começar exatamente onde o conteúdo
dela termina. As 14 medidas assentaram (nenhuma estourou o limite de frames), e
1400 medido no passo 1 e de novo no passo 13 deu retângulo idêntico — a
histerese converge nos dois sentidos, não só descendo.

Mutate-verify refeito por mim, cada mutação isolada com o gate reaberto:

| mutação | resultado |
|---|---|
| `flex: stacked ? '1 0 auto' : 1` → `flex: 1` | 4 vermelhos: interseção `true` em 900/700/600/360; 1400/950 seguem verdes |
| `justifyContent: stacked ? 'flex-start' : 'center'` → `'center'` | 2 vermelhos: `rect.left` −8,5 em 600 e −128,5 em 360 — os mesmos números da revisão anterior |
| histerese colapsada num limiar só | 3 vermelhos: o teste jsdom (`'row'` onde devia ser `'column'`) **e** 900/700 no Chromium, porque o layout passa a oscilar e nunca assenta |

A terceira não estava pedida e é a mais informativa: prova que a histerese é
carga, não enfeite, e que o `settle` de 8 frames do harness realmente falha alto
quando o layout não converge.

Critérios:

1. ✅ O layout empilha em ~914 px de viewport, antes que a coluna do canvas caia
   abaixo do piso, e nessa transição o canvas nunca ultrapassa a própria coluna
   em nenhum dos dois eixos.
2. ✅ Nenhuma interseção em 14 larguras, nos dois sentidos da varredura — e
   ampliando o critério para todos os elementos interativos da página (botões de
   cena, inputs, selects, links), não só a coluna do inspetor: zero choques.
   `elementFromPoint` no centro do canvas retorna `CANVAS` em todas.
3. ⚠️ Satisfeito de 620 px de viewport para cima. Abaixo disso `rect.left` é 16
   (nunca negativo, que era o caso insalvável), mas `rect.right` é 618 contra
   `innerWidth` 600/500/360 — o canvas sai pela direita. **É a parte que precisa
   da sua decisão** (abaixo).
4. ✅ Sem regressão: aspecto 1,498 (o arredondamento para múltiplo de 3) em todas
   as 14 larguras; 1920/1400/1000/950 lado a lado com a mesma geometria de antes;
   478/478 testes verdes, incluindo os de PHY-15 e PHY-18.
5. ✅ Mutate-verify real e ligado aos critérios, não a um proxy — os testes agora
   medem `getBoundingClientRect()` em Chromium, que é a falha do round anterior,
   corrigida. O teste jsdom de histerese foi mantido e continua mordendo.
6. ✅ Gate verde: `npm test` (478/478), `npm run lint`, `npm run typecheck`,
   `npm run build`.

Correção aplicada pela revisão (pequena, dentro dos Primary files, sem teste
novo): o comentário em `src/App.tsx` na coluna do canvas afirmava que o inspetor
"gets flex-shrink below" — ele continua `flexShrink: 0`, como o próprio stage 2
registrou ao descartar essa mudança. Comentário reescrito para descrever o que o
código faz: nenhuma das duas colunas encolhe quando empilhadas, a linha
transborda para baixo e a página rola.

#### O que precisa da sua decisão

O critério 3, como está escrito (`rect.right <= window.innerWidth` em toda
largura), é **insatisfazível** dentro do escopo deste ticket. Abaixo de ~620 px
de viewport nenhuma coluna possível tem 600 px, e mudar `CANVAS_MIN_WIDTH` o
corpo do ticket põe fora de escopo. Ao mesmo tempo o corpo lista "dar scroll
horizontal à página" entre as estratégias aceitas — e scroll horizontal implica,
por definição, `rect.right > innerWidth`. Os dois textos não podem valer juntos.

O que a implementação entrega abaixo de 620 px: o excedente todo vai para a
direita (`scrollWidth` 618 ≥ `rect.right` 618, confirmado: alcançável rolando),
o canvas nunca sai pela esquerda, e não cobre nada. Ou seja, a estratégia que o
corpo aceita, executada corretamente.

Duas saídas, ambas suas:

- **Aceitar** — o critério 3 vira "não vaza pela esquerda e todo excedente é
  alcançável por scroll", que é o que o corpo do ticket sempre quis dizer.
  Merge, e a reformulação do critério fica registrada aqui.
- **Não aceitar** — então o alvo real é o piso de 600 px, e isso é um ticket
  novo de stage 1 (tornar `CANVAS_MIN_WIDTH` responsivo, ou dar zoom/scroll
  interno ao canvas), não um reopen deste.

Não reabri para o stage 2 porque não há trabalho de stage 2 possível: nenhuma
mudança de layout dentro dos Primary files satisfaz o critério 3 com o piso
fixo em 600.
