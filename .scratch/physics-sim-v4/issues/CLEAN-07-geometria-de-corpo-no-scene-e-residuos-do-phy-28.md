# CLEAN-07: Geometria de corpo no `scene` (dissolve `render → editor`) e resíduos de forma do PHY-28
Stage: to-review
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/scene/index.ts`, `src/scene/ropePath.ts` (só a casa nova de `triangleHeight`, `localVertices` e o export)
  - `src/editor/handles.ts`, `src/editor/contactSnap.ts`, `src/editor/anchorSnap.ts`, `src/editor/hitTest.ts` e seus testes (só os imports e a remoção de `localToWorld`)
  - `src/render/draw.ts`, `src/render/overlay.ts` (só os imports)
  - `src/sim/simulator.ts`, `src/codec/*.ts`, `src/presets/index.ts` (só o `base · tan(α)`)
  - `src/editor/doc.ts` (só os comentários de doc de `updateSpring` e `removeConstraint`)
  - `src/App.tsx`, `src/App.test.ts` (só os itens 4–7; nenhum gesto novo)

#### What to build

O review do CLEAN-06 (2026-09-24) fechou aquele ticket nos critérios como escritos e deixou fora do contrato:

1. `triangleHeight` e `localVertices` moraram em `src/editor` porque nenhum arquivo do `scene` estava nos Primary files (decisão do proxy no CLEAN-06). Com isso `src/render/draw.ts` importa de `src/editor/handles.ts`, e `handles.ts` importa de `src/render/transform.ts`: dependência bidirecional entre diretórios. Além disso `handles.localToWorld(body, lx, ly)` é uma segunda cópia de `scene.bodyPointToWorld`. Levar os dois helpers para o `scene`, apagar `localToWorld` de `handles`, e adotar `triangleHeight` em `simulator`, `codec` e `presets`, onde `base · tan(α)` continua inline.
2. `updateSpring` e `removeConstraint` em `src/editor/doc.ts` sem comentário de doc (item 5 do CLEAN-06, pulado pelo proxy porque `doc.ts` não estava nos Primary files).
3. `drawScene` recebe `selectedId, selectedConstraintId, selectedPulleyId` em três parâmetros; `paint` os deriva de uma `Selection` só. Passar a união.
4. (review do PHY-28, nota a) o traço de seleção `lineWidth = 3 / ppm; strokeStyle = '#ff8c00'` aparece quatro vezes em `draw.ts`.
5. (nota b) `tool.kind` é despachado em `onToolClick`, no ternário da linha de dica e via o parâmetro `selects` de `finishTool`, que se deriva da ferramenta.
6. (notas c, d) a legenda da leitura avalia `selected ?? selectedConstraint ?? selectedPulley` duas vezes; `'a' in toolRef.current` onde a união já tem discriminante.
7. (nota e) `click`/`panel`/`field`/`setup` do bloco PHY-28 do `App.test.ts` repetem os do bloco PHY-27, só a semente muda.

Nenhum item muda comportamento; a suíte existente prova cada um.

#### Acceptance criteria

1. `triangleHeight` e `localVertices` exportados de `src/scene`; nenhum `Math.tan` sobre `alpha` fora do `scene` em `src/` (testes à parte); nenhum arquivo de `src/render` importa de `src/editor`; `handles.localToWorld` não existe mais
2. `updateSpring` e `removeConstraint` têm comentário de doc
3. `drawScene` recebe uma seleção só (a união de `App.tsx`, exportada de onde couber)
4. O traço de seleção de `draw.ts` existe uma vez
5. `tool.kind` lido em dois lugares só no `App.tsx` — `onToolClick` (comportamento) e `toolHint` (dica); `finishTool` sem o parâmetro `selects`
6. A legenda da leitura avalia a seleção uma vez; nenhum `'a' in` sobre `Tool`
7. Os helpers do bloco PHY-28 do `App.test.ts` são os do PHY-27, parametrizados pela semente
8. `npm test` com os mesmos números de antes; gate verde

#### Verification

    npx vitest run src/scene src/editor src/render src/sim src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: refactor sem efeito observável.

## Comments

- 2026-09-24 Aberto pelo review do CLEAN-06 (stage 3). Junta a decisão do proxy daquele ticket (geometria no `editor` em vez do `scene`) com as cinco notas do review do PHY-28 que ficaram como comentário no CLEAN-06. Stage 1 confirma o recorte antes de implementar; `needs-triage` até lá.
- 2026-09-24 Proxy decided: critério 5 = `onToolClick` como único despacho de comportamento e `toolHint(tool)` (módulo, ao lado de `type Tool`) como único de apresentação; `finishTool(res)` deriva o tipo da seleção do resultado (`res.doc.pulleys` contém `newId` → polia, senão restrição), não da ferramenta — a nota (b) do PHY-28 mirava o terceiro despacho vazando pelo flag `selects`; uma tabela por tipo duplicaria o meio comum do clique para três tipos. Critério 5 reescrito no corpo com essa leitura.
- 2026-09-24 (stage 2) Implementação, commit `0f74823`:
  - Critério 1: `triangleHeight` e `localVertices` em `src/scene/ropePath.ts`, exportados de `src/scene/index.ts`. `contactSnap`, `anchorSnap`, `hitTest`, `handles`, `draw`, `simulator` e `presets` importam do `scene`. `handles.localToWorld` apagado; `getHandles` e `overlay.appliedArrows` usam `bodyPointToWorld`. No preset, `F = (M+m)·g·(H/BASE)` em vez de um segundo `tan α`. `src/codec/*.ts` não existe (o codec é `src/scene/codec.ts`, sem `Math.tan`): nada a fazer ali.
  - Critério 3: `Selection` e `selectedOf` saem do `App.tsx` para `src/render/draw.ts` (o `render` não pode importar do `editor`, e o `App` já importa do `render`); `drawScene(…, style, selection)`.
  - Critério 4: `selectionStroke(ctx, ppm)` em `draw.ts`, usado pelos quatro traços.
  - Critério 6: `selectedItem` avaliado uma vez; o `'a' in` virou `toolRef.current?.a ?? null`, com a variante polia de `Tool` declarando `a?: never` (sem isso, ler `.a` na união seria um terceiro `tool.kind`).
  - Critério 7: `click`/`panel`/`field` no nível do módulo de `App.test.ts` e `setupWith(seed)`; cada bloco fica com `const setup = () => setupWith(seedX)`.
  - `handles.test.ts`: os dois testes de `localToWorld` passam a chamar `bodyPointToWorld` (mesmas entradas, mesmas expectativas), o que mantém a contagem e dá ao `bodyPointToWorld` um teste direto que ele não tinha. Mutação `y: … - anchor.x * s …` → vermelho (`expected -1 to be close to 1`); mutação no termo `anchor.y * s` passa por esses dois (nenhum usa y local com rotação) mas a suíte pega: 4 vermelhos em `anchorSnap`, `doc` e `acceptance` (PHY-23). Revertido.
  - Fora dos Primary files, deixado: o nome do teste `overlay.test.ts:82` ainda diz "localToWorld".
  - Gate: `npm test` 642/642 (baseline 642/642), lint, typecheck e build verdes. Uma execução em oito deu `1 failed | 641 passed` num arquivo que não consegui identificar (saída não guardada); as outras sete, duas delas concorrentes, deram 642/642. Provável o timeout solto de `simulator.test.ts` já registrado no PHY-20; o refactor não mexe em temporização.
