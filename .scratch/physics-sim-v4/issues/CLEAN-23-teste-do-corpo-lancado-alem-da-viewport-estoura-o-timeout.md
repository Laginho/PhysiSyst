# CLEAN-23: o teste do corpo lançado além da viewport estoura o timeout com a suíte em paralelo
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.test.ts` (só o teste `a body launched beyond the viewport integrates indefinitely`, no bloco `no invisible walls (T7/M2)`)

#### What to build

O gate padrão (`npm test` com a concorrência default do Vitest) volta a passar sem `VITEST_MAX_WORKERS=1`. Hoje o teste lança o corpo com um passo de 10 N e deixa ele planar a cerca de 0,17 m/s até x = 50 m, o que leva perto de 17 mil passos. Na sessão `sweatshop/2026-10-01-1211`, com o `step()` do PHY-48 e do PHY-50, ele leva 3,2–3,6 s isolado e 6,3 s na suíte cheia, acima dos 5000 ms do Vitest. Na `main` (sem essas mudanças) leva 1,4 s isolado. O teste precisa provar o mesmo em uma fração dos passos.

#### Acceptance criteria

1. O teste continua provando o que prova hoje: x monotônico, velocidade linear preservada exatamente (`toBe`), `linvel.y` e `angvel` zero, e nenhum wrap ou remoção do corpo, até bem além da borda da câmera (x em [-1,5; 13,5]).
2. O teste leva menos de 1 s isolado (`npx vitest run src/sim/simulator.test.ts -t "launched beyond the viewport"`, campo `tests`) sobre a base em que roda.
3. Sem `testTimeout` próprio nem mudança de timeout global: o teste fica rápido, não ganha mais prazo.
4. Nenhuma mudança em código de produção, em outros testes ou em tolerâncias.
5. `npm test` passa com a concorrência padrão, sem `VITEST_MAX_WORKERS`.

#### Verification

    npx vitest run src/sim/simulator.test.ts -t "launched beyond the viewport"
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: a mudança é no próprio teste. Prova de que ele continua forte, registrada em `## Comments`: duas mutações de produção em `src/sim/simulator.ts`, cada uma desfeita depois, com a saída vermelha do teste reescrito. (a) Um "wrap" que leva o corpo de volta para x = 0 ao passar de x = 20. (b) Um amortecimento que multiplica `linvel` por 0,999 a cada passo.

## Comments

- 2026-10-01 Stage 2 green: focused test `tests 71ms` (1 passed, 28 skipped), with production restored. Gate passed at default Vitest concurrency: `npm test` 30 files / 796 tests passed; `npm run lint`, `npm run typecheck`, and `npm run build` passed.
- 2026-10-01 Stage 2 mutation proof for the rewritten viewport test (both mutations made temporarily in `Simulator.step()` and reverted):
  - Wrap: after `world.step()`, set each body with `position.x > 20` back to `x = 0`. Focused test red: `AssertionError: expected 0 to be greater than 19.8958797454834` at `simulator.test.ts:546` (`position.x` monotonicity).
  - Damping: after `world.step()`, multiply each body's `linvel` by `0.999`. Focused test red: `AssertionError: expected 16.633352279663086 to be 16.650001525878906` at `simulator.test.ts:543` (exact `linvel.x`).

- 2026-10-01 Aberto pelo foreman a partir do relatório `docs/relatorios/2026-10-01-sweatshop-sonnet-5.5-gpt-6.1-sol.pdf` (recomendação 4). As revisões do PHY-45, PHY-48, PHY-50 e CLEAN-22 só passaram no gate com `VITEST_MAX_WORKERS=1`, e o stage 2 do PHY-50 e do CLEAN-22 registrou o timeout como pré-existente na base. Medido na `main` (`533b655`) às 17:2x: 1,39 s isolado.

#### Resolution (2026-10-01)
Verdict: Approve

##### Standards

0 violações documentadas e 0 smells. A mudança fica no teste autorizado de `src/sim/simulator.test.ts`: força de lançamento de 10 para 1000 N e comentário atualizado. O commit `c98c991` contém só teste e registro das duas mutações vermelhas; `87444aa` contém só o handoff documental. Nenhum teste novo foi exigido pelo contrato. Sem decisões de proxy ou correções do revisor.

##### Spec

0 achados. Critério 1: todas as assertions originais permanecem, incluindo x monotônico, `linvel.x` exato, `linvel.y` e `angvel` zero e travessia até x >= 50 sem wrap ou remoção. Critério 2: execução independente do teste isolado com `tests 77ms` (1 passou, 28 ignorados), abaixo de 1 s. Critérios 3 e 4: nenhuma mudança em timeout, produção, outros testes ou tolerâncias. Critério 5: suíte completa verde com concorrência padrão e sem `VITEST_MAX_WORKERS` no ambiente.

##### Verificação e integração

Prova red-green conferida no registro do estágio 2: wrap de x > 20 para zero falhou na monotonicidade (`expected 0 to be greater than 19.8958797454834`); amortecimento por 0,999 falhou na velocidade exata (`expected 16.633352279663086 to be 16.650001525878906`). Ambas as mutações foram desfeitas; a revisão confirmou o diff sem produção alterada e o teste verde.

Gate independente: `npm test && npm run lint && npm run typecheck && npm run build`, todos exit 0. Testes: 30 arquivos / 796 testes passaram, duração 20,47 s. `git diff --check` passou. Build apenas com o aviso de tamanho dos chunks.

Rebase sobre `sweatshop/2026-10-01-1820` já atualizado, sem conflitos. Merge `--no-ff` em `48e4b64`, com árvore idêntica à validada. Resolução, ledger e `Stage: done` no mesmo commit de fechamento na sessão; sem PR ou push neste estágio.
