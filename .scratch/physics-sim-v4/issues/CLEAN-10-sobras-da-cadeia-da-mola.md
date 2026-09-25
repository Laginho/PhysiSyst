# CLEAN-10: Sobras da cadeia da mola com massa: rótulos do painel, duplicações e a regra de carry no ADR
Stage: done
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`chainAxis`, `pushChain`)
  - `src/sim/acceptance.test.ts` (`ideal spring (PHY-26)`: o localizador de picos)
  - `src/i18n/pt-BR.ts` e `src/i18n/en.ts` (`readout.springForceAt`)
  - `src/App.tsx` (a leitura da mola com massa) e `src/App.test.ts` (`F_el em cada ponta (PHY-30)`)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (a seção de carry)

#### What to build

Cinco notas sem critério que os reviews do PHY-30 e do CLEAN-09 deixaram, nenhuma coberta por um ticket:

1. A leitura do painel rotula as pontas da mola com massa pelo nome do corpo (`F_el em bloco`) enquanto as setas dizem `F_el,1`/`F_el,2`; a corda espelha as setas (`T₁`/`T₂`). O painel passa a espelhar as setas também.
2. `pushChain` recalcula `before = chainTensions(s, at, v)` que `chainStep` já computou como `T`.
3. `chainAxis` recomputa `pa`, `pb`, `u` e as velocidades das pontas que `springAt(s)` já devolve.
4. O teste amortecido do CLEAN-09 (`peaks()`) repete o localizador de picos do teste da mola ideal amortecida (`d[i] > 0 && d[i] >= d[i-1] && d[i] > d[i+1]`): um helper ao lado de `upCrossings`.
5. Nenhum ADR enuncia a regra de carry da cadeia (retoma só nas mesmas duas pontas, as duas no carry; senão re-assenta), irmã da regra do giro da polia com massa que o ADR-0004 já registra.

#### Acceptance criteria

1. Com mₛ > 0 e a mola selecionada, o painel lê `F_el,1` e `F_el,2` na ordem das pontas, os mesmos rótulos das setas; com mₛ = 0 continua `F_el`
2. `chainStep` devolve (ou recebe) as tensões de antes do passo de modo que `pushChain` não chame `chainTensions` uma segunda vez sobre `(at, v)`; nenhum número dos testes do PHY-30 e do CLEAN-09 muda
3. `chainAxis` parte de `springAt`; nenhum número dos testes do PHY-30 e do CLEAN-09 muda
4. Um único localizador de picos no arquivo de testes, usado pelos dois testes amortecidos
5. O ADR-0004 registra a regra de carry da cadeia numa linha ao lado da do giro da polia
6. Gate verde

#### Verification

    npx vitest run src/sim src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: o teste `F_el em cada ponta (PHY-30)` passa a esperar `F_el,1`/`F_el,2`; vermelho porque o painel ainda diz `F_el em bloco`. Os itens 2–5 não ganham teste novo: os do PHY-30 e do CLEAN-09 já pinam os números.

## Comments

- 2026-09-24 Aberto pelo review do CLEAN-09 (stage 3). Os itens 1 e 2 vêm do comentário de abertura do CLEAN-09 (review do PHY-30) e ficaram de fora dali; 3–5 são os judgement calls do eixo Standards do CLEAN-09. Nenhum é critério de ticket fechado, por isso o CLEAN-09 fechou como está.
- 2026-09-24 Stage 2, testes (`21ff82a`): o teste do PHY-30 espera `F_el,1: 2.00 N` antes de `F_el,2: 2.50 N` e nenhum `F_el em`; vermelho na base — `expected '…F_el em parede: 2.00 NF_el em bloco: 2.50 NΔx: 0.100 m' to contain 'F_el,1: 2.00 N'`. No mesmo commit, o item 4: `peakTicks` ao lado de `upCrossings`, usado pelos dois testes amortecidos (verdes antes e depois).
- 2026-09-24 Stage 2, implementação: o painel lê `{t('readout.springForce')},{i + 1}` na ordem `force.a`, `force.b` (critério 1); `readout.springForceAt` saiu de `pt-BR.ts` e `en.ts`, sem uso. `springAt` passou a devolver também `v`, as velocidades das pontas; `chainAxis` parte dele (`now`, `v`, `u`, `dx + x0`) e `pushChain` aplica as forças em `now` (critério 3). `chainStep` devolve `{ q, T }` e `pushChain` usa `T` como `before` (critério 2). ADR-0004: um item "Carry of a spring with mass" logo abaixo do carry da polia (critério 5).
- Mutações (aplicada, rodada, revertida):
  - `App.tsx`, pontas trocadas (`[force.b, force.a]`), `npx vitest run src/App.test.ts -t CLEAN-10`: 1 failed — `expected '…F_el,1: 2.50 NF_el,2: 2.00 NΔx: 0.100 m' to contain 'F_el,1: 2.00 N'`
  - `simulator.ts`, `chainAxis` sem `+ s.x0` na ponta b, `npx vitest run src/sim/acceptance.test.ts -t PHY-30`: 8 failed | 3 passed — os testes do PHY-30 e do CLEAN-09 passam pelo `chainAxis` refatorado
- Gate: `npm test` 30 arquivos, 683 testes verdes; `npm run lint` e `npm run typecheck` limpos; `npm run build` ✓ (só o aviso de chunk > 500 kB de sempre). Nenhum texto nem tolerância dos testes do PHY-30/CLEAN-09 mudou (critérios 2 e 3); `npx vitest run src/sim src/App.test.ts`: 4 arquivos, 140 testes verdes.

#### Resolution (2026-09-24)

Verdict: Approve

**Decision.** Merged into `sweatshop/2026-09-24-1853` (`0288ed5`, `--no-ff`). Every criterion met on the contract as written; no small fix needed. The branch sat directly on the session tip, so the rebase was a no-op and the gate below is the merged tree.

**Files.** `src/App.tsx`, `src/i18n/pt-BR.ts`, `src/i18n/en.ts`, `src/sim/simulator.ts`, `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (code, `f7e52ec`); `src/App.test.ts`, `src/sim/acceptance.test.ts` (tests, `21ff82a`). Test-first shape holds: the test commit touched only the two test files and this ticket; the code commit touched no test file.

**Findings.**

- Criterion 1: the panel renders `{t('readout.springForce')},{i + 1}` over `[force.a, force.b]`, so `F_el,1`/`F_el,2` in end order in pt-BR and `F_s,1`/`F_s,2` in en; with mₛ = 0 the single `F_el` line is untouched. The test also pins the order and the absence of `F_el em`; red on the base for the recorded reason. `readout.springForceAt` has no reference left in `src/` and `i18n.test.ts` still holds key parity between the locales.
- Criterion 2: `chainStep` already computed `T = chainTensions(s, at, v)` for its rhs; it now returns `{ q, T }` and `pushChain` takes `T` as `before`. Same `(at, v)`, same numbers.
- Criterion 3: `chainAxis` takes `now`, `v`, `u`, `dx` from `springAt(s)` (lead 0, so `pa = now + 0·v` exactly, same `unit`, same `pointVelocity` calls) and `pushChain` applies the forces at `now[0]`/`now[1]`, the old `pa`/`pb`. The one arithmetic difference is `dx + s.x0` for the old `hypot`, 1 ulp off in a fraction of doubles; the only bit-for-bit tests in the repo (rope `mass 0 vs absent`, spring `mₛ = 0`) never enter `chainAxis`, and the chain tests are tolerance-based. `springAt` gained `v` in its return to make this possible: the ticket's item 3 assumed it already yielded the end velocities.
- Criterion 4: one `peakTicks` beside `upCrossings`, bounds and condition character-identical to the two loops it replaced; both damped tests map its indices.
- Criterion 5: the "Carry of a spring with mass" bullet sits under the pulley's carry bullet, as asked, and matches `replaceScene` (resume only on the same `bodyId` + `anchorLocal` at both ends, both carried; else `placeChain`).
- Criterion 6: gate green, below.
- Spec, not a criterion, parked in CLEAN-11: "os mesmos rótulos das setas" holds for one massed spring with both ends drawn. `vectorLabels` numbers arrows per kind across the whole scene and skips fixed bodies, so with the wall fixed the one arrow drawn reads plain `F_el` while the panel says `F_el,1`/`F_el,2`, and a second massed spring's arrows read `F_el,3`/`F_el,4`. The rope panel (`T₁`/`T₂` per leg) has the same convention gap; pre-existing, not a regression.
- Standards, judgement calls, none fixed here (outside the ticket's scope of `simulator.ts`, or no criterion): `placeChain` still calls `pointVelocity` twice for the `v` that `springAt` now returns; `dx + s.x0` in `chainAxis` and `placeChain` is the length `springAt` already computes; `App.tsx` hard-codes the `,` subscript that `vectorLabels` derives from the symbol. All in CLEAN-11.

**Mutations re-run by the review** (each applied, run, reverted):

- `App.tsx`, ends swapped to `[force.b, force.a]`, `npx vitest run src/App.test.ts -t CLEAN-10`: 1 failed | 55 skipped — `expected 'leitura — mola…' to contain 'F_el,1: 2.00 N'`
- `simulator.ts`, `chainAxis` end b without `+ s.x0`, `npx vitest run src/sim/acceptance.test.ts -t PHY-30`: 8 failed | 3 passed

**Gate** (on `f7e52ec`, identical tree to the merge): `npm test` 30 files, 683 tests passed; `npm run lint` clean; `npm run typecheck` clean; `npm run build` ✓ (the usual chunk > 500 kB warning).
