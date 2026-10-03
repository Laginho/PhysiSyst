# PHY-61: Trechos paralelos numa polia viram uma seta 2T
Stage: to-implement
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/render/overlay.ts (`tensionArrows`, `OverlayArrow`, `vectorLabels`)
  - src/render/overlay.test.ts
  - src/App.tsx (só o bloco de overlay de vetores em `paint`: chamada de `vectorLabels` e os lookups de rótulo por seta, ~l.246–257)

#### What to build

Na polia móvel (preset `movable-pulley`), a corda é uma só e as polias não têm massa, então T é a mesma em todo lugar. Na polia montada na carga, `tensionArrows` empilha duas setas T iguais (uma por trecho adjacente), ambas para cima; na tela parece uma seta T só, igual à do contrapeso, quando a corda puxa a carga com 2T. O Bruno leu isso como "duas trações diferentes com a mesma letra".

Decisão (Bruno, 2026-10-02): fundir. Numa polia com montagem dinâmica, quando a corda não é por trecho (`perSegment` falso) e os dois trechos adjacentes saem da polia na mesma direção (cosseno entre as direções ≥ cos 5°), `tensionArrows` emite uma seta só, na direção média, dimensionada pela regra comum com magnitude 2T, e rotulada `2T`.

O fator vai num campo opcional `factor` de `OverlayArrow` (ausente = 1). `vectorLabels` prefixa o fator ao rótulo (`2T`, `2T_1` quando há numeração); a numeração conta a chave da corda como hoje, então a seta 2T e a T do contrapeso continuam sendo a mesma grandeza T. `vectorLabels` devolve um lookup por seta (resolve por `kind`/`key` + `factor`, não por identidade do objeto, porque o modo seleção regenera as setas), e o consumidor em `src/App.tsx` passa a usá-lo; o tipo antigo `Map<string,string>` sai, para que o typecheck pegue um consumidor não atualizado.

#### Acceptance criteria

1. Na cena do preset `movable-pulley` com uma leitura de T > 0, a polia da carga produz exatamente uma seta de tração, apontando para cima, com comprimento `vectorArrowLengthPx(2T)/ppm`.
2. `vectorLabels` rotula essa seta `2T` e a do contrapeso `T`, em pt-BR.
3. Trechos que saem da polia em direções diferentes (ângulo > 5°) continuam dando duas setas, como hoje.
4. Com polia com massa no caminho (`perSegment`), nada muda.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/overlay.test.ts`: critérios 1 e 2 vermelhos hoje (duas setas, rótulo `T`). O 3 e o 4 passam hoje e vão juntos. Chama as funções direto; não é costura de DOM.
- `src/render/overlay.test.ts`: o lookup resolve igual para uma seta regenerada com a mesma `kind`/`key` (pino do modo seleção, l.254/257 do App), e `2T_1`/`T_1` ao lado de uma segunda corda.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 5, print da polia móvel). As duas setas T sobrepostas foram confirmadas no código: `tensionArrows` faz um `push` por trecho adjacente no centro da polia. Bruno escolheu fundir em 2T, em vez de T₁/T₂ (a tração é a mesma) ou setas lado a lado.

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-61-tracao-dupla-na-polia-movel-asked-20261003-0054`): PHY-61 marcado `blocked` no commit `15d227f`. /  / O consumidor em `src/App.tsx:248` consulta rótulos pela chave da corda; assim, não consegue distinguir `2T` da carga e `T` do contrapeso. /  / Posso incluir esse consumidor nos `Primary files`? A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “the implementer may touch those files and nothing else”. /  / Nenhum código alterado; testes não executados.

- 2026-10-03 Proxy decided: sim — incluir `src/App.tsx` nos Primary files, só o bloco de overlay de vetores em `paint` (chamada de `vectorLabels` e os três lookups `labels.get(a.key)`, ~l.246–257); nada mais nesse arquivo. `vectorLabels` deixa de devolver `Map<string,string>` e passa a devolver um lookup por seta (ex.: `(a: OverlayArrow) => string`) que resolve por `kind`/`key` + `factor`, nunca por identidade do objeto — o ramo de seleção (l.254/257) regenera as setas de `selView` e consulta os rótulos da cena inteira. Com a mudança de tipo, um consumidor que continue com `labels.get(a.key)` quebra no typecheck; é esse o pino do seam, não um teste em `src/App.test.ts`, que fica fora do escopo. Próximo stage 2 começa limpo da branch da sessão; a branch `-asked-20261003-0054` só tem o commit do bloqueio e pode ser descartada. — O contrato prende a numeração à chave da corda, então o fator só pode entrar no lookup por seta, e o único consumidor desse lookup está em App.tsx.
