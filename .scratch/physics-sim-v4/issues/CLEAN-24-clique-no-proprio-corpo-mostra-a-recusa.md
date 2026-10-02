# CLEAN-24: O segundo clique da ferramenta no corpo da âncora A mostra a recusa
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (só `onToolClick` e o docblock dele, ~1202–1234)
  - src/App.test.ts (o bloco de cliques de ferramenta, perto de ~1146)

#### What to build

Com a ferramenta de mola, ou de corda sem polia no meio, um segundo clique no corpo da âncora A hoje não faz nada: `onToolClick` sai com `return` antes de chamar `addSpring`/`addRope`, e a linha de dica não muda. O `doc.ts` já recusa esse caso com `error.parConsigoMesmo` (`addSpring` ~231, `addRope` ~304), e o `finishTool` já mostra recusas na linha da ferramenta. O guard do App só esconde uma recusa que a camada do documento já escreve. Tirá-lo põe as duas no mesmo caminho.

O clique numa polia antes da âncora A continua ignorado: não há texto para ele, e a dica já diz que o primeiro clique vai num corpo.

#### Acceptance criteria

1. Ferramenta de mola: clicar em B1 e de novo em B1. A linha da ferramenta mostra `t('error.parConsigoMesmo')`, nenhum vínculo é criado e a ferramenta continua armada com A.
2. Ferramenta de corda, os mesmos cliques sem polia no meio: o mesmo resultado do critério 1.
3. Ferramenta de corda: B1, uma polia, B1. A corda B1 → polia → B1 continua sendo construída, como hoje.
4. Depois da recusa do critério 1, clicar em B2 ainda cria a mola.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, com os helpers `tool()`/`click()` existentes: critérios 1 a 4. O 1 e o 2 são vermelhos hoje pelo `return` antecipado em ~1233; o 3 e o 4 passam hoje e vão junto. É uma costura de DOM: o ticket registra, por teste novo, a mutação aplicada no `App.tsx` e a saída vermelha que ela deu (AGENTS.md, Mutate-verify).

## Comments

- 2026-10-01 Stage 2: costura aprovada `tool()`/`click()` no DOM do App. `onToolClick` tem um único chamador, `onPointerDown`, que encaminha cliques quando há ferramenta armada. Os casos afetados são a segunda âncora no mesmo corpo, a tentativa válida depois da recusa e a corda que volta a A passando por polia; clique fora de corpo e polia antes de A conservam seus retornos.
- Red antes da produção: `node node_modules/vitest/vitest.mjs run src/App.test.ts -t CLEAN-24 --maxWorkers=1` (PTY) → **2 failed, 2 passed, 83 skipped**. Os dois testes de recusa falham em `expected … to contain 'par consigo mesmo'`; recebido apenas `mola: clique no segundo corpo (Esc cancela)` / `corda: clique nas polias, na ordem, e depois no corpo da outra ponta (Esc cancela)`. As duas preservações passam na base. As primeiras tentativas sem PTY (forks e threads) não iniciaram testes: `Timeout waiting for worker to respond`, 60 s cada.

- 2026-10-01 Aberto na triagem do CLEAN-13 (item 2). Proxy decided: mostrar a recusa em vez de ignorar o clique — o `doc.ts` já recusa o caso com texto próprio; o clique na polia antes de A fica ignorado porque exigiria texto novo.
