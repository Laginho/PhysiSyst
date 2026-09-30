# CLEAN-17: Pinar o `placeDisks`
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)`)

#### What to build

O disco de uma polia com massa tem a translação travada, e `placeDisks` o põe no eixo à mão a cada passo. Esvaziar `placeDisks` deixa verdes todos os testes de `src/sim`. O Sonnet achou isso, e eu reproduzi: 86 de 86 passando. As cenas existentes (Atwood e polia móvel) têm pernas verticais e montagem que só se move na vertical. Nelas o braço de torque `(p.x − com.x)` não depende de quanto o disco ficou para trás, e por isso os testes não enxergam o defeito.

Falta um teste de aceitação em que o disco fique fora do eixo sem `placeDisks` e em que isso mude uma grandeza observável. O candidato natural é uma polia com massa montada num corpo que se move na horizontal, comparada com uma forma fechada ou com um invariante, por exemplo o giro do disco contra `v/R` da corda. A cena fica a cargo do stage 2.

#### Acceptance criteria

1. Um teste no bloco PHY-25 de `src/sim/acceptance.test.ts` fica vermelho com `placeDisks` esvaziado e verde no código como está. O ticket registra a saída vermelha
2. Nenhum outro teste muda
3. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- O teste do critério 1. É um ticket só de cobertura: o teste nasce verde no código atual, e a prova é a mutação (`placeDisks` esvaziado) aplicada e revertida, com a saída vermelha registrada em `## Comments`. Sem commit de código.

## Comments

- 2026-09-30 Stage 2: added one acceptance test in the PHY-25 block, through `parse`, `createSimulator`, `step`, `readStates` and `readConstraints`. It reuses the Atwood scene with a dynamic 10 kg mount, a 200 N upward force, and compares runs with horizontal initial velocities 0 and 2 m/s. Galilean invariance requires identical vertical motion and segment tensions, with horizontal displacement differing by `2t`.
- Mutation evidence for the new test: temporarily removed the sole statement in `RapierSimulator.placeDisks`, leaving its body empty apart from a comment, then ran `npx vitest run src/sim/acceptance.test.ts -t PHY-25`. Exit 1; `1 failed | 5 passed | 43 skipped (49)`. The new test failed on the vertical-velocity invariant: `AssertionError: expected 0.0012905076146125793 to be less than or equal to 0.001` at `src/sim/acceptance.test.ts:841`. The five existing PHY-25 cases stayed green. Restored the production file byte for byte after the run.
- Green proof after restoring production: `npx vitest run src/sim/acceptance.test.ts -t PHY-25` exited 0, `6 passed | 43 skipped (49)`. Test-only commit: `2ec8c00`; no existing test changed and no production change committed.
- Full gate: `npm test && npm run lint && npm run typecheck && npm run build` exited 0; `30 passed (30)` test files, `715 passed (715)` tests. Lint and typecheck passed; Vite built 49 modules with its chunk-size warning. Stage 2 complete, ready for stage 3.

- 2026-09-30 Aberto a partir do F3 do Sonnet no review de benchmark do PR 9. Mutação reproduzida: `placeDisks` com `return` na primeira linha, `npx vitest run src/sim` → 86 passed.
