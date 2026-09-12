# PHY-18: Selecionar um corpo não pode mover o canvas debaixo do cursor
Stage: to-implement
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/App.tsx` (a linha `display: flex` que põe coluna do canvas e coluna do inspetor lado a lado, ~1100, e o wrapper `alignItems: 'center'` do canvas, ~1107)
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

1. Selecionar um corpo não muda a posição nem o tamanho do retângulo do canvas: `getBoundingClientRect()` do canvas é igual antes e depois da seleção, com o inspetor renderizado
2. Trocar a seleção entre corpos de shapes diferentes (retângulo ↔ cunha ↔ bola, inspetores de alturas diferentes) também não move o canvas
3. Um arraste que começa em um corpo **não selecionado** larga o corpo na mesma posição de mundo que o mesmo arraste em um corpo **já selecionado** — a seleção deixa de ser um estado que muda o resultado do arraste
4. A cena inteira continua visível e o canvas continua 3:2 depois da mudança de layout (não regredir o PHY-15)
5. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/App.test.ts src/render/fitCanvas.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, no espelho do layout: com um corpo selecionado e sem, a geometria do canvas é a mesma (critérios 1 e 2). Vermelho porque hoje a altura da linha depende do inspetor.
- `src/App.test.ts`, no seam de arraste: o mesmo arraste (mesmos pontos de tela) sobre um corpo selecionado e sobre um não selecionado termina na mesma posição de mundo (critério 3). Vermelho porque hoje o segundo caso erra por uma constante.

## Comments

Aberto pelo passe manual desktop do PHY-17 (D2), no site publicado.
