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
