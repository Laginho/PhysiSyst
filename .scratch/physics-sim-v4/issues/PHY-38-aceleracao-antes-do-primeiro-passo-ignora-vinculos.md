# PHY-38: Aceleração lida antes do primeiro passo ignora corda e mola
Stage: done
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/playback/accelerationTracker.ts` (a estimativa analítica e a marca `≈`)
  - `src/playback/accelerationTracker.test.ts`

#### What to build

Antes da primeira amostra do simulador, o painel de leitura mostra a aceleração analítica de `getAcceleration`. Essa estimativa não conhece cordas nem molas, e só leva `≈` quando o corpo participa de um Contact. Um corpo preso numa mola ou corda mostra então um valor errado, sem `≈`.

Reproduzido no passe manual do PHY-33 (Chromium, 1280 px): preset "Massa-mola horizontal" com `Δx = −0,05`, `bloco` selecionado. No passo 0 o painel lê `módulo da aceleração: 9.81 m/s²`, sem `≈`. No passo 1 lê `2.00 m/s²`, que é `k·|Δx|/m = 40 · 0,05 / 1`.

Antes do primeiro passo, a leitura de um corpo preso a um vínculo não afirma um valor que o vínculo contradiz: ou inclui a força do vínculo, ou leva `≈`.

#### Acceptance criteria

1. No passo 0, um corpo preso numa mola ou numa corda não mostra a aceleração de queda livre como exata: o valor inclui o vínculo, ou a leitura leva `≈`
2. Corpos sem vínculo e sem contato leem como hoje
3. Teste de regressão mutate-verified conforme o `AGENTS.md`
4. Gate verde

#### Verification

    npx vitest run src/playback/accelerationTracker.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

#### Resolution (2026-09-25)

Verdict: Approve

Findings:

- Critério 1 ✅ — `isHeld` em `accelerationTracker.ts` marca `≈` quando o corpo é ponta (`a` ou `b`) de qualquer constraint, ou monta uma polia na `via` de uma corda; o ramo de Contact ficou como estava. O valor continua `g`, o que o critério permite ("ou leva `≈`").
- Critério 2 ✅ — o teste da corda confere `free` (sem vínculo) como `{0, −9.81, approximate: false}` e `ceiling` (fixo) como zero exato; os 12 testes anteriores do arquivo seguem verdes.
- Critério 3 ✅ — os dois testes chamam `getAcceleration` diretamente (sem registo obrigatório). Vermelho reproduzido no review em `ce60d69`: `2 failed | 12 passed`, ambos `expected false to be true` em `approximate`. A mutação da cláusula da polia registada pelo stage 2 (`accelerationTracker.test.ts:204`) bate com o teste do `carrier`.
- Critério 4 ✅ — gate verde na branch rebaseada (já estava sobre a ponta da session): 30 arquivos, 714 testes; lint, typecheck e build limpos.
- Test-first ✅ — `ce60d69` toca só `accelerationTracker.test.ts` + ticket; `78f531c` toca só `accelerationTracker.ts` + ticket. Tudo dentro dos Primary files.
- Regressão: nenhuma. Contacts continuam marcando `≈`; um corpo com amostra medida continua exato.
- Nota (refactor fora dos Primary files, vai para o CLEAN-15): `isHeld` repete o predicado "constraints que tocam o corpo, direto ou via polia montada nele" que `removeBodyAndDependents` em `src/editor/doc.ts` já escreve. Duas cópias da mesma regra de alcance.
- Nota (fora dos critérios, sem ação): a amostra medida sobrevive ao rebuild (`onRebuild`), então uma mola ligada com a simulação pausada depois do primeiro passo mantém a leitura anterior sem `≈` até o próximo passo. Vale igualmente para forças e contacts adicionados em pausa; é comportamento anterior à v4, não deste ticket. Registado no CLEAN-15 como comentário para o triage.
- Nota (fora dos critérios, sem ação): para a mola o passo 0 poderia incluir `k·(x−x0)` a partir do documento em vez de só marcar `≈`. O critério 1 aceita as duas saídas; decisão de produto para o stage 1, registada no CLEAN-15.
- Achados recusados: alocação de um `Map` por chamada em `isHeld` (100 ms, cenas pequenas; o código fica mais claro assim) e o guard `body && !body.fixed && body.mass > 0` repetido em `estimateAnalyticAcceleration` (já existia antes do diff).
- Sem linhas `Proxy decided`.
- Merge: `d4b7d56` na `sweatshop/2026-09-24-1853`.

## Tests stage 2 writes (own commit, red)

- `src/playback/accelerationTracker.test.ts`: cena com um bloco preso numa mola esticada, sem amostra medida. Confere que a leitura não é `g` exato. Vermelho porque a estimativa devolve `g` com `approximate: false`.
- `src/playback/accelerationTracker.test.ts`: as duas pontas de uma corda e o corpo que monta uma polia da `via` levam `≈`; um corpo livre e um fixo na mesma cena leem como antes. Vermelho pela mesma razão. (Escrito pelo stage 2; adicionado aqui pelo review para a secção bater com o commit.)

## Comments

- 2026-09-25 Aberto pelo passe manual do PHY-33, item 5. O corpo desse caso também está apoiado no chão sem Contact declarado, e a estimativa também ignora esse apoio. Isso vem de antes da v4 (limitação de leitura da v2) e o triage decide se entra aqui.
- 2026-09-25 Stage 2: a leitura analítica leva `≈` quando o corpo é ponta de uma mola ou corda, ou carrega uma polia por onde passa uma corda. O apoio no chão sem Contact declarado ficou de fora (critérios não o pedem). Mutação: trocar a cláusula da polia por `false` deixa vermelho `accelerationTracker.test.ts:204` (carrier). Gate: 714/714, lint, typecheck e build verdes.
