# CLEAN-10: Sobras da cadeia da mola com massa: rótulos do painel, duplicações e a regra de carry no ADR
Stage: to-review
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
