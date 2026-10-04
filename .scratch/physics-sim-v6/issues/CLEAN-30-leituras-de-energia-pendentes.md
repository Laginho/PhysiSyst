# CLEAN-30: Energia e momento antigos enquanto o mundo aguarda reconstrução
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (poll de energia: seleção de estados/vínculos/polias para documento sem quadro válido)
  - src/App.test.ts (costura DOM do painel e controles existentes)
  - src/editor/doc.ts (`springDx`, consumido sem alterar)
  - src/sim/energy.ts (`bodyEnergy`/`systemEnergy`, consumidos sem alterar)

#### What to build

Aplicar a decisão do proxy existente: sem quadro válido para o documento exibido, o painel calcula energia e momento do corpo e sistema com posição, rotação e vx/vy do documento, angvel zero e Δx de `springDx`. Energia cinética da cadeia e da polia é zero neste estado inicial. Não usar estados, vínculos ou polias do mundo anterior. A leitura cinemática, o histórico válido e os vínculos mantêm seus contratos.

#### Acceptance criteria

1. Edição estrutural em t0 ainda sem reconstrução mostra energia e momento do documento atual no corpo e sistema; m=1/g=10/y=5 mostra E_pg=50 J.
2. Reset/troca de cena com replaceScene falhando usa o documento até o retry; m=1/vx=2 mostra E_c=2 J e |p|=2 kg·m/s, e após retry usa o quadro válido novo.
3. Boot sem simulador e edições durante boot usam o documento atual, inclusive vx/vy e rotação para o centro de massa, com angvel=0.
4. No fallback, mola usa Δx do documento via springDx; contribuições cinéticas de cadeia e polia são zero; a leitura de vínculos não recebe estados artificiais de energia.
5. Sistema vazio ou só com corpos fixos continua sem leitura. Quadros históricos válidos (incluindo frame zero) preservam seus estados/vínculos/polias gravados.

#### Verification

    npm test -- src/App.test.ts -t CLEAN-30
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: painel após edição estrutural t0, troca/reset falhos e retry, boot com edição pendente, mola/cadeia/polia e ausência de corpos dinâmicos; valores literais calculados dos exemplos. Histórico e vínculos cobertos também pelos testes existentes PHY-64/71.
- Para cada nova regressão DOM, registrar abaixo a mutação em produção e o vermelho correspondente.

## Comments

#### Stage 2 regression proof (2026-10-04)

- The first test-only commit is `63bf4ee`: structural t0 edit red, E_pg expected 50 J / received 40 J (`clean30-red1.log`, 1 failed / 141 skipped). Additional tests are committed separately before the production change. The scene-switch regression extends the existing CLEAN-16 DOM test instead of duplicating its harness.
- Restoring the production poll from the pre-fix HEAD makes five regression cases red: **5 failed / 2 passed / 140 skipped (147)** (`clean30-original-red.log`, exit 1). Restored corrected source passes **7 passed / 140 skipped**. Every mutation below changed `src/App.tsx`; byte-exact restoration in `finally` followed each run.
- Cursor > 0 always uses its valid recorded states, constraints and pulleys. Cursor 0 can contain a stale capture after failed reset, so pending rebuild also selects document energy there. Structural edits while visiting zero reset the recording; the fallback does not publish to recording, statesRef or constraintReadout. Existing PHY-71 historical/frame-zero tests remain part of validation.

##### DOM mutate-verify evidence

Logs live outside the repository at `%TEMP%/clean30-*.log`, each with EXIT_CODE. Counts below are from those logs, not reruns.

| Regression test | Production mutation | Red output |
| --- | --- | --- |
| structural t0 edit awaits rebuild | remove pendingRebuildRef from fromDocument | Expected E_pg: 50,00 J; received E_pg: 40,00 J alongside position y=5. `clean30-mutant-pending.log`: 5 failed / 2 passed. |
| scene switch fails and retry succeeds (extended CLEAN-16) | same pending guard removal | Expected E_c: 2,00 J / p=2; received E_c: 12,50 J / p=5. Same log/count. |
| failed reset until successful retry | same pending guard removal | Expected E_c: 0,00 J; received E_c: 12,50 J / p=5. Same log/count. |
| initial velocity and rotated triangle during boot/edit | restore pre-fix energy poll | Expected E_c: 25,00 J; received body details with no energy lines. `clean30-original-red.log`: 5 failed / 2 passed. |
| same boot test, after completed boot with pending edit | remove pending guard only | Boot fallback initially passes; after resolution expected E_pg: 42,00 J, received E_pg: 36,00 J from boot document. `clean30-mutant-pending.log`: 5 failed / 2 passed. |
| document spring strain, zero chain/pulley kinetic, no fake constraint readings | replace springDx(scene, c) by 0 | Expected E_el: 20,00 J; received 0,00 J. `clean30-mutant-spring.log`: 1 failed / 6 passed. |
| same spring test, chain exclusion | concatenate old frame.constraints to document constraints | Expected E_c: 0,00 J; received 7,00 J. `clean30-mutant-chain.log`: 1 failed / 6 passed. |
| same spring test, pulley exclusion | pass frame.pulleys even during fallback | Expected E_c: 0,00 J; received 4,50 J. `clean30-mutant-pulley.log`: 1 failed / 6 passed. |
| no system reading for fixed document during boot | remove non-fixed-body guard | Expected sem leitura; received E_mec: 0,00 J. `clean30-mutant-fixed.log`: 2 failed / 5 passed. |
| no system reading for empty document during boot | same guard removal | Expected sem leitura; received E_mec: 0,00 J. Same log/count. |

- 2026-10-04 Correção pedida explicitamente na revisão do PR16. Contrato acima incorpora a decisão Proxy decided já registrada, sem nova decisão. Inspecionados polling, captureFrame/resetRecording/showFrame, syncWorld, edição estrutural/ao vivo, boot/retry e troca de cena. O fallback fica local à energia para não alterar gravação nem leituras de vínculos.

- 2026-10-03 Aberto na revisão do PHY-71 (merge `e484370`). Motivo de blocked: stage 1 precisa definir o comportamento das energias quando não há estado válido para o documento exibido, e então publicar Primary files, critérios numerados e testes. Os critérios 3/4 do PHY-71 cobrem quadros com estado válido; a revisão não acrescentou uma política de fallback.
- Problema confirmado em `src/App.tsx:976-982`: o poll combina `displayedScene()` com `liveFrameRef.current.states` mesmo quando `pendingRebuildRef.current` é true. Edições estruturais em t0 limpam `statesRef`, mas mantêm o quadro vivo antigo. Em reset/troca que falha, `captureFrame` pode ler o mundo anterior, pois `replaceScene` é transacional.
- Reprodução DOM, sem alterar a produção: fixture `setupRecording` de `src/App.test.ts`, corpo ball de 1 kg, g=10, y=4. Selecionar o corpo, editar `properties.posY` para 5 e avançar o poll em 100 ms. Recebido: `posição: (6,00, 5,00) m` junto de `E_pg: 40,00 J`; a leitura permanece na altura anterior até reconstruir.
- Segunda reprodução: fixture existente CLEAN-16, teste `uma troca de cena cujo replaceScene falha não mostra poses ou velocidades da cena anterior, nem após o retry`. Após um passo, a cena antiga tem vx=5. Trocar para a cena com vx=2 e fazer `replaceScene` falhar uma vez. Recebido: `velocidade: 2,00 m/s`, `E_c: 12,50 J`, `|p|: 5,00 kg·m/s`. A energia e o momento são os do mundo anterior, embora a cinemática já mostre o documento novo.
- Sondagens temporárias com asserções contra E_pg=50,00 J e E_c=2,00 J: `npm test -- src/App.test.ts -t 'review probe|uma troca de cena cujo replaceScene falha'` → **2 failed / 135 skipped (137)**. Essas expectativas demonstram a discrepância; não escolhem o fallback. Instrumentação restaurada byte a byte. Suíte original após restauração: **1078 passed**, lint/typecheck/build verdes.
- Pergunta para stage 1: sem estado válido para o documento atual, as energias devem mostrar `readout.noData` até reconstruir ou usar um estado inicial do documento? Avaliar também o sistema, molas/polias, boot com edições pendentes e retry. A cinemática e o histórico válido devem preservar seu comportamento atual.
- Costuras existentes para especificar a correção: poll de energia e invalidação/captura do quadro em `src/App.tsx`, testes de DOM em `src/App.test.ts`. `src/sim/energy.ts` não apresentou erro de cálculo. Nenhuma correção foi implementada nesta triagem.
- Proxy decided: sem estado válido para o documento exibido (reconstrução pendente após edição estrutural em t0, `replaceScene` que falhou até o retry, boot), energia e momento do corpo e do sistema vêm de um estado derivado do documento (posição, rotação, vx/vy, angvel 0; Δx da mola via `springDx` de `src/editor/doc.ts`; polia e cadeia valem 0 em t0), nunca `readout.noData` nem o quadro vivo antigo; sistema sem corpos não fixos continua `sem leitura`; histórico gravado e leitura de vínculos mantêm o comportamento atual — a cinemática do mesmo painel já cai para o documento (CLEAN-16) e o mundo reconstruído em t0 devolve exatamente esse estado, então o valor é exato, não aproximado. Continua `blocked` aguardando o stage 1 publicar Primary files, critérios numerados e testes (as duas reproduções da revisão dão os valores esperados).
