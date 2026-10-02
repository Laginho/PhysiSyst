# CLEAN-28: o caminho da corda (simulado, senão o do documento) escolhido num lugar só
Stage: blocked
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
   - M2: `currentPath` devolve `readings.find(…)?.path ?? null`, sem fallback. Vermelho esperado: `ropePath.test.ts` (1.2); `draw.test.ts` (`without constraints…`, `constraints with no entry…`); `overlay.test.ts` (Atwood, straight rope, movable pulley, pulley with mass: o helper `ropeState` não tem `path`); `hitTest.test.ts` (`hits a rope within the tolerance…` e o laço de fallback do CLEAN-27); `App.test.ts` (PHY-56 testes 1 e 2 no `docTangent`, CLEAN-27 depois de reiniciar).
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
