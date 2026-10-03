# PHY-61: Trechos paralelos numa polia viram uma seta 2T
Stage: done
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

- 2026-10-03 Stage 2: callers inspected: App.paint and overlay.test.ts for tensionArrows/vectorLabels. Tests cover the preset, 0/4/5/6/180-degree reading paths, unequal leg lengths, degenerate legs, slack/missing readings, mass on either pulley, regenerated arrows and rope numbering. Red: overlay.test.ts 13 failed / 39 passed (52); old producer emits 3 arrows instead of 2 in the preset, and old Map is not the required callable lookup.

#### Stage 2 implementation (2026-10-03)

- Combined massless-pulley legs through 5 degrees into one factor-2 arrow, using normalized mean direction and the shared sizing rule at 2T. Massive-pulley ropes retain per-segment arrows; zero-length legs retain the existing fallback.
- vectorLabels now returns a callable lookup by kind/key with a factor prefix; all three App.paint consumers migrated. Numbering still counts rope quantities, and regenerated arrows resolve without object identity.
- Red commit: ca7bb29 (tests and ticket only), 13 failed / 39 passed. Green focused suite: 52 passed.
- Mutate-verify on production overlay.ts: disabling fusion caused 6 failures; ignoring the angle caused 2 failures (6/180 degrees); ignoring perSegment caused 2 failures (mass on movable/fixed pulley); dropping factor prefixes caused 2 failures (2T/T and numbered regenerated arrows); using unnormalized leg lengths caused 2 failures (4/5 degrees). Every mutation was restored.
- Gate: 31 test files, 1016 tests passed; lint, typecheck and production build passed. The sandbox attempt had 15 Chromium startup/disconnection failures (GPU permissions); the complete gate passed outside the sandbox. Build retains the large-chunk warning.
- Final diff inspected: only the three Primary files plus this ticket; no test changes in the implementation commit. Stage 3 remains pending; no merge performed.

#### Resolution (2026-10-03)
Verdict: Approve

- Standards: zero findings in the independent review. Changes stay within the three Primary files and ticket metadata; no actionable code smells. Test-only commit `ca7bb29` precedes implementation `4ee372d`, whose diff does not touch tests.
- Spec: zero findings in the independent review. Criteria 1–4 met: the ideal movable pulley combines parallel legs into one upward arrow sized at 2T; labels distinguish 2T/T; angles above 5 degrees and per-segment tensions keep separate arrows. Unequal leg lengths use normalized mean directions; slack, missing readings, loose wraps and zero-length legs preserve existing behavior.
- Proxy decision reviewed: include only the three label lookups in `App.paint` and replace the Map with a callable lookup by kind/key plus factor, preserving regenerated selection arrows and rope numbering. All three consumers migrated; the approved seam uses typecheck rather than a new App test.
- Files: `src/render/overlay.ts`, `src/render/overlay.test.ts`, `src/App.tsx`; stage 3 changed only this ticket and the ledger.
- Red proof independently reproduced with `npm test -- src/render/overlay.test.ts --reporter=dot`: temporarily replacing production `overlay.ts` with the session-base version caused 13 failures / 39 passes (52 tests). The movable-pulley preset expected 2 arrows but received 3; the new callable label contract failed against the old Map. Production was restored byte for byte, with no remaining source diff.
- Green proof: the restored overlay's 52 tests passed within the independent full gate. `npm test && npm run lint && npm run typecheck && npm run build` passed: 31 test files, 1016 tests; lint, typecheck and production build successful. Existing Vite large-chunk warning remains. Commands ran outside the unavailable Windows sandbox (process creation error 1909).
- Rebase onto `sweatshop/2026-10-02-2210` was already up to date. Merged locally without squash as `2f3f0b6`; the validated source/test tree is unchanged. Ticket closure and ledger entry committed together on the session branch. No push or PR in this session flow.
