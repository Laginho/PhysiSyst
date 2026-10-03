# PHY-73: Interação do gráfico: seek e tipos por seleção
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-72
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (painel do gráfico do PHY-72; handler do slider :1839-1848 como modelo do `seek`; seleção de corpo)
  - src/render/graph.ts (`graphLayout` → inverso `indexAtX`)
  - src/render/graph.test.ts
  - src/App.test.ts, src/App.browser.test.ts
  - src/playback/scheduler.ts (ação `seek` :43, :90 — consumida, não alterada)

#### What to build

Dois comportamentos sobre o painel do PHY-72.

**Clique e arrasto fazem seek.** `pointerdown` no canvas do gráfico (e `pointermove` com o botão pressionado, com `setPointerCapture`) mapeia o x do ponteiro para o índice do registro mais próximo (`indexAtX(layout, x, tMax)` em `graph.ts`, inverso de `mapT`, limitado a `[0, recording.length − 1]`) e despacha a mesma ação `seek` que o slider despacha, com a mesma semântica: durante o play, pausa e fica pausado ao soltar; o último registro é "ao vivo" como no slider. Fora da área do `plot` (margens dos eixos) o x é limitado às bordas.

**Tipos cinemáticos só com corpo selecionado.** Sem corpo selecionado, as opções `position`, `velocity` e `acceleration` do `<select>` ficam `disabled` e, se o tipo atual era um deles, cai em `energy`. Ao selecionar um corpo, as opções voltam a ficar habilitadas (o tipo não muda sozinho).

#### Acceptance criteria

1. `indexAtX` com `tMax = 2` e 121 registros: x na borda esquerda do `plot` → 0; na direita → 120; no meio → 60; além das bordas → limitado a 0 e 120.
2. No `App`, com 61 registros gravados e a simulação pausada, `pointerdown` no meio do `plot` do gráfico muda o valor do slider para 30 e o rótulo de tempo para `t = 0,50 s`.
3. Durante o play, `pointerdown` no gráfico pausa (botão de play volta ao estado de pausado) e `pointerup` não retoma.
4. `pointermove` com o botão pressionado atualiza o slider a cada movimento; sem o botão, não.
5. Sem corpo selecionado, as opções `position`, `velocity`, `acceleration` do `<select>` têm `disabled`; `energy` e `momentum` não. Com o tipo em `velocity`, desselecionar o corpo muda o `<select>` para `energy`.
6. Selecionar um corpo habilita as três opções e mantém o tipo atual.
7. Teste de browser: clicar no gráfico num ponto medido em geometria real move o polegar do slider para o índice esperado (o `value` do `<input type="range">` muda).

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/graph.test.ts`: critério 1 chamando `indexAtX` direto; vermelho hoje porque não existe.
- `src/App.test.ts`: critérios 2 a 6 com o simulador falso e o `requestAnimationFrame` controlado; vermelhos hoje (o canvas não responde a ponteiro e as opções não desabilitam). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.
- `src/App.browser.test.ts`: critério 7 com `withBrowserSession`; vermelho hoje. Mesma regra de evidência.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: clique/arrasto despacha o `seek` existente com a semântica do polegar do slider (pausa e fica pausado); tipos cinemáticos desabilitados sem seleção, caindo em energia (segue de "nada selecionado → sistema"); seek por teclado fica no slider; um teste de browser com evidência mutate-verify.
