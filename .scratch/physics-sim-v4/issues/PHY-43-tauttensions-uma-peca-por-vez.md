# PHY-43: O lado tenso de uma polia com massa não cai em queda livre quando o outro afrouxa
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`tautTensions`; e a previsão de `pullPieces`: solver unilateral com base zero e preservação da folga negativa no cálculo de `rate`)
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)`)

#### What to build

O active set do `tautTensions` tira de uma vez, numa passada, todas as peças cuja tensão saiu ≤ 0. As peças estão acopladas pelo disco (`K` não é diagonal). Assim, a tensão negativa de uma peça frouxa pode empurrar para ≤ 0 também a peça que deveria estar tensa. As duas saem, e o lado tenso fica sem força de corda nenhuma.

O Sonnet reproduziu isto, e eu confirmei com probe no motor real. O cenário é uma Atwood sobre polia com massa: `M = 2`, `m₁ = m₂ = 2`, `R = 0,25`, o bloco `a` lançado para cima a 6 m/s (`vy`) e o `b` parado. A peça 1 (de `a` até a polia) afrouxa, e a peça 2 (da polia até `b`) deveria segurar `b` e girar o disco:
- esperado: `T₂ = M·a/2 ≈ 6,54 N` e `a_b = m·g/(m + M/2) ≈ 6,54 m/s²`;
- medido: `T = [0,00; 0,00]`, `slack`, e `b` em queda livre exata (`vy` cai 0,654 a cada 4 passos). O disco nunca gira.

O Sonnet também mostrou que o laço de re-solve não tem teste: trocar `taut = still` por `return T` deixa os 714 testes verdes. A correção que ele testou foi tirar só a peça mais negativa por iteração, com guarda para o conjunto vazio. Nela `T₂` assenta em 6,58 N e `b.vy = −4,325` no passo 40, contra −4,36 esperado. O início é ruidoso: um pico de 36 N no passo 8 e oscilação até o passo 28.

#### Acceptance criteria

1. No cenário acima, na janela dos passos 30 a 40: a peça 1 mostra `T = 0`; a peça 2 mostra `T` a menos de 3% de `M·a/2`; o `Δv` de `b` entre os passos 30 e 40 fica a menos de 3% de `−m·g/(m + M/2)·(10·Δt)`; e a corda não aparece como `slack`. A folga da peça 1 fecha em `t = 2v₀/(g + a_b) = 0,734 s` (≈ passo 44; a previsão antecipa até um passo), por isso a janela termina em 40. O que acontece depois da retomada da tensão não é critério deste ticket.
2. Os testes de aceitação existentes da polia com massa (PHY-25) continuam verdes sem mudar tolerância
3. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, incluindo a mutação `taut = still` → `return T`
4. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-25: o cenário do critério 1, passos 30–40. O commit `7356ba8` já traz o teste com a janela 30–90; um segundo commit só de teste encurta o laço para 40 e o `Δv` para 10 passos. Vermelho porque hoje as duas peças saem juntas e `b` cai livre: `T₂ at step 30: expected 6.54 to be less than or equal to 0.1962`.

## Comments

- 2026-09-30 Stage 2 bloqueado — o teste já commitado em `7356ba8` expõe uma contradição física no critério 1, não uma tolerância a relaxar. Enquanto a peça 1 está frouxa, `y_a = 2 + 6t − gt²/2`, `y_b = 1 − a_b t²/2`, `a_b = 6,54 m/s²`. A folga é `6t − (g + a_b)t²/2`; fecha em `12/(9,81 + 6,54) = 0,733945 s`, aproximadamente passo 44. Portanto T₁ não pode permanecer zero até o passo 90 (1,5 s), nem b manter a aceleração de uma única peça tensa durante toda a janela. Stage 1 precisa revisar o critério 1 e o teste: uma janela anterior à retomada da tensão, ou outro cenário de lançamento com geometria verificada. Não foram alterados janela, tolerância ou teste após o commit vermelho.
- 2026-09-30 Proxy decided: confirmar a contradição física e bloquear stage 2 para revisão do critério 1 e da regressão no stage 1 — a folga fecha perto do passo 44 e a retomada da tensão é necessária; `ticket-flow` exige parar quando um teste já commitado se prova errado. Restaurar apenas as mudanças de produção ainda não commitadas e preservar `7356ba8`.
- 2026-09-30 Evidências da tentativa (probes descartáveis no motor real, sem arquivos novos): remover só a peça mais negativa em `tautTensions` recuperou T₂ = 6,579648 N e `b.vy = −4,324774 m/s` no passo 40, mas T₂ = 6,749734 N no passo 30 (erro 3,206948%). O transiente inicial teve pico de 35,981867 N no passo 8; os passos 28–30 ainda excederam 3%. Após retomada da tensão, a geometria também se degradou, com pico de T₂ = 3157,752404 N no passo 86; este pico tardio é distinto do transiente inicial e está fora do regime de uma peça frouxa.
- 2026-09-30 Diagnóstico da previsão: `pullPieces` usa `solveLinear` irrestrito para `piece.predicted`; no passo 1, previsão T₂ = −268,38 N versus correção T₂ = 6,540025 N, gerando residual espúrio de 274,920025 N. Reutilizar o solver unilateral e preservar a folga negativa na allowance da previsão eliminou o transiente: T₂ = 6,540025 N no passo 1, 6,548402 N no passo 30 e 6,556097 N no passo 40. O teste então falhou no passo 43 com T₁ = 76,077590 N; o contrato continua inválido para os passos seguintes. Todas essas mudanças de produção foram restauradas, não commitadas.
- 2026-09-30 Mutate-verify da única regressão nova: (a) solver original removendo todas as peças não positivas → `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999` (1 failed, 6 passed, 48 skipped); (b) na candidata de remoção individual, mutação exigida `taut = still` → `return T` → `T₁ at step 30: expected 19.621504623672802 to be +0` (1 failed, 54 skipped). Mutação restaurada. Não há green válido nem gate verde para esta entrega; o bloqueio impede o handoff para review.

- 2026-09-30 Proxy decided: ampliar o escopo de `simulator.ts` para o cálculo e a atribuição da tensão prevista em `pullPieces`, mantendo o teste público e todos os critérios — a previsão irrestrita inclui forças compressivas excluídas pela correção unilateral; a diferença contamina o residual da próxima passada. Reutilizar `tautTensions` com base zero é uma correção pequena e reversível no mesmo fluxo físico. O modelo Claude Fable do card não está disponível neste runtime; o proxy usou o modelo herdado da sessão.

- 2026-09-30 Stage 2 — regressão pelo motor público (`createSimulator` → `step` → `readConstraints`/`readStates`), no bloco PHY-25. Antes da correção: `npx vitest run src/sim/acceptance.test.ts -t PHY-25` → 1 failed, 6 passed, 48 skipped (55). Vermelho no passo 30: `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999`; T₂ observado = 0 N, esperado = 6,54 N. O teste verifica cada leitura dos passos 30–90 e Δv entre os passos 30 e 90, sem alterar testes ou tolerâncias existentes.

- 2026-09-30 Aberto a partir do F1 do Sonnet no review de benchmark do PR 9. A queda livre foi reproduzida por probe descartável no motor real. O stage 2 registra aqui o transiente do início (o pico e até que passo ele dura) depois da correção. O transiente não é critério; se parecer grande demais, vira um ticket próprio.

- 2026-09-30 Attempt 1 stopped to ask: PHY-43 ficou `blocked`: a folga fecha perto do passo 44, tornando impossível manter T₁ = 0 até o passo 90. /  / Teste vermelho e evidências salvos em `7356ba8` e `20ba572`. Código de produção restaurado. /  / A [skill `ticket-flow`](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. O stage 1 precisa revisar a janela do critério 1.

- 2026-09-30 Proxy decided: janela do critério 1 passa a 30–40 mantendo o cenário — a folga fecha analiticamente no passo 44 (`12/(9,81 + 6,54) = 0,734 s`) e a geometria (borda da polia em y = 5,0) limita v₀ a ~7 m/s, o que só empurraria o fecho para o passo ~51; nenhum lançamento dá 60 passos frouxos depois de 30 de assentamento.

- 2026-09-30 Proxy decided: a previsão `piece.predicted` em `pullPieces` entra no escopo (solver unilateral com base zero no lugar de `solveLinear` irrestrito) — sem ela T₂ = 6,75 N no passo 30 (3,2%) e o critério 1 falha; com ela 6,548 N. Retomar de `refs/foreman/phy-43-attempt1` (`7356ba8` + `20ba572`) com um segundo commit só de teste. O pico de 3157 N no passo 86 após a retomada da tensão fica fora deste ticket; abrir ticket próprio se persistir depois da correção.

- 2026-09-30 Stage 2 retomado de `refs/foreman/phy-43-attempt1`, rebaseado sobre `sweatshop/2026-09-24-1853`; conflito documental resolvido preservando o contrato revisado e as evidências históricas. Segundo commit só de teste: janela 30–40 e Δv em 10·TIMESTEP. `npx vitest run src/sim/acceptance.test.ts -t PHY-25` → 1 failed, 5 passed, 45 skipped (51): `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999`. Produção ainda intacta.

- 2026-09-30 Proxy decided: ampliar o escopo de `pullPieces` para preservar a folga negativa no cálculo de `rate`, usando `ropeAllowance(Math.min(target, nowLengths[k]! - piece.length))` — só trocar o solver previsto ainda produz T₂ = 6,763920 N no passo 30 (3,42%); a allowance com `target` descarta a folga e contamina o residual. Mesma costura pública, critérios e teste mantidos. O modelo Claude Fable do card não está disponível neste runtime; o proxy usou o modelo herdado da sessão.

#### Stage 2 handoff (2026-09-30)

- Correção: `tautTensions` remove só a peça de menor tensão por iteração e retorna zeros quando o conjunto fica vazio. `pullPieces` prevê a leitura pelo mesmo solver unilateral com base zero, preservando a folga negativa na allowance. Nenhum teste ou tolerância alterado no commit de produção.
- Red: segundo commit só de teste `a3c263d`, depois dos commits da tentativa anterior reaplicados como `20d165e` e `cd62f9b`; motor público com janela 30–40 falha por T₂ = 0 N no passo 30 (1 failed, 5 passed, 45 skipped).
- Mutate-verify da única regressão nova, `PHY-43: launching a upward leaves b supported by the massive pulley with T₂ = M·a/2, within 3%`, via `npx vitest run src/sim/acceptance.test.ts -t PHY-43`. Cada mutação foi aplicada isoladamente sobre a correção e restaurada antes do gate; cada execução deu 1 failed, 50 skipped (51):
  - `taut = still` → `return T`: `T₁ at step 30: expected 19.800741150548525 to be +0`.
  - Remoção individual → filtro original de todas as peças com T ≤ 0: `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999` (T₂ = 0 N).
  - Allowance da previsão → `ropeAllowance(target)`, descartando a folga: `T₂ at step 30: expected 0.22392030779169314 to be less than or equal to 0.19619999999999999` (T₂ = 6,763920 N).
  - Previsão unilateral com base zero → `solveLinear` irrestrito: `T₂ at step 30: expected 49027.152451571965 to be less than or equal to 0.19619999999999999`.
- Green: `npx vitest run src/sim/acceptance.test.ts -t PHY-25` → 6 passed, 45 skipped (51), incluindo os testes existentes sem alterar tolerâncias. Gate `npm test && npm run lint && npm run typecheck && npm run build` → exit 0; 30 arquivos, 719 testes aprovados. Build emite aviso de tamanho de chunk.
- Probe descartável no motor público, passos 1–40: T₁ = 0 e corda tensa; T₂ = 6,540025 N no passo 1, 6,540301 N no 8, 6,547108 N no 28, 6,548402 N no 30 e 6,556097 N no 40. Não houve pico inicial nem leitura fora dos 3% nesse intervalo; máximo 6,556097 N no passo 40. Janela 30–40: erro máximo de T₂ = 0,2461%; Δv_b = −1,088963 m/s, esperado −1,09 m/s (erro 0,0951%). Depois da retomada da tensão permanece fora do critério e não foi avaliado nesta entrega.

#### Resolution (2026-09-30)

Verdict: Approve

Revisão completa fixada em `git diff f28a7d0728996167b8fc3f325755cc927b9f22c4...8a84919`, base `sweatshop/2026-09-24-1853`. Standards e Spec examinados por sub-agentes independentes; gate e repetição das mutações pelo agente principal. Commits: `20d165e` (teste vermelho e metadados), `cd62f9b` (bloqueio documental da tentativa), `a3c263d` (segundo commit só de teste e metadados com a janela aprovada) e `8a84919` (produção e metadados, sem alterar testes).

##### Standards

Nenhum achado bloqueante ou smell. Primary files e costura pública respeitados; a revisão da janela antecede a produção, preservando a separação teste/código. A correção compartilhada alcança a previsão e a correção, sem abstração nova. A duplicação escalar/matricial permanece autorizada pelo ADR-0004.

Uma nota documental não bloqueante: as evidências históricas recuperadas foram inseridas no começo de `## Comments`, antes de comentários existentes; `docs/agents/issue-tracker.md` orienta acrescentar ao final. Isso não é critério descumprido, violação de Primary files/test-first ou regressão, portanto não justifica reabrir. Histórico preservado nesta revisão.

As cinco decisões `Proxy decided` foram conferidas:

1. Bloqueio histórico da janela impossível 30–90, restauração da produção e preservação do teste vermelho: mantidos no histórico, com os commits reaplicados identificados no handoff.
2. Expansão histórica para a tensão prevista unilateral: reafirmada no contrato aceito e implementada pelo solver compartilhado com base zero.
3. Janela aprovada 30–40: aplicada no segundo commit de teste antes da correção; critérios não reescritos nesta revisão.
4. Previsão no escopo, retomada com segundo commit só de teste e exclusão do pico após retomada da tensão: respeitados.
5. Folga negativa preservada no `rate` por `ropeAllowance(Math.min(target, nowLengths[k]! - piece.length))`: implementada exatamente no escopo autorizado.

As decisões históricas de expansão da previsão e do `rate` registram uso do modelo herdado pelo proxy porque o modelo Claude Fable do card estava indisponível; não houve nova decisão de proxy nesta revisão.

##### Spec

Nenhum requisito escrito ausente, ampliação não autorizada ou implementação incorreta identificados. Os três usos de `tautTensions` foram rastreados: previsão da leitura, força com residual e correção com a tensão aplicada. O conjunto vazio retorna zeros; a remoção individual recalcula o acoplamento antes de retirar outra peça. O readout usa as tensões corrigidas por segmento e só marca a corda como frouxa quando todas são zero.

| Critério | Resultado da revisão |
| --- | --- |
| 1 | ✅ Regressão pública percorre os passos 30–40 no cenário aprovado, verificando T₁ = 0, T₂ dentro de 3% de 6,54 N, corda tensa e Δv de b dentro de 3% de −1,09 m/s. |
| 2 | ✅ Bloco PHY-25: 6 passed, 45 skipped (51); testes anteriores e tolerâncias intactos no diff. |
| 3 | ✅ As quatro mutações registradas foram repetidas e falharam pelo motivo esperado, incluindo `taut = still` → `return T`; evidências abaixo. |
| 4 | ✅ Gate independente antes da revisão e novamente após restaurar as mutações: 30 arquivos, 719 testes; lint, typecheck e build exit 0. |

Prova independente da única regressão nova, pela interface pública `parse` → `createSimulator` → `step` → `readStates`/`readConstraints`:

| Produção / comando | Resultado reproduzido |
| --- | --- |
| Produção do commit vermelho `a3c263d`, teste final inalterado; `npx vitest run src/sim/acceptance.test.ts -t PHY-25` | **1 failed, 5 passed, 45 skipped (51)**; `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999`. |
| `taut = still` → `return T`; `npx vitest run src/sim/acceptance.test.ts -t PHY-43` | **1 failed, 50 skipped (51)**; `T₁ at step 30: expected 19.800741150548525 to be +0`. |
| Remoção individual → filtro original de todas as peças com T ≤ 0; mesmo comando PHY-43 | **1 failed, 50 skipped (51)**; `T₂ at step 30: expected 6.54 to be less than or equal to 0.19619999999999999`. |
| Allowance da previsão → `ropeAllowance(target)`; mesmo comando PHY-43 | **1 failed, 50 skipped (51)**; `T₂ at step 30: expected 0.22392030779169314 to be less than or equal to 0.19619999999999999`. |
| Previsão unilateral com base zero → `solveLinear` irrestrito; mesmo comando PHY-43 | **1 failed, 50 skipped (51)**; `T₂ at step 30: expected 49027.152451571965 to be less than or equal to 0.19619999999999999`. |
| Produção restaurada; `npx vitest run src/sim/acceptance.test.ts -t PHY-25` | **6 passed, 45 skipped (51)**. |
| Produção restaurada; `npm test && npm run lint && npm run typecheck && npm run build` | **30 test files passed (30), 719 tests passed (719)**; demais comandos exit 0. |

Cada mutação foi aplicada isoladamente e restaurada byte a byte; hash SHA-256 e diff confirmam restauração sem mudanças em produção ou testes. O script inicial de mutação parou ao tentar casar um trecho com quebras de linha mistas, após restaurar a primeira mutação; as três restantes foram repetidas com substituições por linha. Nenhum resultado vermelho decorreu desse problema do script.

Sem correção de produção nesta revisão. A retomada da tensão após a janela aceita continua fora do contrato e não foi avaliada; aviso existente do chunk tardio acima de 500 kB mantido. Arquivos entregues: `src/sim/simulator.ts` e `src/sim/acceptance.test.ts`; fechamento neste ticket e em `.scratch/physics-sim-v4/ledger.md`.

Rebase sobre a sessão já atualizado, sem conflitos. Merge `--no-ff` na sessão: `8e97790`. `Stage: done` e linha no ledger no mesmo commit de fechamento. Totais: Standards **0 achados reabríveis / 1 nota documental não bloqueante**; Spec **0 achados**.
