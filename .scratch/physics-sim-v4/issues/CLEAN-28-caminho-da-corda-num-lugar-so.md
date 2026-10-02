# CLEAN-28: o caminho da corda (simulado, senão o do documento) escolhido num lugar só
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/scene/ropePath.ts (`currentPath`, nova, ao lado de `scenePath`)
  - src/scene/index.ts (a linha que reexporta de `./ropePath`)
  - src/scene/ropePath.test.ts (bloco `scenePath: rope path from document poses`, ou um bloco novo `currentPath (CLEAN-28)` ao lado dele)
  - src/render/draw.ts (`drawScene`: assinatura; `drawConstraints`: a escolha do caminho; o import de `../scene`)
  - src/render/draw.test.ts (as chamadas de `drawScene` do bloco `drawScene, rope path (PHY-56)`; o teste novo de `selection`)
  - src/render/overlay.ts (`tensionArrows`: a escolha do caminho; o import de `../scene`)
  - src/editor/hitTest.ts (`ropeAtPoint`: a escolha do caminho; o import de `../scene`)
  - src/App.tsx (`paint`, `onPointerDown`, a função da guarda; a chamada de `drawScene`)

#### What to build

Nada muda para o usuário. Depois do PHY-56 e do CLEAN-27, a escolha "o caminho que o simulador resolveu, senão o `scenePath` do documento" está escrita três vezes, com o mesmo `find` e o mesmo fallback: `src/render/draw.ts:316-317` (`drawConstraints`), `src/editor/hitTest.ts:96-97` (`ropeAtPoint`) e `src/render/overlay.ts:132-134` (`tensionArrows`). A guarda do editor (leituras da corda só quando há um quadro simulado) está escrita duas vezes em `src/App.tsx`: `paint` (linha 197) e `onPointerDown` (linha 1321). E `drawScene` (`src/render/draw.ts:181`) tem 8 argumentos posicionais, e a única chamada de produção (`src/App.tsx:198`) passa `undefined` para chegar aos dois últimos.

**A escolha do caminho, num lugar só.** `src/scene/ropePath.ts` exporta `currentPath(scene, rope, readings)`, ao lado de `scenePath`: o `path` da leitura cujo `id` é o da corda, senão `scenePath(scene, rope)`; `null` quando não há leitura com `path` e uma referência do documento pende, como `scenePath` devolve hoje. `readings` é obrigatório (sem valor padrão) e tem o tipo estrutural `readonly { id: string; path?: RopePath }[]`: `ConstraintState[]` cabe nele (`RopeState.path` é opcional e `SpringState` não tem `path`), e `src/scene` continua sem importar nada de `src/sim`, como o CLEAN-26 já recusou. O lint (`eslint.config.js:15-19`) proíbe import de valor de `sim` fora de `src/sim/**`, então a função não pode morar no simulador. Não há teste de `kind`: os ids são únicos em `scene.constraints`, então a leitura com o id da corda é a leitura da corda. Os três chamadores passam a chamar `currentPath` e deixam de importar `scenePath`; `scenePath` continua sendo o caminho do documento onde ele é pedido de propósito (`L` do `RopePanel` em `App.tsx`, `buildWorld` em `simulator.ts`).

**A guarda do editor, numa função só.** Uma função de módulo em `src/App.tsx` (por exemplo `ropeReadingsOf(states, readings)`: `readings` quando `states` não é nulo, `[]` quando é), chamada pelo `paint` e pelo `onPointerDown`, com o comentário do PHY-56/CLEAN-27 (o `constraintsRef` fica velho no editor; só um quadro simulado dá forma à corda, às setas de `T` e ao clique) em cima dela. O comportamento não muda: `elasticArrows` segue recebendo as leituras sem guarda, porque mostra `F_el` em t = 0.

**`drawScene` com objeto de opções.** `drawScene(ctx, scene, camera, width, height, opts?)`, com `opts: { selection?: Selection; readings?: readonly ConstraintState[] }`. `style` sai de `drawScene`: nenhum chamador em `src/` passa um (produção ou teste), e o desenho usa `DEFAULT_STYLE` por dentro. `drawGrid` fica como está, com o seu `style`. A chamada em `App.tsx` passa `{ selection, readings }` e não passa mais `undefined`. O anel de seleção (`selectionStroke`, `#ff8c00`) não tem teste hoje em lugar nenhum, e esquecer a chave `selection` compila: por isso ele ganha um teste direto aqui.

**Fora do escopo:** o ADR-0004 (descreve o comportamento, que não muda); os docblocks dos três chamadores (seguem verdadeiros); `drawGrid`; `tensionArrows` fora da escolha do caminho (o parâmetro continua `constraints`).

#### Acceptance criteria

1. `src/scene/ropePath.ts` exporta `currentPath(scene, rope, readings)`, reexportada por `src/scene/index.ts`, com `readings: readonly { id: string; path?: RopePath }[]` obrigatório e sem import de `src/sim`. Chamada direta, na cena do bloco `scenePath: rope path from document poses` de `ropePath.test.ts` (rope `corda` sobre `p`):
   1. com uma leitura para `corda` trazendo um `path` montado à mão, devolve esse mesmo objeto (`toBe`);
   2. com `[]`, com uma leitura só para outro id, com uma leitura de `corda` sem `path` e com uma leitura de mola (`{ id, kind: 'spring', dx, force }`), devolve `toStrictEqual(scenePath(scene, corda))`;
   3. com `via: ['ghost']` e `[]`, devolve `null`.
2. `src/render/draw.ts`, `src/render/overlay.ts` e `src/editor/hitTest.ts` escolhem o caminho por `currentPath` e não importam mais `scenePath`: `git grep -n "scenePath" -- src/render/draw.ts src/render/overlay.ts src/editor/hitTest.ts` não acha nada, e `git grep -n "?? scenePath(" -- src` acha só a linha de `src/scene/ropePath.ts`. Conferido na Verification.
3. A guarda do editor é uma função só em `src/App.tsx`, chamada pelo `paint` e pelo `onPointerDown`; `git grep -n -e "states ? " -e "statesRef.current ? " -- src/App.tsx` não acha nada (hoje acha as linhas 197 e 1321). `elasticArrows` continua recebendo `opts.constraints` sem guarda.
4. `drawScene(ctx, scene, camera, width, height, opts?)` com `opts: { selection?: Selection; readings?: readonly ConstraintState[] }`; `drawScene` não tem mais parâmetro `style` e usa `DEFAULT_STYLE`; `drawGrid` não muda; a chamada em `App.tsx` não passa `undefined`. Chamada direta com o `recordingCtx` de `draw.test.ts`, numa cena com um corpo dinâmico `r`: com `{ selection: { kind: 'body', id: 'r' } }` o log tem um `set` de `strokeStyle` a `'#ff8c00'`; sem `opts`, nenhum.
5. Os testes existentes ficam verdes sem mudar tolerância nem texto. A única mudança em teste existente é a forma das chamadas de `drawScene` em `draw.test.ts` (a função `draw` e o `baseline` do bloco PHY-56 passam a `{ readings }`); os blocos PHY-56 e CLEAN-27 de `App.test.ts`, `overlay.test.ts` e `hitTest.test.ts` não mudam.
6. Mutate-verify conforme o `AGENTS.md`. Cada mutação é aplicada à produção, rodada com um `npx vitest run` só, revertida, e o ticket registra em Comments os testes vermelhos por arquivo:
   - M1: `currentPath` devolve sempre `scenePath(scene, rope)`, ignorando `readings`. Vermelho esperado: `ropePath.test.ts` (1.1); `draw.test.ts` (`a loose pulley…`, `a wrap of 7 rad…`); `overlay.test.ts` (os dois de `with the path of the reading (PHY-56)`); `hitTest.test.ts` (CLEAN-27: `(0; 0,25)` deixa de acertar); `App.test.ts` (PHY-56 teste 1 depois do passo, CLEAN-27 depois do passo).
   - M2: `currentPath` devolve `readings.find(…)?.path ?? null`, sem fallback. Vermelho esperado: `ropePath.test.ts` (1.2); `draw.test.ts` (`without constraints…`; o teste `constraints with no entry…` fica verde por construção: compara `ropeLog(draw([…]))` com `ropeLog(draw())`, ambos vazios com o mutante); `overlay.test.ts` (Atwood, straight rope, movable pulley, pulley with mass: o helper `ropeState` não tem `path`; e os quatro de `vectorLabels` com corda); `hitTest.test.ts` (`hits a rope within the tolerance…` e o laço de fallback do CLEAN-27); `App.test.ts` (PHY-56 testes 1 e 2 no `docTangent`; os cinco de PHY-28 e o de PHY-39 que clicam ou leem a corda no editor; o CLEAN-27 fica verde por construção: depois de reiniciar só exige que o ponto do caminho simulado não selecione, o que também vale sem corda alguma).
   - M3: a função da guarda devolve as leituras sem olhar `states`. Vermelho esperado: `App.test.ts` PHY-56 teste 1 (antes do passo e depois de reiniciar), teste 2 (leitura velha: `TypeError` em `tensionArrows`), CLEAN-27 (clique antes do passo e depois de reiniciar).
   - M4: a função da guarda devolve `[]`. Vermelho esperado: `App.test.ts` PHY-56 teste 1 (depois do passo), CLEAN-27 (clique depois do passo).
   - M5: `drawScene` ignora `opts.selection` (o teste novo do critério 4 fica vermelho) e, em separado, ignora `opts.readings` (PHY-56 2.2/2.3 em `draw.test.ts` e PHY-56 teste 1 de `App.test.ts` ficam vermelhos).
7. M1 e M2 deixam vermelho pelo menos um teste em cada um de `draw.test.ts`, `hitTest.test.ts` e `overlay.test.ts`. Um arquivo de chamador que fica verde com a função quebrada ainda tem a sua própria cópia da escolha.
8. Gate verde: `npm test && npm run lint && npm run typecheck && npm run build`.

#### Verification

    npx vitest run src/scene/ropePath.test.ts src/render/draw.test.ts src/render/overlay.test.ts src/editor/hitTest.test.ts
    npx vitest run src/App.test.ts -t "PHY-56|CLEAN-27"
    git grep -n "scenePath" -- src/render/draw.ts src/render/overlay.ts src/editor/hitTest.ts
    git grep -n "?? scenePath(" -- src
    git grep -n -e "states ? " -e "statesRef.current ? " -- src/App.tsx
    npm test && npm run lint && npm run typecheck && npm run build

O primeiro e o terceiro `git grep` não acham nada; o segundo acha exatamente uma linha, em `src/scene/ropePath.ts`.

O gate precisa de um Chromium na máquina (`CHROME_BIN` aponta para ele quando está fora dos caminhos padrão), por causa dos testes de layout do `AGENTS.md`. Os testes deste ticket não precisam dele.

## Tests stage 2 writes (own commit, red)

- `src/scene/ropePath.test.ts`, bloco `scenePath: rope path from document poses` (ou um bloco novo `currentPath (CLEAN-28)` ao lado), chamando `currentPath` direto, com `CLEAN-28` no nome: o critério 1. Vermelho hoje porque `currentPath` não existe (`TypeError: currentPath is not a function`). Chamada direta, sem registro de mutação.
- `src/render/draw.test.ts`, chamando `drawScene` direto com o `recordingCtx`, com `CLEAN-28` no nome: o teste de `selection` do critério 4. Vermelho hoje porque o sexto argumento é `style`: o objeto de opções é lido como estilo, nenhum `#ff8c00` aparece, e o typecheck reprova. No mesmo commit, as chamadas do bloco PHY-56 (`draw`, `baseline`) passam para a assinatura nova (critério 5), vermelhas pela mesma razão.
- Nenhum teste novo em `App.test.ts`, `overlay.test.ts` ou `hitTest.test.ts`: os blocos PHY-56 e CLEAN-27 já fixam os três chamadores e as duas costuras da guarda. O que este ticket acrescenta é o registro das mutações M1–M5 (critérios 6 e 7), agora contra uma função só. M3 e M4 são costura de DOM: registro obrigatório pelo `AGENTS.md`.

## Comments

- 2026-10-02 Stage 2: seams aprovadas no ticket: `currentPath` direto e `drawScene` com `recordingCtx`; testes existentes de PHY-56/CLEAN-27 cobrem App, overlay e hitTest. Chamadores lidos: `drawScene` em `paint` e draw.test; `paint` em `repaint`; `tensionArrows` em `paint` e overlay.test; `ropeAtPoint` em `onPointerDown` e hitTest.test. Casos de borda: leituras vazias, id diferente, leitura sem path, mola, referência pendente, options ausentes e seleção ausente. Red antes de produção: `npx vitest run src/scene/ropePath.test.ts src/render/draw.test.ts`: 2 arquivos falharam, 7 testes falharam / 40 passaram (47). Os três novos de currentPath falharam com `TypeError: currentPath is not a function`; seleção falhou com `expected [ undefined ] to include '#ff8c00'`; os três PHY-56 de caminho simulado falharam com a nova assinatura. Nenhuma tolerância ou texto existente alterado.

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir da recomendação 5 do relatório `docs/relatorios/2026-10-02-sweatshop-sonnet-5.5-opus-5.5-2`. Depois do PHY-56 e do CLEAN-27, a mesma escolha "caminho que o simulador resolveu, senão o `scenePath` do documento" está escrita três vezes: `src/render/draw.ts:317` e `src/editor/hitTest.ts:97` (`(reading?.kind === 'rope' ? reading.path : undefined) ?? scenePath(scene, …)`) e `src/render/overlay.ts:134` (`state.path ?? scenePath(view, rope)`). A guarda do editor (`[]` sem `states`) também aparece duas vezes em `src/App.tsx` (`paint` e `onPointerDown`). As revisões do PHY-56 e do CLEAN-27 anotaram as duas coisas sem bloquear. A revisão do PHY-56 também apontou que `drawScene` (`src/render/draw.ts:181`) passou a ter 8 argumentos posicionais; a chamada em `src/App.tsx:198` já passa `undefined` para chegar aos dois últimos. Cabe ao stage 1 decidir onde a escolha do caminho mora (provavelmente ao lado de `scenePath`, em `src/scene/ropePath.ts`), se a guarda do editor vira uma variável só, e se `drawScene` ganha um objeto de opções neste ticket ou fica para outro.
- 2026-10-02 Stage 1. Lido em volta: `src/scene` não importa nada de `src/sim` (zero ocorrências), e `eslint.config.js:15-19` proíbe import de valor de `sim` fora de `src/sim/**` (Rapier no chunk de entrada, PHY-32), então a função não pode morar em `simulator.ts`. `style` de `drawScene` nunca é passado por chamador nenhum em `src/` (produção ou teste; `drawGrid` idem, `transform.test.ts:113`). O anel de seleção (`#ff8c00`) não tem teste em `draw.test.ts` nem em `App.test.ts`. `paint` tem um chamador só (`repaint`, `App.tsx:760`). Os greps da Verification acham hoje exatamente as linhas que o ticket remove (`App.tsx:197` e `:1321`). Nada commitado.
- 2026-10-02 Bruno decidiu: a função chama-se `currentPath(scene, rope, readings)`.
- 2026-10-02 Bruno decidiu: o objeto de opções de `drawScene` entra neste ticket, `drawScene(ctx, scene, camera, width, height, opts?: { selection?, readings? })`, com a chave `readings`, mais o teste de `selection`.
- 2026-10-02 Proxy decided: `currentPath` mora em `src/scene/ropePath.ts` ao lado de `scenePath`, com `readings: readonly { id: string; path?: RopePath }[]` estrutural e sem import de `sim` — `ConstraintState[]` cabe nele (`RopeState.path?`, `SpringState` sem `path`), `scene` continua sem depender de `sim` como o CLEAN-26 recusou, e os ids são únicos, então não há teste de `kind`.
- 2026-10-02 Proxy decided: `readings` obrigatório, sem valor padrão — `scenePath(scene, rope)` continua sendo o caminho do documento explícito, e um padrão deixaria um chamador esquecer as leituras em silêncio; reversível numa linha.
- 2026-10-02 Proxy decided: `style` sai de `drawScene` (usa `DEFAULT_STYLE` por dentro); `drawGrid` fica com o seu — nenhum chamador passa um; barato de repor.
- 2026-10-02 Proxy decided: a guarda vira uma função de módulo em `App.tsx` usada pelo `paint` e pelo `onPointerDown`, com o comentário do PHY-56/CLEAN-27 em cima — tirar a guarda mantendo o `constraintsRef` fresco mudaria comportamento (leituras velhas durante um arrasto em t = 0, e `elasticArrows` quer as leituras sem guarda), fora do escopo de um CLEAN; deixar as duas ternárias mantém a duplicação que o ticket existe para tirar.
- 2026-10-02 Proxy decided: `Blocked by: none` — o loop roda um ticket por vez; os testes do CLEAN-29 ficam noutro bloco de `ropePath.test.ts`, no pior caso um conflito textual dentro de Primary files dos dois, que o stage 3 resolve por regra.
- 2026-10-02 Proxy decided: `Difficulty: normal`, `Review: agent`, um ticket só — extração mecânica atrás de testes existentes nos três chamadores; sem numérica nem concorrência; reversível.
- 2026-10-02 Proxy decided: registrar M1–M5, cada uma num `npx vitest run` só contra o mutante listando os testes vermelhos por arquivo, e um critério de que M1 e M2 deixam vermelho pelo menos um teste em cada um de `draw.test.ts`, `hitTest.test.ts` e `overlay.test.ts` — o ticket promete que a escolha é feita num lugar só; um arquivo de chamador que fica verde com a função quebrada ainda tem a sua própria cópia.
- 2026-10-02 Proxy decided: os docblocks dos três chamadores ficam como estão, sem critério — descrevem comportamento que continua verdadeiro; o stage 3 conserta qualquer um que ficar velho como conserto de docs.

- 2026-10-02 Attempt 1 stopped to ask (its commits are on branch `clean-28-asked-20261002-1506`): CLEAN-28 implementado na branch `clean-28`: `currentPath`, guarda única do editor e opções de `drawScene`. /  / Passaram **938 testes**, lint, typecheck e build. M1–M5 detectadas e registradas. Árvore limpa. /  / Ficou `blocked`: duas expectativas de M2 contradizem os testes existentes. Recomendo corrigir essas expectativas no ticket, preservando os testes. Autoriza esse ajuste? /  / A pausa segue [`ticket-flow`](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md): “a committed test proves the contract wrong”.
- 2026-10-02 Proxy decided: corrigir as duas expectativas de M2 no critério 6 (draw `constraints with no entry…` e App CLEAN-27 depois de reiniciar ficam verdes por construção) registrando o que de fato fica vermelho, sem tocar em teste existente — M2 mata 20 testes, incluindo pelo menos um em draw, overlay e hitTest (critério 7) e a presença do caminho do documento em App (PHY-56 teste 1, no editor e depois de reiniciar); o fallback já está fixado por `currentPath` 1.2, `without constraints…` e o laço do CLEAN-27 em hitTest, então reforçar (a) duplicaria `without constraints…` e reforçar (b) violaria o critério 5; texto de ticket é reversível. Retomar da branch `clean-28-asked-20261002-1506`: só o ticket muda (este bullet, Stage), sem tocar em código nem teste.

#### Stage 2 mutation evidence (2026-10-02)

Each mutation was applied to production, run in one command, then reverted in finally to the original bytes before the next mutation. CASE = M1, M2, M3, M4, M5-selection, M5-readings.

```text
npx vitest run src/scene/ropePath.test.ts src/render/draw.test.ts src/render/overlay.test.ts src/editor/hitTest.test.ts src/App.test.ts --reporter=json --outputFile=<TEMP>/physisyst-clean28-evidence/CASE.json
```

All observed failures and their actual first error lines follow. All other tests passed without skips. M1 and M2 each fail at least one test in draw, overlay and hitTest (criterion 7).

##### M1

`currentPath` always returns `scenePath(scene, rope)`, ignoring readings.

Exit 1: 9 failed / 190 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/App.test.ts | desenho da corda durante o playback (PHY-56) no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento | AssertionError: expected false to be true // Object.is equality |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) CLEAN-27: o clique na corda segue o caminho do simulador só depois do primeiro passo, e reiniciar volta ao documento | AssertionError: expected undefined to be defined |
| src/editor/hitTest.test.ts | pulleyAtPoint and ropeAtPoint (PHY-28) CLEAN-27: a rope whose state has a path is tested against that path, and other cases fall back to the scene path | AssertionError: expected undefined to be 'r1' // Object.is equality |
| src/scene/ropePath.test.ts | scenePath: rope path from document poses currentPath (CLEAN-28) returns the same path object from the matching reading | AssertionError: expected { …(3) } to be { segments: [ { …(2) } ], …(2) } // Object.is equality |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a loose pulley (sweep < 0) is drawn as the two straight legs of the path, with no arc and nothing at the scenePath tangents | AssertionError: expected [ [ 5.5, 2 ], [ 6.5, 6 ] ] to strictly equal [ [ 5.5, 2 ], [ 6, 2 ] ] |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a wrap of 7 rad (direction 1) is one arc call that spans 7 rad; a wrap of 0 is one arc call that spans nothing | AssertionError: expected -3.141592653589793 to be close to 7, received difference is 10.141592653589793, but expected 5e-13 |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a wrap of 7 rad (direction -1) is one arc call that spans 7 rad; a wrap of 0 is one arc call that spans nothing | AssertionError: expected -3.141592653589793 to be close to -7, received difference is 3.858407346410207, but expected 5e-13 |

| src/render/overlay.test.ts | tensionArrows with the path of the reading (PHY-56) the end arrows follow the path legs, not the scenePath around a pulley off the a–b line | AssertionError: expected -0.07453559924999299 to be close to 0.4472135954999579, received difference is 0.521749194749951, but expected 5e-10 |
| src/render/overlay.test.ts | tensionArrows with the path of the reading (PHY-56) a loose pulley on a dynamic mount gets no arrow, and the ends follow the end legs of the path | AssertionError: expected [ …(4) ] to have a length of 2 but got 4 |

##### M2

`currentPath` returns `readings.find(...)?.path ?? null`, without fallback.

Exit 1: 20 failed / 179 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/App.test.ts | ferramentas Polia e Corda (PHY-28) inspetor da polia edita raio e massa; inspetor da corda mostra o caminho e L sem campo editável | TypeError: Cannot read properties of undefined (reading 'textContent') |
| src/App.test.ts | ferramentas Polia e Corda (PHY-28) remover polia remove as cordas que passam por ela; Ctrl+Z restaura tudo de uma vez | AssertionError: expected undefined to be defined |
| src/App.test.ts | ferramentas Polia e Corda (PHY-28) remover corpo remove as polias montadas nele, as molas presas e as cordas pelas polias; Ctrl+Z restaura tudo de uma vez | AssertionError: expected undefined to be defined |
| src/App.test.ts | ferramentas Polia e Corda (PHY-28) clicar na corda seleciona; Delete remove só a corda | AssertionError: expected undefined to be defined |
| src/App.test.ts | ferramentas Polia e Corda (PHY-28) com polia de massa no caminho, a leitura mostra T₁, T₂ por segmento | AssertionError: expected '' to contain 'T₁: 12.00 N' |
| src/App.test.ts | edição estrutural só em t0 (PHY-39) desabilita o inspetor de vínculos e polias de atwood | AssertionError: expected undefined to be defined |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento | AssertionError: expected false to be true // Object.is equality |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) uma leitura velha, com um caminho de um segmento só, não derruba o paint e a corda sai do documento | AssertionError: expected false to be true // Object.is equality |
| src/editor/hitTest.test.ts | pulleyAtPoint and ropeAtPoint (PHY-28) hits a rope within the tolerance of any straight leg, and misses beside it and past its ends | AssertionError: expected undefined to be 'r1' // Object.is equality |
| src/editor/hitTest.test.ts | pulleyAtPoint and ropeAtPoint (PHY-28) CLEAN-27: a rope whose state has a path is tested against that path, and other cases fall back to the scene path | AssertionError: expected undefined to be 'r1' // Object.is equality |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) without constraints, the rope is drawn from the scenePath of the scene | AssertionError: expected [] to strictly equal [ [ 5.5, 2 ], [ 6.5, 6 ] ] |
| src/render/overlay.test.ts | tensionArrows Atwood: one T per dynamic end, at the anchor, toward the next path point; none on the fixed pulley | AssertionError: expected [] to have a length of 2 but got +0 |
| src/render/overlay.test.ts | tensionArrows straight rope between two dynamic bodies: each end pulled toward the other | AssertionError: expected [] to have a length of 2 but got +0 |
| src/render/overlay.test.ts | tensionArrows movable pulley: one arrow per adjacent segment at the pulley center; fixed ends get none | AssertionError: expected [] to have a length of 2 but got +0 |
| src/render/overlay.test.ts | tensionArrows pulley with mass: each end sized by its own segment tension | AssertionError: expected [] to have a length of 2 but got +0 |
| src/render/overlay.test.ts | vectorLabels one of each kind: the bare symbol from the table, per language | AssertionError: expected [ 'P', 'N', 'F', 'F_el', 'v₀' ] to deeply equal [ 'P', 'N', 'F', 'T', 'F_el', 'v₀' ] |
| src/render/overlay.test.ts | vectorLabels the same rope carries the same T at both ends | AssertionError: expected [] to deeply equal [ 'T', 'T' ] |
| src/render/overlay.test.ts | vectorLabels pulley with mass: one T per segment | AssertionError: expected [] to deeply equal [ 'T_1', 'T_2' ] |
| src/render/overlay.test.ts | vectorLabels two ropes number apart; a slack rope loses its arrows and its label | AssertionError: expected [] to deeply equal [ 'T_1', 'T_1', 'T_2', 'T_2' ] |
| src/scene/ropePath.test.ts | scenePath: rope path from document poses currentPath (CLEAN-28) falls back to the document path without a matching path, including spring readings | AssertionError: expected null to strictly equal { …(3) } |

##### M3

`ropeReadingsOf` returns readings without checking states.

Exit 1: 3 failed / 196 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/App.test.ts | desenho da corda durante o playback (PHY-56) no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento | AssertionError: expected true to be false // Object.is equality |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) uma leitura velha, com um caminho de um segmento só, não derruba o paint e a corda sai do documento | AssertionError: expected [ …(1) ] to strictly equal [] |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) CLEAN-27: o clique na corda segue o caminho do simulador só depois do primeiro passo, e reiniciar volta ao documento | AssertionError: expected <fieldset …(1)>…(4)</fieldset> to be undefined |

##### M4

`ropeReadingsOf` always returns `[]`.

Exit 1: 2 failed / 197 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/App.test.ts | desenho da corda durante o playback (PHY-56) no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento | AssertionError: expected false to be true // Object.is equality |
| src/App.test.ts | desenho da corda durante o playback (PHY-56) CLEAN-27: o clique na corda segue o caminho do simulador só depois do primeiro passo, e reiniciar volta ao documento | AssertionError: expected undefined to be defined |

##### M5-selection

`drawScene` uses `const selection: Selection = null`, ignoring opts.selection.

Exit 1: 1 failed / 198 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/render/draw.test.ts | drawScene options (CLEAN-28) draws the orange selection outline only when the body is selected | AssertionError: expected [ '#000000' ] to include '#ff8c00' |

##### M5-readings

`drawScene` passes `[]` to drawConstraints, ignoring opts.readings.

Exit 1: 4 failed / 195 passed (199 tests).

| File | Failing test | Actual red output |
|---|---|---|
| src/App.test.ts | desenho da corda durante o playback (PHY-56) no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento | AssertionError: expected false to be true // Object.is equality |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a loose pulley (sweep < 0) is drawn as the two straight legs of the path, with no arc and nothing at the scenePath tangents | AssertionError: expected [ [ 5.5, 2 ], [ 6.5, 6 ] ] to strictly equal [ [ 5.5, 2 ], [ 6, 2 ] ] |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a wrap of 7 rad (direction 1) is one arc call that spans 7 rad; a wrap of 0 is one arc call that spans nothing | AssertionError: expected -3.141592653589793 to be close to 7, received difference is 10.141592653589793, but expected 5e-13 |
| src/render/draw.test.ts | drawScene, rope path (PHY-56) a wrap of 7 rad (direction -1) is one arc call that spans 7 rad; a wrap of 0 is one arc call that spans nothing | AssertionError: expected -3.141592653589793 to be close to -7, received difference is 3.858407346410207, but expected 5e-13 |

- M2: o teste draw `constraints with no entry for the rope, or only spring states, draw the scenePath` fica verde: seu expected é `ropeLog(draw())`, que também fica vazio com o mutante. O teste draw `without constraints...` compara contra a geometria real e fica vermelho. O teste CLEAN-27 de App também fica verde com M2: no editor e depois de reset ele só exige que o ponto do path simulado não selecione, o que também vale quando nenhuma corda é desenhada/testada; a presença do path do documento está coberta pelos dois testes PHY-56 de App, vermelhos com M2. Não são mutantes sobreviventes (20 testes falham), mas duas expectativas individuais do critério 6 não correspondem às assertions existentes.
- M3: o teste da leitura velha falha na assertion `expect(errors).toStrictEqual([])` (`App.test.ts:2313`), observando o erro lançado pelo paint quando a leitura de um só segmento entra em tensionArrows.
- Após restaurar todas as mutações: `npx vitest run src/scene/ropePath.test.ts src/render/draw.test.ts src/render/overlay.test.ts src/editor/hitTest.test.ts`: 4 arquivos, 104 testes passaram. `npx vitest run src/App.test.ts -t "PHY-56|CLEAN-27"`: 1 arquivo, 3 passaram / 92 não selecionados (95).
- Verificação estrutural: zero `scenePath` nos três chamadores; exatamente uma ocorrência de `?? scenePath(` em src, no retorno de currentPath; zero ternárias antigas de states em App. `elasticArrows` segue recebendo `constraints = opts?.constraints ?? []`, sem guarda; drawGrid preservado. Para cumprir o grep literal do critério 2, somente as menções `scenePath` dos comentários de draw/overlay foram substituídas por document path/poses, sem alterar o comportamento descrito; o ADR não foi alterado.
- Gate final, sem mutantes: `npm test && npm run lint && npm run typecheck && npm run build` (executado com condicionais de exit code equivalentes no PowerShell): 30 arquivos / 938 testes passaram; ESLint e TypeScript exit 0; Vite build exit 0, 49 módulos. Aviso de tamanho do chunk sim (2.135,04 kB), sem erro. `git diff --check` passou. Diff restrito aos Primary files e ao ticket; nenhum teste alterado depois do commit red `542e2e2`, nenhum artefato gerado incluído.
- Bloqueio de contrato, não de implementação: o critério 6 prevê que M2 deixe vermelhos o teste relativo de draw `constraints with no entry...` e o CLEAN-27 de App depois de reiniciar, mas ambos ficam verdes por construção das assertions (explicação acima). O critério 5 proíbe alterar esses testes. Pergunta pendente ao Bruno: corrigir essas duas expectativas no ticket e preservar os testes (recomendado; M2 já mata 20 testes, incluindo os três chamadores e a presença do path do documento em App), ou ampliar os testes e ajustar o escopo? Nenhuma expectativa foi reescrita sem decisão. Card proxy encontrado em `~/.claude/agents/proxy.md`, modelo opus/xhigh, indisponível como modelo de subagente neste runtime; usada a saída de bloqueio do ticket-flow, sem linha Proxy decided. A implementação e toda a validação ficam preservadas na branch `clean-28`; após a decisão, retomar para registrar o ajuste autorizado e mover a `to-review`.

- 2026-10-02 Proxy decided: corrigir as duas expectativas de M2 no critério 6 (draw `constraints with no entry…` e App CLEAN-27 depois de reiniciar ficam verdes por construção) registrando o que de fato fica vermelho, sem tocar em teste existente — M2 mata 20 testes, incluindo pelo menos um em draw, overlay e hitTest (critério 7) e a presença do caminho do documento em App (PHY-56 teste 1, no editor e depois de reiniciar); o fallback já está fixado por `currentPath` 1.2, `without constraints…` e o laço do CLEAN-27 em hitTest, então reforçar (a) duplicaria `without constraints…` e reforçar (b) violaria o critério 5; texto de ticket é reversível. Retomar da branch `clean-28-asked-20261002-1506`: só o ticket muda (este bullet, Stage), sem tocar em código nem teste.

- 2026-10-02 Stage 2 retomado na branch `clean-28-asked-20261002-1506`, conforme a decis?o j? registrada no commit `59f5784` da base da sess?o. Corrigido apenas o texto de M2 no crit?rio 6 e incorporada a decis?o acima; produ??o e testes preservados byte a byte. O bloqueio anterior est? resolvido. Evid?ncia red e M1?M5 permanece nos commits `542e2e2`, `b1c3b4b` e `4dff4e0`; nenhum teste foi alterado ap?s o commit red. Verifica??o atual: 4 arquivos / 104 testes passaram; App PHY-56/CLEAN-27: 3 passaram / 92 n?o selecionados; greps dos crit?rios 2 e 3 conforme esperado, `elasticArrows` sem guarda e `drawGrid` preservado. Gate completo: 30 arquivos / 938 testes passaram, lint exit 0, typecheck exit 0, build exit 0 (49 m?dulos). Permanece o aviso de tamanho do chunk sim (2.135,04 kB). `git diff --check` passou. Entrega para stage 3, sem revis?o nem merge nesta retomada.
