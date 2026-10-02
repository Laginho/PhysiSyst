# CLEAN-24: O segundo clique da ferramenta no corpo da âncora A mostra a recusa
Stage: done
Status: resolved
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
- Mutate-verify no DOM, produção `src/App.tsx::onToolClick`, testes já no commit `702605b` (todas as mutações temporárias removidas):
  - `CLEAN-24: mola mostra a recusa…`: reinserir o guard original `if (tool.a.bodyId === hit.id && (tool.kind === 'spring' || tool.via.length === 0)) return`. Red: `expected 'mola: clique no segundo corpo (Esc cancela)' to contain 'par consigo mesmo'`.
  - `CLEAN-24: corda mostra a recusa…`: mesmo guard original. Red: `expected 'corda: clique nas polias, na ordem, e depois no corpo da outra ponta (Esc cancela)' to contain 'par consigo mesmo'`. Run dos dois: **2 failed, 85 skipped**, exit 1 (`npm test -- src/App.test.ts -t 'CLEAN-24:.*mostra a recusa'`, PTY).
  - `CLEAN-24: corda pode voltar…`: guard mutado para `if (tool.a.bodyId === hit.id) return`, inclusive após polia. Red: `panel(host, 'corda')?.textContent` é `undefined`, falha em `toContain('bloco1 → polia → bloco1')`: `the given combination of arguments (undefined and string) is invalid`. **1 failed, 86 skipped**, exit 1 (`npm test -- src/App.test.ts -t 'CLEAN-24: corda pode voltar'`, PTY).
  - `CLEAN-24: depois da recusa…`: ao reencontrar A na mola, executar `setTool({ ...tool, a: null }); return`. Red: `expected undefined to be defined` no painel da mola após B2. **1 failed, 86 skipped**, exit 1 (`npm test -- src/App.test.ts -t 'CLEAN-24: depois da recusa'`, PTY).
- Green da produção sem o guard: `npm test -- src/App.test.ts -t CLEAN-24` (PTY, sem flags de concorrência) → **4 passed, 83 skipped**. PTY resolveu o problema de startup; nenhuma configuração persistente alterada.
- Gate final: `npm test && npm run lint && npm run typecheck && npm run build` (via `cmd /c`, PTY) → **30 files passed, 800 tests passed**, suíte em 38,16 s; lint, typecheck e build exit 0. Sem flags de concorrência ou timeout. Lint demorou sem saída, mas concluiu; uma invocação independente `npm run lint` também terminou exit 0. Aviso existente do chunk do simulador acima de 500 kB.
- Implementação limitada a remover o guard de segundo clique em `onToolClick` e atualizar seu docblock. A recusa mantém a âncora A pelo fluxo existente de `finishTool`; nova tentativa válida cria e seleciona o vínculo. Critérios 1–4 verdes, mutações documentadas acima, diff final conferido sem mudanças fora dos Primary files e do ticket. Branch `clean-24`, base da sessão `sweatshop/2026-10-01-2342`.

- 2026-10-01 Aberto na triagem do CLEAN-13 (item 2). Proxy decided: mostrar a recusa em vez de ignorar o clique — o `doc.ts` já recusa o caso com texto próprio; o clique na polia antes de A fica ignorado porque exigiria texto novo.

#### Resolution (2026-10-02)
Verdict: Approve

##### Standards

0 violações documentadas e 0 smells justificáveis na revisão independente. `onToolClick` reutiliza a validação do documento e `finishTool`; seu docblock acompanha o comportamento. Os quatro testes observam cliques e resultados no DOM pelos helpers existentes. Cada teste tem mutação e saída vermelha registradas. `702605b` contém testes e o registro do ticket, antes da produção; `13bb793` contém produção e o handoff, sem alterar testes. O diff fica nos Primary files e no ticket. Sem correções do revisor.

##### Spec

0 achados na revisão independente. Critérios 1 e 2: a segunda tentativa no corpo de A mostra `t('error.parConsigoMesmo')`, não grava vínculo nem undo e preserva a ferramenta com A. Critério 3: B1 → polia → B1 continua criando corda. Critério 4: depois da recusa, B2 cria a mola com A e limpa o erro; `x₀ = 0,5 m` confirma as âncoras esperadas.

A linha `Proxy decided` da triagem do CLEAN-13 foi conferida: mostrar a recusa existente, mantendo o clique na polia antes de A ignorado. O diff respeita essa decisão; sem nova decisão de proxy, regressão identificada ou comportamento fora do pedido.

##### Prova red-green repetida pelo stage 3

As três mutações registradas no stage 2 foram reaplicadas temporariamente em `src/App.tsx::onToolClick`, sem alterar testes:

- `CLEAN-24: mola mostra a recusa…` e `CLEAN-24: corda mostra a recusa…`: reinserir `if (tool.a.bodyId === hit.id && (tool.kind === 'spring' || tool.via.length === 0)) return`. `npm test -- src/App.test.ts -t 'CLEAN-24:.*mostra a recusa'` → **2 failed, 85 skipped**, exit 1. Cada teste falha em `App.test.ts:1257`: esperado `par consigo mesmo`, recebido apenas a dica de mola ou corda.
- `CLEAN-24: corda pode voltar…`: guard `if (tool.a.bodyId === hit.id) return`, inclusive após a polia. `npm test -- src/App.test.ts -t 'CLEAN-24: corda pode voltar'` → **1 failed, 86 skipped**, exit 1. `App.test.ts:1275`: `undefined` no painel, em vez do caminho `bloco1 → polia → bloco1`.
- `CLEAN-24: depois da recusa…`: ao reencontrar A na mola, executar `setTool({ ...tool, a: null }); return`. `npm test -- src/App.test.ts -t 'CLEAN-24: depois da recusa'` → **1 failed, 86 skipped**, exit 1. `App.test.ts:1286`: `expected undefined to be defined`, pois B2 passa a ser A.

Mutações removidas, blob de produção conferido contra `13bb793` (`8db0834`). `npm test -- src/App.test.ts -t CLEAN-24` → **4 passed, 83 skipped**, exit 0. Todas as chamadas usaram PTY, sem flags de concorrência ou timeout.

##### Gate e integração

Gate independente: `npm test && npm run lint && npm run typecheck && npm run build`, todos exit 0. **30 arquivos e 800 testes passaram**, suíte em **57,37 s**, com concorrência padrão. Build somente com o aviso existente do chunk tardio do simulador acima de 500 kB. `git diff --check` passou.

Rebase sobre `sweatshop/2026-10-01-2342` já atualizado, sem conflitos ou mudança da árvore validada. Merge `--no-ff` em `40ee251`, com árvore idêntica à validada (`21c95b3`). Resolução, ledger e `Stage: done` no mesmo commit de fechamento na sessão.

Totais: Standards 0 achados; Spec 0 achados.
