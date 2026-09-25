# CLEAN-12: Pinar as velocidades dos nós no assentamento da cadeia (`placeChain`)
Stage: implementing
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
