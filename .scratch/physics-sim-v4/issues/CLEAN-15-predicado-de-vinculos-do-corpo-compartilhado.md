# CLEAN-15: Predicado "vínculos que tocam o corpo" compartilhado
Stage: done
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/editor/doc.ts` (`removeBodyAndDependents`, o filtro de constraints)
  - `src/playback/accelerationTracker.ts` (`isHeld`)
  - `src/scene/index.ts` (ou o módulo de `src/scene` onde o helper couber)
  - `src/playback/accelerationTracker.test.ts`

#### What to build

O PHY-38 escreveu em `isHeld` (`accelerationTracker.ts`) a regra "constraint que tem o corpo como ponta `a`/`b`, ou corda cuja `via` passa por uma polia montada no corpo". `removeBodyAndDependents` em `doc.ts` já escreve a mesma regra para decidir o que apagar com o corpo. Duas cópias: um novo `kind` de constraint, ou uma polia numa mola, tem de entrar nas duas, e quando uma falha o delete limpa um vínculo que a leitura ignora, ou o contrário.

Extrair um `constraintsOn(scene, id)` (ou predicado equivalente) em `src/scene` e usá-lo nos dois sítios. Sem mudança de comportamento.

#### Acceptance criteria

1. Uma única função em `src/scene` responde "esta constraint toca este corpo"; `doc.ts` e `accelerationTracker.ts` chamam-na
2. Os testes existentes de `doc.test.ts` e `accelerationTracker.test.ts` seguem verdes sem edição
3. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

#### Resolution (2026-09-25)

Verdict: Approve

Findings:

- Critério 1 ✅ — `constraintTouchesBody(scene, constraint, bodyId)` em `src/scene/ropePath.ts:155`, reexportado por `src/scene/index.ts`; `removeBodyAndDependents` (`doc.ts:104`) e `isHeld` (`accelerationTracker.ts:82`) chamam-no. Nenhuma cópia da regra sobrou nos dois callers; `removePulleyAndDependents` (`doc.ts:289`) é outro predicado ("corda passa por esta polia"), fora do ticket.
- Critério 2 ✅ — `git diff sweatshop/2026-09-24-1853...HEAD --stat` não toca nenhum `*.test.ts`. Mutação registada pelo stage 2 reproduzida no review (`&& false` no ramo da polia): `3 failed | 61 passed` nos dois arquivos, os mesmos três testes; revertida, árvore limpa.
- Critério 3 ✅ — gate verde em `051f1e4` (já sobre a ponta da session, sem rebase): 30 arquivos, 714 testes; lint, typecheck e build limpos.
- Comportamento preservado — comparação linha a linha nos dois callers: `doc.pulleys` undefined, `via` com id de polia inexistente, corpo que é ponta e montagem ao mesmo tempo, tudo igual. A única diferença estrutural (`.some` aninhado em vez de Set/Map) só divergiria com ids de polia duplicados, que o codec rejeita; custo irrelevante nos tamanhos de cena do app.
- Primary files ✅ — `ropePath.ts` cabe na cláusula "o módulo de `src/scene` onde o helper couber": é o módulo de helpers de cena (`scenePath`, `bodyPointToWorld`). Um commit só, como o ticket previa.
- Standards: sem violação; smell leve (julgamento) de que `ropePath.ts` diz "pure rope geometry" no cabeçalho e já hospeda helpers gerais de cena — renomear fica fora deste ticket, sem CLEAN por ora.
- Regressão: nenhuma.

Files: `src/scene/ropePath.ts`, `src/scene/index.ts`, `src/editor/doc.ts`, `src/playback/accelerationTracker.ts`.

Merge: `c63e121` na session `sweatshop/2026-09-24-1853`.

## Tests stage 2 writes (own commit, red)

- Nenhum: refactor sem mudança observável; os testes existentes dos dois callers pinam o comportamento. Um commit só.

## Comments

- 2026-09-25 Aberto pelo review do PHY-38 (stage 3): achado fora dos Primary files daquele ticket (`doc.ts`).
- 2026-09-25 Duas notas do mesmo review, fora dos critérios do PHY-38 e deste ticket, para o triage decidir se viram PHY: (a) `onRebuild` preserva a amostra medida, então um vínculo (ou força, ou contact) adicionado em pausa depois do primeiro passo mantém a leitura anterior sem `≈` até o próximo passo; (b) no passo 0 a mola poderia entrar no valor (`k·(x−x0)` pelo documento, como `springAt` em `src/sim/simulator.ts`) em vez de só marcar `≈`.
- 2026-09-25 Stage 2: `constraintTouchesBody(scene, constraint, bodyId)` em `src/scene/ropePath.ts` (o módulo de helpers de cena de `src/scene`), reexportado por `index.ts`. `doc.ts` e `isHeld` chamam-no; nenhum teste editado. Mutação: `&& false` no ramo da polia do helper → 3 vermelhos, nos dois callers: `doc.test.ts` "removing a pulley mount removes its pulleys and every rope passing over them" (`['r1','r2']` ≠ `['r2']`), "removing c1 removes the springs tied to it and keeps the rest" (`['r1','r2','s2']` ≠ `['r2','s2']`), `accelerationTracker.test.ts` "marks both rope ends and a rope-carrying pulley body as approximate before the first step" (`false` ≠ `true`). Revertido: gate verde, 714/714 testes em 30 arquivos.
