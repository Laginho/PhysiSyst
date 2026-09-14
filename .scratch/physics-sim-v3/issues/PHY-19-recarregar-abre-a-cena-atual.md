# PHY-19: Recarregar a página volta para a cena em que eu estava
Stage: to-review
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/persistence/index.ts` (nova chave da cena atual, ao lado de `INDEX_KEY`/`SCENE_KEY_PREFIX`/`GALLERY_ACK_KEY`)
  - `src/persistence/persistence.test.ts`
  - `src/App.tsx` (inicialização de `currentId`, ~426–434, e o handler que troca de cena, ~511)
  - `src/App.test.ts`

#### What to build

Recarregar a página reabre a cena em que o estudante estava, não sempre a
primeira da lista.

Hoje o conteúdo de toda cena sobrevive ao reload (uma chave
`physics-sim:scene:<id>` por cena) e a lista sobrevive (`physics-sim:scenes`),
mas **qual** cena estava aberta nunca é persistida: `currentId` inicializa com
`res.index[0]?.id ?? 'cena-1'`. Verificado no site publicado (PHY-17, passe
manual D7) — cinco cenas na lista, trabalhando na Cena 5, F5 abre a Cena 1. O
trabalho não se perde, mas o estudante perde o lugar toda vez, e numa aula isso
parece perda de dado.

Uma chave a mais no `localStorage`, escrita na troca de cena e lida na
inicialização. Id que não existe mais (cena excluída, storage de outra máquina,
valor corrompido) cai na primeira da lista, que é o comportamento de hoje.

#### Acceptance criteria

1. Trocar de cena persiste o id da cena atual no `localStorage`, sob uma chave própria com o mesmo prefixo `physics-sim:` das outras
2. Na inicialização, a cena aberta é a persistida; sem chave persistida, a primeira do índice (comportamento atual, para quem já tem storage)
3. Id persistido que não está no índice (cena excluída, chave corrompida, valor não-string) cai na primeira do índice sem lançar
4. Excluir a cena atual deixa a chave em um estado que o critério 3 cobre — reload depois de excluir não abre tela quebrada
5. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/persistence/persistence.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/persistence/persistence.test.ts`, nas funções puras de storage: grava e lê a cena atual; ausente → null; id fora do índice → null; valor corrompido → null, sem lançar (critérios 1–3). Vermelho porque as funções não existem.
- `src/App.test.ts`, na inicialização: storage com índice de três cenas e a terceira marcada como atual abre a terceira; sem a marca, abre a primeira (critério 2). Vermelho porque hoje é sempre `index[0]`.
- `src/App.test.ts`, exclusão: excluir a cena atual e reinicializar abre a primeira do índice (critério 4). Vermelho pela mesma razão.

## Comments

Aberto pelo passe manual desktop do PHY-17 (D7), no site publicado.

#### Review 1 (2026-09-14) — reaberto

Gate verde e o código está certo. O que cai é a cobertura: o mutate-verify não
estava registrado no ticket, e ao rodá-lo o reviewer encontrou **uma mutação
sobrevivente** — a metade do critério 2 que carrega o conteúdo da cena não está
presa por teste nenhum.

**Critérios**

1. ✅ `switchToScene` é o funil único de troca (escolha manual, nova, duplicar,
   importar, e o fallback do excluir — `src/App.tsx:1284,1302,1314,1335,1337,1377,1426,1440`),
   e é lá que `saveCurrentSceneId` grava, sob `physics-sim:currentScene`.
2. ⚠️ **Metade.** O `<select>` abre a cena persistida (preso pela mutação 1),
   mas o `doc` — o conteúdo que aparece no canvas — não é verificado por
   nenhuma asserção. Ver mutação 3.
3. ✅ Preso por teste de chamada direta em `persistence.test.ts` (fora do
   índice → null; não-string → null; ausente → null).
4. ✅ O comportamento existe, por duas vias: `switchToScene(next[0]!.id)` grava
   o novo id, e mesmo que não gravasse a checagem de pertinência ao índice do
   critério 3 cobre a chave velha. Mas o teste de exclusão em `App.test.ts`
   passa verde sob a mutação 2 — ele nunca chega a testar a própria carga
   útil. Teste fraco, comportamento correto; anotado, não bloqueia.
5. ❌ **Cai.** Sem registro de mutação no ticket (o `AGENTS.md` pede a mutação
   e o vermelho por teste em seam DOM; a linha do run-log é exatamente a
   "promessa de que a checagem rodou" que o protocolo recusa), e a mutação 3
   sobrevive à suíte inteira.
6. ✅ `npm test && npm run lint && npm run typecheck && npm run build` — 27
   arquivos, 471 testes, todos verdes, build ok.

**Mutate-verify reexecutado pelo reviewer.** Cada mutação aplicada sozinha em
`src/App.tsx`, revertida antes da seguinte:

1. `currentId` init (`src/App.tsx:435`) → `res.index[0]?.id ?? 'cena-1'`
   (dropa `loadCurrentSceneId`).
   🔴 3 testes: `expected 'cena-1' to be 'cena-3'`, `'cena-1' to be 'cena-2'`
   (×2). `Tests 3 failed | 1 passed`.
2. `saveCurrentSceneId(storage, id)` removido de `switchToScene`
   (`src/App.tsx:515`).
   🔴 1 teste: `expected 'cena-1' to be 'cena-2'` na troca de cena.
   `Tests 1 failed | 3 passed` — o teste de exclusão fica **verde**, daí a nota
   do critério 4.
3. `doc` init (`src/App.tsx:444`) → `loadSceneOrBlank(storage, res.index[0]!.id)`,
   isto é, o picker mostra a cena persistida e o canvas carrega a primeira.
   🟢 **SOBREVIVE**: `Test Files 27 passed (27) / Tests 471 passed (471)`.

**O que falta (só isto)**

- Uma asserção que mate a mutação 3: com índice de três cenas e a terceira
  marcada como atual, o documento aberto tem de ser o **conteúdo** da terceira.
  Hoje `seedThreeScenes` grava `blankScene()` nas três, então as cenas são
  indistinguíveis por construção — semear conteúdo diferente por cena (um corpo
  identificável em cada) é parte do trabalho.
- Registrar as mutações neste ticket, incluindo a nova, conforme o `AGENTS.md`.
- Enquanto o `doc` init lê `currentId` do escopo do init de cima, vale uma linha
  de comentário dizendo que a ordem das duas declarações `useState` é
  load-bearing.

Fora de escopo daqui: nada. Os arquivos Primary já cobrem tudo acima.

#### Attempt 2 (2026-09-14) — fecha o achado do Review 1

`seedThreeScenes` (`src/App.test.ts`) agora grava um corpo extra único por
cena (`marca-<id>`) em vez de `blankScene()` nas três, e os dois testes que
reabrem/trocam de cena passam a checar `host.textContent` por esse marcador,
além do valor do `<select>`. Nenhuma mudança de produção — o loader já lia
`currentId` corretamente; faltava só o teste capaz de provar isso.

**Mutate-verify (as três, reexecutadas nesta sessão contra o teste atual):**

1. `currentId` init (`src/App.tsx:435`) → `res.index[0]?.id ?? 'cena-1'`
   (dropa `loadCurrentSceneId`).
   🔴 `Tests 3 failed | 1 passed (36)`.
2. `saveCurrentSceneId(storage, id)` removido de `switchToScene`
   (`src/App.tsx:515` antes da mudança).
   🔴 `Tests 1 failed | 3 passed (36)` — o teste de exclusão segue verde sob
   esta mutação (nota do critério 4 acima, inalterada: comportamento correto,
   teste que não prende a própria carga útil).
3. `doc` init (`src/App.tsx:444`) → `loadSceneOrBlank(storage, res.index[0]!.id)`.
   🔴 **Agora morre**: `Tests 2 failed | 1 passed (36)` — as duas asserções de
   `marca-cena-N` caem, exatamente a mutação que a suíte anterior deixava
   passar.

Todas as três revertidas antes da próxima; suíte completa depois de reverter:
`Test Files 27 passed (27) / Tests 471 passed (471)`.

Comentário adicionado em `src/App.tsx` (init de `doc`) sobre a ordem
load-bearing dos dois `useState`.

**Critérios, revisitados:** 5 agora ✅ (mutação registrada e fechada, nenhuma
sobrevive). Os demais mantêm o veredito do Review 1.

**Verification:**

    npx vitest run src/App.test.ts src/persistence/persistence.test.ts
    # Test Files 1 passed, Tests 4 passed | 32 skipped — sub-suíte PHY-19
    npm test && npm run lint && npm run typecheck && npm run build
    # 27 arquivos, 471 testes, lint/typecheck/build limpos
