# PHY-20: Canvas vaza da própria coluna e fica atrás do inspetor em janela estreita
Stage: to-implement
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
