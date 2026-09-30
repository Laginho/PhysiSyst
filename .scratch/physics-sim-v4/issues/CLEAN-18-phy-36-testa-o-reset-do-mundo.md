# CLEAN-18: Os testes do PHY-36 ficam vermelhos se o mundo não for reiniciado
Stage: to-implement
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
