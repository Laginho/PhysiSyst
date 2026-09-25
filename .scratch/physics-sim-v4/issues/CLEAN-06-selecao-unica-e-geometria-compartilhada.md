# CLEAN-06: Seleção como um valor só e geometria de corpo compartilhada entre os módulos do editor
Stage: done
Status: ready-for-agent
Blocked by: PHY-28
Review: agent

- Primary files:
  - `src/App.tsx`, `src/App.test.ts` (só a seleção e o `paint`; nenhum gesto novo)
  - `src/editor/anchorSnap.ts`, `src/editor/hitTest.ts`, `src/editor/contactSnap.ts`, `src/editor/handles.ts` e seus testes
  - `src/render/draw.ts` (só o nome de `drawRopes`)

#### What to build

O review do PHY-27 (2026-09-24) achou, fora do contrato daquele ticket, cinco resíduos de forma. Nenhum muda comportamento; a suíte existente prova cada um.

1. A seleção no `App.tsx` são duas strings anuláveis, `selectedId` e `selectedSpringId`, com o invariante "uma limpa a outra" mantido à mão em seis lugares (o próprio comentário do código admite). O drop na lixeira em `onPointerUp` limpa só o id do corpo. O PHY-28 acrescenta polia e corda como selecionáveis, e o invariante vira oito lugares. Uma união discriminada `selection: { kind: 'body' | 'spring' | …; id } | null`, um setter, um ref.
2. `base · tan(α)` é calculado num `switch (body.shape)` em sete módulos (`anchorSnap`, `hitTest`, `handles`, `contactSnap`, `draw`, `simulator`, `codec`). Um `triangleHeight(body)` no `scene`, usado nos do editor pelo menos.
3. `candidates()` do `anchorSnap` repete os vértices de `polygonVertices` do `contactSnap`; `distanceToSegment` do `hitTest` repete `closestPoint` do `contactSnap`; a busca do mais próximo dentro da tolerância no `anchorSnap` tem a forma de `pickHandle`. Um lugar para cada.
4. `drawRopes` desenha e destaca molas desde o PHY-26/27. Renomear (`drawConstraints`).
5. `springToolRef` sincroniza por um setter embrulhado; todos os outros refs do `App.tsx` sincronizam num `useEffect`. Escolher um. `updateSpring` e `removeConstraint` sem comentário de doc; o ponto da âncora pendente e o anel da pega da força no `paint` são o mesmo bloco save/arc/restore duas vezes.

Bloqueado pelo PHY-28 porque ele mexe nos mesmos lugares (seleção, `hitTest`, `drawRopes`) e a extração fica melhor com os três vínculos no lugar.

#### Acceptance criteria

1. Uma única seleção no `App.tsx`; nenhum par `setSelectedId(x); setSelectedSpringId(null)` sobrevive; o drop na lixeira limpa a seleção seja ela qual for
2. `base · tan(α)` calculado num lugar só de `src/editor` e `src/render`
3. Vértices de polígono, distância a segmento e "mais próximo dentro da tolerância" existem uma vez cada em `src/editor`
4. `drawRopes` não existe mais com esse nome
5. Um só padrão de sincronia de ref no `App.tsx`; os dois blocos de desenho do `paint` viram uma função
6. `npm test` com os mesmos números de antes; gate verde

#### Verification

    npx vitest run src/editor src/render src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: refactor sem efeito observável. Se o critério 1 pedir um teste (lixeira limpando uma seleção de vínculo), ele vai no `App.test.ts` no espelho do pointer.

## Comments

- 2026-09-24 Aberto pelo review do PHY-27 (stage 3). Nenhum item é critério daquele ticket, então o PHY-27 fechou como está.
- 2026-09-24 (review do PHY-28, stage 3) O PHY-28 fechou; a seleção agora são três ids (`selectedId`, `selectedConstraintId`, `selectedPulleyId`) e o `paint`/`drawScene` levam os três. Resíduos de forma achados lá, nos mesmos arquivos deste ticket, para o stage 1 dobrar no corpo se quiser: (a) o traço de seleção `lineWidth = 3 / ppm; strokeStyle = '#ff8c00'` aparece quatro vezes em `draw.ts` (corpo, mola, polia, corda); (b) `tool.kind` é despachado em `onToolClick`, no ternário da linha de dica e via o parâmetro `selects` de `finishTool`, que se deriva da ferramenta; (c) a legenda da leitura avalia `selected ?? selectedConstraint ?? selectedPulley` duas vezes; (d) `'a' in toolRef.current` onde a união já tem discriminante; (e) `click`/`panel`/`field`/`setup` do bloco PHY-28 do `App.test.ts` repetem os do bloco PHY-27, só a semente muda.
- 2026-09-24 (stage 2) Proxy decided: `triangleHeight` fica em `src/editor/handles.ts` (ao lado do inverso `alphaFromLocal`) e `src/render/draw.ts` importa de lá, não no `scene` — o item 2 pede `scene`, mas nenhum arquivo de `src/scene` está nos Primary files e o critério 2 só pede um lugar em `src/editor` + `src/render` (precedente: `overlay.ts` já importa `localToWorld` de `handles`). Mover para o `scene` e adotar em `simulator`/`codec` fica para um CLEAN futuro.
- 2026-09-24 (stage 2) Proxy decided: os comentários de doc de `updateSpring` e `removeConstraint` (item 5) não foram feitos — `src/editor/doc.ts` está fora dos Primary files e nenhum critério os nomeia. Stage 1 pode dobrá-los num ticket que tenha `doc.ts`.
- 2026-09-24 (stage 2) Implementação, commit `c1dba73`:
  - Critério 1: `selection: { kind: 'body' | 'constraint' | 'pulley'; id } | null`, um `setSelection`, um `selectionRef`; `selectedOf(selection, kind)` deriva os três ids só para leitura (`paint`, inspetores, leitura). Constraint cobre mola e corda, como o `selectedConstraintId` do PHY-28. `deleteSelected` despacha por `kind`. `drawScene` mantém a assinatura (fora do escopo de `draw.ts`).
  - Critério 2: `triangleHeight` em `handles.ts`, usado por `anchorSnap` (via `localVertices`), `contactSnap`, `hitTest`, `handles` e `draw` (caminho e âncora do rótulo). `simulator`, `codec` e `presets` mantêm o seu.
  - Critério 3: `localVertices` e `closestPoint(p, a, b)` (com a guarda de segmento nulo que era do `hitTest`) no `contactSnap`; `nearestWithin` no `handles`, usado por `pickHandle` e `anchorSnap`. `candidates()` agora sai dos vértices: centro = média dos vértices (exato em ponto flutuante para retângulo e triângulo), pontos médios das faces, vértices. `contactSnap` usa `bodyPointToWorld` do `scene` no lugar do seu `localToWorld` privado.
  - Critério 4: `drawConstraints`.
  - Critério 5: `setTool` embrulhado virou `useState` puro; `toolRef` sincroniza no mesmo `useEffect` do `selectionRef`. Os dois blocos save/arc/restore do `paint` são `screenCircle`.
  - Critério 6: `npm test` 30 arquivos / 642 testes antes e depois; lint, typecheck e build verdes.
- 2026-09-24 (stage 2) Mutate-verify (nenhum teste novo; a suíte existente é a prova, `npx vitest run src/editor src/render src/App.test.ts`):
  - `triangleHeight` × 1.01 → 6 vermelhos (anchorSnap centroide/vértices/pontos médios do triângulo, contactSnap face inclinada, handles α na hipotenusa, draw rótulo M no centroide).
  - `closestPoint` com `t` sempre 0 → 14+ vermelhos (contactSnap, clique em mola/corda no App). Com `t` limitado a 0.9 fica verde, e a 0.5 só 2 vermelhos no contactSnap: o `hitTest` de mola/corda é pego só pelo App.
  - `nearestWithin` sem `bestD = d` → 1 vermelho (anchorSnap "the nearest candidate wins").
  - `toolRef.current = tool` removido → 6+ vermelhos (ferramenta Mola, PHY-27). `selectionRef.current = selection` removido → 6+ vermelhos (Backspace, Delete de mola/corda/polia, leitura da mola).
  - `deleteSelected` com o despacho trocado → 3 vermelhos (Delete só a mola, só a corda, remover corpo).
  - Verdes, equivalentes na prática: `selectedOf` ignorando `kind` (ids são únicos entre corpos, vínculos e polias, então um id do tipo errado não acha nada); e o `setSelection(null)` do drop na lixeira removido — o corpo sai do doc, então a seleção órfã não aparece; só um Ctrl+Z logo depois o traria de volta já selecionado. Nenhum teste novo: o código já cumpre o critério 1, um teste agora nasceria verde e não vermelho, e o critério 6 fixa a contagem. Se o stage 3 quiser o pino, é um teste de lixeira + Ctrl+Z no espelho do pointer.
  - Notas do review do PHY-28 (a)–(e) não dobradas no corpo: continuam notas, não feitas.

#### Resolution (2026-09-24)

Verdict: Approve

Review (stage 3) sobre `c1dba73` + fix próprio `eac63c8`, base `sweatshop/2026-09-24-1853`, dois eixos (Standards + Spec) em sub-agentes. Diff só nos Primary files; o commit de código não toca teste; nenhum teste novo, como o ticket previa.

- Critério 1 ✅ Nenhum `setSelected*Id` sobrevive; o drop na lixeira chama `setSelection(null)` seja qual for a seleção. `deleteSelected` despacha por `kind`, equivalente porque só há uma seleção.
- Critério 2 ✅ Um `Math.tan` sobre `alpha` em `src/editor` + `src/render` (`handles.triangleHeight`). `simulator`, `codec` e `presets` mantêm o seu, como o proxy decidiu.
- Critério 3 ✅ Um `lengthSquared` (`contactSnap.closestPoint`, que ganhou a guarda de segmento nulo do `hitTest`), um `bestD` (`handles.nearestWithin`), um conjunto de vértices (`contactSnap.localVertices`). `candidates()` do `anchorSnap` conferido à mão: os mesmos 9 pontos do retângulo e 7 do triângulo; só a ordem dos pontos médios do retângulo mudou, o que só importa num empate exato de distância (medida zero).
- Critério 4 ✅ `drawRopes` não existe em `src/`.
- Critério 5 ❌→✅ (fix do stage 3, `eac63c8`) `setTool` embrulhado virou `useState` e `toolRef` sincroniza no `useEffect`, mas o checkbox de vetores ainda escrevia `showGlobalRef.current` e chamava `repaint()` à mão, e o efeito `[doc, showGlobal]` já faz os dois. Handler virou `setShowGlobal` puro: dentro dos Primary files, sem teste novo. `screenCircle` substitui os dois blocos save/arc/restore na mesma ordem de chamadas.
- Critério 6 ✅ Gate antes e depois do fix: 30 arquivos / 642 testes; lint, typecheck e build verdes.
- `toolRef` sincronizando no efeito em vez do setter: todos os leitores estão em handlers de eventos discretos, e o React descarrega efeitos passivos antes do próximo evento discreto. Sem mudança observável; o mutate-verify do stage 2 (`toolRef.current = tool` removido → 6+ vermelhos) fixa o efeito.
- Proxy decided (stage 2): `triangleHeight` em `src/editor/handles.ts`, não no `scene`. Aceito no critério 2 como escrito; o efeito colateral (`src/render/draw.ts` importa de `src/editor`, e `handles` importa de `src/render/transform`: dependência bidirecional entre diretórios, com `handles.localToWorld` duplicando `scene.bodyPointToWorld`) vai para o CLEAN-07.
- Proxy decided (stage 2): comentários de doc de `updateSpring`/`removeConstraint` não feitos (`doc.ts` fora dos Primary files). Nenhum critério os nomeia; vai para o CLEAN-07.
- Fora do contrato, em CLEAN-07: `drawScene` ainda recebe três ids derivados da união; as notas (a)–(e) do review do PHY-28.
- Juízos (smells de baseline), sem ação: `screenCircle` alterna fill/stroke pela presença de `strokeWidth` (dois chamadores, tolerável); `distanceToSegment` e `worldToLocal` do `hitTest` são wrappers de uma linha.

Gate (`npm test && npm run lint && npm run typecheck && npm run build`, sobre `eac63c8`): Test Files 30 passed (30), Tests 642 passed (642); eslint limpo; tsc limpo; vite build ok.

Merge: `0076dc1` (`--no-ff`) na `sweatshop/2026-09-24-1853`. Ledger: esta data, CLEAN-06.
