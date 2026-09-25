# CLEAN-12: Pinar as velocidades dos nós no assentamento da cadeia (`placeChain`)
Stage: to-review
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/acceptance.test.ts` (bloco `with mass (PHY-30)`)

#### What to build

O registro de mutações do CLEAN-11 (M4) mostra que `placeChain` com `ub = dot(v[0], u)` — os nós assentados todos à velocidade da ponta a, em vez de interpolados entre as pontas — fica verde em toda a suíte. Nenhum teste põe a cadeia com as pontas a se afastar ao longo do eixo no instante do assentamento, então `chain.w` não está pinado. Um teste de aceitação que faça isso e observe a consequência (F_el por ponta, ou Δv do bloco, nos primeiros passos após o assentamento) fecha o buraco.

#### Acceptance criteria

1. Um teste no bloco `with mass (PHY-30)` de `src/sim/acceptance.test.ts` fica vermelho com `placeChain` mutado para `ub = dot(v[0], u)` e verde no código como está; o ticket registra a saída vermelha
2. Nenhum outro teste muda
3. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-30
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- O teste do critério 1. Este é um ticket só de cobertura: o teste nasce verde no código atual, e a prova é a mutação M4 do CLEAN-11 aplicada e revertida, com a saída vermelha registrada em `## Comments`. Sem commit de código.

## Comments

- 2026-09-24 Aberto pelo review do CLEAN-11 (stage 3), a partir do registro M4 do stage 2 desse ticket.
- 2026-09-24 Stage 2. Commit `4d01a1b` (teste + `Stage: implementing`; só `src/sim/acceptance.test.ts` e este ticket, 23 linhas adicionadas, nenhuma linha de outro teste tocada). Sem commit de código.
  Teste: `replaceScene without the wall in the carry, the block passing X_EQ: …` no bloco `with mass (PHY-30)`. Dois simuladores na mesma cena (m = 1, k = 40, mₛ = 0.1, A = 0.1); após 15 passos (¼ de período, |v_bloco| ≈ 0.62 m/s) um deles faz `replaceScene` com a carry sem `parede`, o que força `placeChain` com a ponta a parada e a ponta b em plena velocidade; o bloco tem que seguir a corrida sem interrupção dentro de 1% de A por 120 passos. Medido: 0.14% de A no código como está, 2.97% de A com M4.
  Mutação M4 (`placeChain`: `ub = dot(v[0], u)`), aplicada sozinha com o Edit e revertida com `git checkout -- src/sim/simulator.ts`, `npx vitest run src/sim/acceptance.test.ts -t PHY-30`:

      FAIL  src/sim/acceptance.test.ts > acceptance: ideal spring (PHY-26) > with mass (PHY-30) > replaceScene without the wall in the carry, the block passing X_EQ: the chain re-seats moving with its ends, and the block follows an uninterrupted run within 1% of A
      AssertionError: expected 0.0029740333557128906 to be less than or equal to 0.001
            Tests  1 failed | 11 passed | 35 skipped (47)

  Revertido: 12 passed | 35 skipped. Gate: `npm test` 30 arquivos, 685 testes verdes (684 + este); lint, typecheck limpos; build ✓ (o aviso de chunk > 500 kB de sempre).
  Descartado na sondagem: comparar F_el por ponta com k·Δx logo após trocar mola ideal → com massa no meio do balanço (a mesma carry, `was.chain` nulo) separa mal (desvio máx. ~0.5 N no código atual contra ~0.75 N com M4), porque o próprio assentamento já tira F_el de k·Δx por ~0.5 N no primeiro passo.
