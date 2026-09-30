# CLEAN-18: Os testes do PHY-36 ficam vermelhos se o mundo não for reiniciado
Stage: implementing
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

- 2026-09-30 Stage 2: strengthened only the two PHY-36 cases. Their local fake now initializes from the supplied document, advances its own state on each step, and implements `replaceScene` with the optional carry. After switching and checking the document state at step 0, each case takes another step and checks the live position and velocity through the UI readout.
- Mutation evidence (both `via duplicar` and `via lista de cenas`): temporarily replaced only `simRef.current?.replaceScene(docRef.current)` in the reset branch of `dispatch` with `void 0`, then ran `npx vitest run src/App.test.ts -t PHY-36`. Exit 1; `2 failed | 64 skipped (66)`. Both failed at `src/App.test.ts:1721`: `AssertionError: expected 'leitura — bolapassos: 1velocidade: 1.…' to contain 'posição: (9.00, 6.00) m'`. The actual readout was `(12.00, 8.50) m` at `10.00 m/s`, proving the old world continued after the UI reset. Restored `src/App.tsx` byte for byte; no production change is committed.

- 2026-09-30 Aberto a partir do F5 do Sol no review de benchmark do PR 9. Mutação reproduzida (a linha do `replaceScene` no reset trocada por `void 0`) → 2 passed.
