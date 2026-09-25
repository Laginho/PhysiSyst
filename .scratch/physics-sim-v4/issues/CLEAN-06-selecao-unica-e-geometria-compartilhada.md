# CLEAN-06: Seleção como um valor só e geometria de corpo compartilhada entre os módulos do editor
Stage: to-implement
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
