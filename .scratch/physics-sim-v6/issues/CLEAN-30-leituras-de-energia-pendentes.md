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

- 2026-10-04 Correção pedida explicitamente na revisão do PR16. Contrato acima incorpora a decisão Proxy decided já registrada, sem nova decisão. Inspecionados polling, captureFrame/resetRecording/showFrame, syncWorld, edição estrutural/ao vivo, boot/retry e troca de cena. O fallback fica local à energia para não alterar gravação nem leituras de vínculos.

- 2026-10-03 Aberto na revisão do PHY-71 (merge `e484370`). Motivo de blocked: stage 1 precisa definir o comportamento das energias quando não há estado válido para o documento exibido, e então publicar Primary files, critérios numerados e testes. Os critérios 3/4 do PHY-71 cobrem quadros com estado válido; a revisão não acrescentou uma política de fallback.
- Problema confirmado em `src/App.tsx:976-982`: o poll combina `displayedScene()` com `liveFrameRef.current.states` mesmo quando `pendingRebuildRef.current` é true. Edições estruturais em t0 limpam `statesRef`, mas mantêm o quadro vivo antigo. Em reset/troca que falha, `captureFrame` pode ler o mundo anterior, pois `replaceScene` é transacional.
- Reprodução DOM, sem alterar a produção: fixture `setupRecording` de `src/App.test.ts`, corpo ball de 1 kg, g=10, y=4. Selecionar o corpo, editar `properties.posY` para 5 e avançar o poll em 100 ms. Recebido: `posição: (6,00, 5,00) m` junto de `E_pg: 40,00 J`; a leitura permanece na altura anterior até reconstruir.
- Segunda reprodução: fixture existente CLEAN-16, teste `uma troca de cena cujo replaceScene falha não mostra poses ou velocidades da cena anterior, nem após o retry`. Após um passo, a cena antiga tem vx=5. Trocar para a cena com vx=2 e fazer `replaceScene` falhar uma vez. Recebido: `velocidade: 2,00 m/s`, `E_c: 12,50 J`, `|p|: 5,00 kg·m/s`. A energia e o momento são os do mundo anterior, embora a cinemática já mostre o documento novo.
- Sondagens temporárias com asserções contra E_pg=50,00 J e E_c=2,00 J: `npm test -- src/App.test.ts -t 'review probe|uma troca de cena cujo replaceScene falha'` → **2 failed / 135 skipped (137)**. Essas expectativas demonstram a discrepância; não escolhem o fallback. Instrumentação restaurada byte a byte. Suíte original após restauração: **1078 passed**, lint/typecheck/build verdes.
- Pergunta para stage 1: sem estado válido para o documento atual, as energias devem mostrar `readout.noData` até reconstruir ou usar um estado inicial do documento? Avaliar também o sistema, molas/polias, boot com edições pendentes e retry. A cinemática e o histórico válido devem preservar seu comportamento atual.
- Costuras existentes para especificar a correção: poll de energia e invalidação/captura do quadro em `src/App.tsx`, testes de DOM em `src/App.test.ts`. `src/sim/energy.ts` não apresentou erro de cálculo. Nenhuma correção foi implementada nesta triagem.
- Proxy decided: sem estado válido para o documento exibido (reconstrução pendente após edição estrutural em t0, `replaceScene` que falhou até o retry, boot), energia e momento do corpo e do sistema vêm de um estado derivado do documento (posição, rotação, vx/vy, angvel 0; Δx da mola via `springDx` de `src/editor/doc.ts`; polia e cadeia valem 0 em t0), nunca `readout.noData` nem o quadro vivo antigo; sistema sem corpos não fixos continua `sem leitura`; histórico gravado e leitura de vínculos mantêm o comportamento atual — a cinemática do mesmo painel já cai para o documento (CLEAN-16) e o mundo reconstruído em t0 devolve exatamente esse estado, então o valor é exato, não aproximado. Continua `blocked` aguardando o stage 1 publicar Primary files, critérios numerados e testes (as duas reproduções da revisão dão os valores esperados).
