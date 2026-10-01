# CLEAN-18: Os testes do PHY-36 ficam vermelhos se o mundo não for reiniciado
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/App.test.ts` (os testes do PHY-36 e o simulador falso que eles usam)

#### What to build

Os dois testes do PHY-36 conferem o contador zerado e a pose do documento depois de uma troca de cena. Só que o simulador falso tem `replaceScene` sem efeito e um leitor de estado que sempre devolve o corpo antigo, e os testes param antes de dar outro passo. Por isso eles não provam que o mundo que está rodando trocou de cena, que é o centro dessa regressão.

O Sol achou isso, e eu reproduzi. Tirar só `simRef.current?.replaceScene(docRef.current)` do reset em `dispatch` deixa `npx vitest run src/App.test.ts -t PHY-36` verde: 2 passed, 64 skipped. As mutações registradas no PHY-36 cobrem o `dispatch` e a limpeza das refs, não o reset do mundo.

#### Acceptance criteria

1. Tirar a chamada `replaceScene` do reset em `dispatch` deixa vermelhos os dois casos do PHY-36. O ticket registra a saída vermelha
2. As duas mutações já registradas no PHY-36 continuam deixando os dois casos vermelhos
3. Nenhum outro teste muda
4. Gate verde

#### Verification

    npx vitest run src/App.test.ts -t PHY-36
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Os testes do PHY-36 passam a exigir que o mundo recebeu o documento novo, sem carry. Por exemplo: o falso guarda o que `replaceScene` recebeu e avança o próprio estado, e o teste dá um passo depois da troca. É um ticket só de cobertura: a prova é a mutação do critério 1 aplicada e revertida, com a saída vermelha registrada em `## Comments`. Sem commit de código.

## Comments

- 2026-09-30 Aberto a partir do F5 do Sol no review de benchmark do PR 9. Mutação reproduzida (a linha do `replaceScene` no reset trocada por `void 0`) → 2 passed.

- 2026-09-30 Stage 2: strengthened only the two PHY-36 cases. Their local fake now initializes from the supplied document, advances its own state on each step, and implements `replaceScene` with the optional carry. After switching and checking the document state at step 0, each case takes another step and checks the live position and velocity through the UI readout.
- Mutation evidence (both `via duplicar` and `via lista de cenas`): temporarily replaced only `simRef.current?.replaceScene(docRef.current)` in the reset branch of `dispatch` with `void 0`, then ran `npx vitest run src/App.test.ts -t PHY-36`. Exit 1; `2 failed | 64 skipped (66)`. Both failed at `src/App.test.ts:1721`: `AssertionError: expected 'leitura — bolapassos: 1velocidade: 1.…' to contain 'posição: (9.00, 6.00) m'`. The actual readout was `(12.00, 8.50) m` at `10.00 m/s`, proving the old world continued after the UI reset. Restored `src/App.tsx` byte for byte; no production change is committed.
- Previous PHY-36 mutation 1, applied independently: omitted only `dispatch({ type: 'reset' })` in `switchToScene`. Same command, exit 1; `2 failed | 64 skipped (66)`. Both cases failed at `src/App.test.ts:1710`: `AssertionError: expected 'leiturapassos: 1velocidade: 1.00×sele…' to contain 'passos: 0'`; actual `leiturapassos: 1velocidade: 1.00×selecione um corpo`.
- Previous PHY-36 mutation 2, applied independently: omitted only `statesRef.current = null` in the reset branch of `dispatch`. Same command, exit 1; `2 failed | 64 skipped (66)`. Both cases failed at `src/App.test.ts:1714`: `AssertionError: expected 'leiturapassos: 0velocidade: 1.00×sele…' to contain 'posição: (6.00, 3.50) m'`; actual `leiturapassos: 0velocidade: 1.00×selecione um corpo`. Restored production byte for byte after each mutation and verified `git diff --exit-code -- src/App.tsx`.
- Green proof after restoring production: `npx vitest run src/App.test.ts -t PHY-36` exited 0; `2 passed | 64 skipped (66)`. Test-only commit: `fd88bf7`; only the PHY-36 block and its required type import changed, with no other test or production change.
- Full gate: `npm test && npm run lint && npm run typecheck && npm run build` exited 0; `30 passed (30)` test files, `715 passed (715)` tests. Lint and typecheck passed; Vite built 49 modules with the existing chunk-size warning. Stage 2 complete, ready for stage 3.

#### Resolution (2026-09-30)

Verdict: Approve

Standards:

- Corrigida a ordem dos comentários: o relato de abertura volta a preceder os registros do estágio 2, conforme a regra de append de `docs/agents/issue-tracker.md`. Nenhuma violação de código ou smell encontrado.
- Primary files e test-first ✅ — `fd88bf7` altera somente os dois casos PHY-36, seu falso local e o import de tipo necessário, além do ticket; `9c8a6ce` altera somente o ticket. O contrato de cobertura pede prova vermelha por mutação revertida, sem commit de produção. Nenhum outro teste mudou.

Spec:

- Critério 1 ✅ — revisão reproduziu a remoção de `simRef.current?.replaceScene(docRef.current)` no reset de `dispatch`. `npx vitest run src/App.test.ts -t PHY-36` saiu com código 1: `2 failed | 64 skipped (66)`. Tanto `via duplicar` quanto `via lista de cenas` falharam em `src/App.test.ts:1721`, esperando `posição: (9.00, 6.00) m`; o mundo antigo continuou em `(12.00, 8.50) m` a `10.00 m/s`.
- Critério 2 ✅ — as duas mutações anteriores foram reproduzidas independentemente, com o mesmo comando e código 1, cada uma com `2 failed | 64 skipped (66)`. Sem `dispatch({ type: 'reset' })` em `switchToScene`, ambos falharam na linha 1710: esperado `passos: 0`, recebido `leiturapassos: 1velocidade: 1.00×selecione um corpo`. Sem `statesRef.current = null` no reset, ambos falharam na linha 1714: esperado `posição: (6.00, 3.50) m`, recebido `leiturapassos: 0velocidade: 1.00×selecione um corpo`.
- Critério 3 ✅ — diff completo e commits conferidos: nenhum outro teste ou código de produção mudou. O falso avança o estado do mundo e respeita o carry opcional; a leitura após o próximo passo distingue reset do mundo de simples limpeza da UI.
- Critério 4 ✅ — gate executado nesta revisão: `npm test && npm run lint && npm run typecheck && npm run build`, código 0; `30 passed (30)` arquivos, `715 passed (715)` testes; lint e typecheck limpos; build de 49 módulos, com o aviso de tamanho do chunk do simulador já existente.
- Proxy decided: nenhum. Regressões ou pendências: nenhuma.

Files: `src/App.test.ts`; ticket e ledger de encerramento. Nenhuma correção de produção nesta revisão.

Red-green: produção restaurada byte a byte depois de cada mutação; `git diff --exit-code -- src/App.tsx` limpo. Após a restauração, o comando focal saiu com código 0: `2 passed | 64 skipped (66)`. Rebase na sessão sem alterações; a árvore de código integrada é a mesma que passou no gate.

Merged into `sweatshop/2026-09-24-1853` at `c43b939`.
