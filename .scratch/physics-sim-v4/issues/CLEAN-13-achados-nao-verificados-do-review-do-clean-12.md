# CLEAN-13: Achados não verificados do review do CLEAN-12
Stage: done
Status: resolved
Blocked by: none
Review: agent

- Primary files:
  - (a definir pelo stage 1, um ticket por achado aceito)

#### What to build

O `/code-review` do CLEAN-12 (stage 3, 2026-09-25) varreu além do diff do ticket (23 linhas em `src/sim/acceptance.test.ts`) e devolveu achados em código que nenhum critério do CLEAN-12 cobre. Nenhum foi verificado pelo review; nenhum é regressão do CLEAN-12. Ficam aqui para o stage 1 triar, como o CLEAN-01 fez com os do PHY-23.

1. `src/editor/doc.ts` `addSpring` (~237): `x₀` e a recusa de comprimento zero são medidos nas poses do **documento**, mas a ferramenta de mola testa e encaixa âncoras nas poses **vivas** (`App.tsx` ~1201 passa `docRef.current` depois de um clique sobre `view`). Uma mola construída em pausa no meio da corrida nasce com `x₀` medido em t = 0 e dá um tranco no rebuild; duas âncoras que coincidem na tela passam pela guarda `x0 === 0` (ou o contrário). O PHY-27 decidiu "x₀ nas poses do documento" (critério 2), mas não a discrepância com o hit-test.
2. `src/App.tsx` `onToolClick` (~1200): os cliques que não podem prosseguir (polia antes da primeira âncora, segundo clique no corpo da primeira âncora sem polia no meio) saem com `return` nu, sem `toolError`; a linha de dica não muda. O canal existe (`error.parConsigoMesmo`).
3. `src/App.tsx` `paint` (~230): as seis camadas de setas (`tensionArrows`, `elasticArrows`, `weightArrows`, … com `scenePath`/`bodyPointToWorld` por corda e mola) são construídas em todo repaint mesmo com `showGlobal` desligado, só para alimentar `vectorLabels` das duas setas do corpo selecionado. Desempenho no rAF, não medido.
4. `src/App.tsx` `paint` (~245): o modo só-seleção pega o estilo de velocidade inicial por índice posicional (`layers[1]!.style`); reordenar as camadas recolore a seta de v₀ sem erro de tipo.
5. `src/sim/simulator.ts` `pullPieces` (~1080): `freePointVelocity` é chamada duas vezes por ponto de caminho por passo (no `map` de `free`, resultado descartado depois de `freePoint`, e de novo em `rates`); `pullRope` guarda as velocidades em `v` e reutiliza.
6. `src/App.tsx` `SpringPanel` (~503): recusar em vez de clampar num `NumField` controlado torna qualquer `k`/`x₀` < 1 indigitável dígito a dígito (o primeiro `0` é recusado por `commitSpringEdit` e o React devolve o valor antigo; só `.5` chega). A recusa sem clamp é decisão do proxy no PHY-27 (critério 3); o efeito colateral no input controlado não foi considerado lá.

Descartados pelo review, já decididos em tickets fechados:

- `App.tsx` ~1845, o painel mostra `F_el,1`/`F_s,1` com o `_` literal enquanto a corda mostra `T₁`: é o contrato testado do CLEAN-10 (`src/App.test.ts:1067`) e o CLEAN-11 o manteve de propósito ("as before"). A pergunta de numeração por cena vs. por vínculo já está com o stage 1 nos Comments do CLEAN-11.
- `App.tsx` ~1211, `finishTool` infere polia vs. vínculo comparando `pulleys.length`: decisão do proxy no CLEAN-07, mantida pelo fix e anotada no review daquele ticket como juízo sem ação.

#### Acceptance criteria

(a definir pelo stage 1)

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

(a definir pelo stage 1)

## Comments

- 2026-09-25 Aberto pelo review do CLEAN-12 (stage 3). `Stage: blocked` porque nada aqui está verificado nem tem critério: o stage 1 confere cada item no código, descarta ou abre um ticket por achado aceito, e fecha este.
- 2026-09-30 Review de benchmark do PR 9. O item 1 foi confirmado no Chromium (Sol) e resolvido de outro jeito pelo PHY-39: edição estrutural só com `passos = 0`, e aí a pose viva é a pose do documento. O item 6 foi confirmado no Chromium (Sol) e virou o PHY-44. Os itens 2 a 5 continuam aqui para triagem.
- 2026-10-01 Triagem (stage 1) dos itens 2 a 5, conferidos no código da main. Os quatro existem como descritos; o 5 só em parte, porque os pontos das peças nem sempre são os da corda.
  - Item 2. Proxy decided: abrir o CLEAN-24 — o `doc.ts` já recusa o par consigo mesmo com `error.parConsigoMesmo` e o App só esconde a recusa; o clique na polia antes de A fica ignorado.
  - Item 3. Proxy decided: descartar — montar as seis camadas é o que dá aos rótulos a mesma letra nos dois modos; custo nunca medido. Reabre só se um perfil mostrar o `paint` acima do orçamento do quadro.
  - Item 4. Proxy decided: descartar — risco hipotético e visível se acontecer; um refactor puro não tem teste vermelho antes. Um ticket futuro que já tenha as camadas do `paint` nos Primary files pode trocar o índice pelo nome.
  - Item 5. Proxy decided: descartar — duplicação parcial, não medida, num trecho numericamente sensível (PHY-41, PHY-45); o único teste possível seria um spy de contagem de chamadas. Reabre só com perfil mostrando o `pullPieces` quente.
  Com isso todos os itens têm destino e o ticket fecha.
