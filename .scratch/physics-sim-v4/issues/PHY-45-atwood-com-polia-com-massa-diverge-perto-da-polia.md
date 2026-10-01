# PHY-45: O aro da polia segura o corpo que chega a ela, e a corda não troca de lado no disco
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`buildWorld`, o laço das polias; a montagem das linhas em `pullPieces`; `RopeBinding` e `ropeFrame`)
  - `src/scene/ropePath.ts` (`ropePath`)
  - `src/scene/ropePath.test.ts`
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)` e o bloco da Atwood com polia ideal, com os helpers `atwoodScene` que eles já usam)

#### What to build

Um corpo puxado até uma polia bate no aro e para ali, em vez de atravessar o disco. Depois do impacto ele pode balançar por baixo da polia, mas a corda não troca de lado no disco. A simulação continua estável, sem ganho de energia, com polia ideal ou com massa.

Hoje nada segura o corpo. A polia ideal não constrói nada no mundo do Rapier. O disco da polia com massa tem collider com `setCollisionGroups(0)`, que não toca em nada. A corda também não tem collider. O bloco atravessa o disco, e a corda o enrola por cima. Quando a ponta cruza o topo do disco, o `ropePath` refaz a cada passo a escolha do lado do enrolamento, pelo sinal da curva, e esse lado inverte. A geometria salta, e a correção injeta energia. A hipótese original deste ticket (a peça entre `a` e a polia encolhe até zero) estava errada: a peça fica no comprimento de repouso até o salto.

Medido com probes descartáveis no motor público, sobre `b29d75a`, no cenário PHY-43 (`atwoodScene(2, 2, 2)`, `a.vy = 6`):

| Passo | Início do arco | Varredura | Lado | Peças (repouso 3,443 / 4,443) |
| --- | --- | --- | --- | --- |
| 85 | 1,137 | 1,137 | −1 | 3,443 / 4,443 |
| 86 | 0,858 | 2,354 | +1 | 3,565 / 4,403 |

A peça 1 salta 12 cm em um passo. A tensão vai a 4843 / 3161 N, e a energia sobe 1550 J. O lado continua invertendo, o bloco bate no teto e a energia cresce sem limite.

Não é exclusivo da polia com massa:

| Cenário (240 passos) | Polia | `max T` | `max ΔE` | Resultado |
| --- | --- | --- | --- | --- |
| 2/2, `a` lançado a `vy = 6` | com massa (`M = 2`) | 2,8 MN | +378 kJ | diverge no passo 86 |
| 2/2, `a` lançado a `vy = 6` | ideal | 288 N | ≤ 0 | estável por sorte: o bloco trava girado contra o teto, ao lado do disco |
| 1/3, do repouso | com massa (`M = 2`) | 306 kN | +223 kJ | diverge no passo 86 |
| 1/3, do repouso | ideal | 2017 N | +1226 J | diverge no passo 73 |

**A decisão.** Três mudanças pequenas:

1. **Collider no aro.** Toda polia, ideal ou com massa, ganha um collider de bola de raio `R`, no seu suporte, na posição da âncora da polia. Ele não tem massa (`setMassProperties(0, …)`), tem atrito 0 (regra de combinação Min) e restituição 0. Ficar no suporte evita contato com o próprio corpo, inclusive na polia móvel. Os colliders de massa da polia com massa continuam no grupo 0.
2. **Guarda na previsão de `pullPieces`.** Com o aro, o bloco do 1/3 com polia com massa sobe encostado no disco. A previsão sem contato empurra a perna do fim do passo contra a perna do meio do passo, e a diagonal da matriz troca de sinal: a linha 0 foi de [2,261, −0,954] para [−0,350, 0,495], e a cena explodiu no passo 156 (9,4 kN, +13,7 kJ). A guarda é: se `ropeInvMass(row.pulls, row.along) ≤ 0`, usar `row.along = row.pulls`. É a versão com várias peças da guarda `k <= 0` que `pullRope` já tem, e é por isso que a corda de uma peça só nunca mostrou isto.
3. **A corda guarda o lado do enrolamento.** Com o aro, o bloco ricocheteia e pode balançar por baixo da polia. Quando as duas pernas ficam colineares, as duas pontas embaixo do disco, o sinal da curva vira com qualquer desvio lateral, e a direção do enrolamento inverte. Na polia ideal o comprimento quase não muda; na polia com massa o share do grip salta e a energia explode. A correção:
   - `ropePath` ganha um parâmetro opcional `keep`, com uma direção por polia.
   - Com `keep`, cada polia segue sempre a direção dada. Inverter o lado só é contínuo quando as duas pontas e o centro estão colineares, então qualquer cedência por arco (a regra de 3π/2 do protótipo) salta o comprimento. Uma corda em contato com a polia não troca de lado.
   - `RopeBinding` guarda as direções. `ropeFrame` as passa ao `ropePath` e as atualiza só quando lê as poses reais, não as previstas (meio e fim do passo).
   - Vale para toda polia, ideal ou com massa. Sem `keep`, `ropePath` faz o que faz hoje, e é assim que o `scenePath` continua chamando.

Com as três mudanças, medidas por probes descartáveis sobre `9d81e26`, 24 dos 26 cenários da grade abaixo ficam sem ganho de energia em 600 passos. Os 741 testes da suíte ficaram verdes, sem mudar tolerância, com o PHY-45 sozinho e também com os protótipos do PHY-49 e do PHY-50 por cima.

| Grade (600 passos) | Com aro e guarda, sem a direção guardada | Com as três |
| --- | --- | --- |
| 2/2, `vy` = 3, 4, 6, 8, `M = 2` | ok | ok |
| 2/2, `vy` = 5, 7, 10, `M = 2` | +2489 J, +820 J, +2,3 MJ | ok |
| 2/3 do repouso, `M = 2` | +1,2 MJ | ok |
| 1/3, 1/4, 2/1 do repouso, `M = 2` | ok | ok |
| 1/2 do repouso, `M = 2` | +165 J | +3,1 J (PHY-52) |
| 3/1 do repouso, `M = 2` | +54 J | +54 J (PHY-52) |
| os 13 com polia ideal | ok | ok |

O pico de tensão é o impacto do bloco no aro, a cerca de 5 m/s: cerca de 300 N.

**Fora do escopo:**
- Os picos de energia no impacto contra o aro da polia com massa, no 3/1 e no 1/2: ficam para o PHY-52.
- A corda que se solta da polia (a corda reta passa livre do disco, as duas pontas além da tangente, do lado do enrolamento): o modelo sempre enrola, então com `keep` a varredura cruza a costura 0/2π e o comprimento salta 2πR. Pede histórico de enrolamento, outro ticket; nenhum dos 24 cenários chega lá.
- Atrito do aro: fica 0. Um aro que esfrega pediria um gancho em `assignPairFrictions`.
- `readContacts` não lista o contato com o aro, porque a polia não é um corpo do documento.
- Uma cena que já começa com um corpo sobreposto a uma polia: o Rapier separa os dois no primeiro passo, como faz hoje com dois corpos sobrepostos.
- O desenho da corda (`scenePath`) não guarda a direção. Quando as pernas se cruzam por baixo da polia, o desenho pode inverter enquanto a simulação não inverte. É só visual.
- Uma polia móvel agora pode bater em outros corpos e no teto pelo aro. É a física certa, e os testes existentes da polia móvel continuam verdes.

#### Acceptance criteria

1. Com `atwoodScene` (teto em `y = 6`), ao longo de 600 passos, nos 24 cenários abaixo:
   - 2/2 com `a` lançado a `vy` = 3, 4, 5, 6, 7, 8 e 10; 1/3, 1/4, 2/1 e 2/3 do repouso; cada um com polia ideal e com polia com massa `M = 2`;
   - 1/2 e 3/1 do repouso, só com polia ideal.

   Em cada cenário:
   - a energia dos blocos, `Σ (½m·v² + ½I·ω² + m·g·y)` com `I = m·(w² + h²)/12`, nunca passa de `E₀ + 0,5 J`. A energia do disco fica fora, porque o motor público não a lê e ela parte de zero.
   - a âncora da corda em cada bloco (o topo do bloco, no mundo) nunca passa para o outro lado de `x = 0` enquanto está acima do centro da polia: o bloco não passa por cima do disco. Por baixo ele pode balançar.
2. `ropePath` com `keep`:
   - duas pontas embaixo de uma polia, quase colineares com o centro, trocando de lado uma da outra: com `keep` a direção fica a guardada, e o comprimento varia continuamente. Sem `keep`, a direção segue o sinal da curva, como hoje.
   - uma corda cujo enrolamento guardado passa de 3π/2 (o bloco balança por baixo e sobe do outro lado): com `keep`, a direção continua a guardada e o comprimento varia continuamente ao longo da transição, amostrado antes, durante e depois do ponto onde a regra antiga cedia. Sem `keep`, a direção segue o sinal da curva.
3. Os testes existentes de `acceptance.test.ts`, `simulator.test.ts` e `ropePath.test.ts` continuam verdes sem mudar tolerância, incluindo os da polia com massa (PHY-25), o PHY-43 e os da polia móvel.
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, com três mutações:
   - tirar o collider do aro: os 26 cenários da grade ficam vermelhos, e o 1/3 com polia ideal no passo 71;
   - tirar a guarda de `pullPieces`: o 1/3 com polia com massa fica vermelho no passo 156;
   - ignorar o `keep` em `ropePath`: o 2/2 com polia com massa e `vy = 5` fica vermelho.
5. Gate verde.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-45
    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npx vitest run src/scene/ropePath.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, pelo motor público (`createSimulator(parse(scene))`, `step()`, `readStates()`), sem mocks: os 24 cenários do critério 1, num `it.each`, nos blocos onde cada `atwoodScene` já vive (o da polia ideal e o PHY-25). Vermelhos hoje porque o bloco atravessa o disco: com o aro tirado do protótipo, os 26 da grade ficaram vermelhos. Um cenário que fique verde sobre o código de hoje fica como guarda e é registrado aqui.
- `src/scene/ropePath.test.ts`, chamando `ropePath` direto: os dois casos do critério 2. O primeiro fica vermelho hoje porque `ropePath` ignora o quarto argumento e a direção inverte.

## Comments

- 2026-10-01 Stage 2, reaberto pelo R1 da revisão. Proxy decided: `keep` segue sempre a direção guardada, sem a cedência de 3π/2; critério 2 (2º item), item 3 e fora do escopo reescritos acima — o item "segue a curva sem salto" era insatisfazível, porque os dois enrolamentos só têm o mesmo comprimento com `a`, centro e `b` colineares, e a cedência por arco salta (~2,2 m com `b = (1, −5)`, `a = (3, y)`, `keep = [−1]`). Os testes passam a amostrar o comprimento ao longo da transição. Se algum dos 24 cenários ficar vermelho sem a cedência, a corda se solta da polia no motor: parar e perguntar de novo.
- 2026-09-30 Aberto pelo foreman a partir da recomendação 7 do relatório `docs/relatorios/2026-09-30-sweatshop-gpt-6.1-sol.pdf`, aceita pelo Bruno. Medições acima; o probe foi descartado.
- 2026-10-01 Stage 1. Um diagnóstico descartável sobre `b29d75a` achou a causa (bloco atravessa o disco e o lado do enrolamento inverte) e prototipou o aro e a guarda. O Bruno aprovou método, escopo e critérios. Nada do protótipo foi commitado.
- 2026-10-01 Achado lateral do diagnóstico, aberto como PHY-49: as tensões lidas na Atwood com polia com massa alternam a cada passo.
- 2026-10-01 Stage 1 de revisão, antes do sweatshop. Com o protótipo reconstruído sobre `9d81e26`, os quatro cenários originais passavam, mas os vizinhos (2/2 com `vy` = 5, 7 e 10, 1/2 e 2/3 com polia com massa) explodiam. Além disso, o critério antigo "a âncora nunca cruza `x = 0`" reprovava o balanço legítimo por baixo da polia. Entraram a direção guardada, o critério 1b reescrito e a grade de 24 cenários. Os dois picos que sobram foram para o PHY-52. O Bruno aprovou. Nada do protótipo foi commitado.
- 2026-10-01 Stage 2, commit de testes. Vermelhos sobre o código de hoje: 23 dos 24 cenários (energia e/ou lado) e o primeiro caso do `ropePath` com `keep` (direção −1 onde se esperava +1). Guardas verdes hoje: o 2/2 com `vy = 3` e polia ideal (o bloco não chega ao disco) e o segundo caso do `ropePath` (direção do sinal da curva, que o código de hoje já segue). O segundo caso só pega a mutação "tirar o limite de 3π/2".
- 2026-10-01 Stage 2, mutate-verify (critério 4). Cada mutação sobre o código verde, com a saída vermelha, depois desfeita; gate verde de novo (767 testes) sem a mutação.
  - Tirar o collider do aro (`world.createCollider(rim, …)` trocado por `void rim`): `-t PHY-45` fica com 24 de 24 vermelhos (13 com polia ideal, 11 com `M = 2`), incluindo o 2/2 com `vy = 3` ideal, que era guarda verde antes do aro. Medido por 600 passos (energia ou lado), não pelo passo 71 do 1/3 ideal citado no critério.
  - Tirar a guarda de `pullPieces` (`row.along = row.pulls`): 6 vermelhos, todos com `M = 2`: 2/2 com `vy` = 5 e 7, 1/3, 1/4, 2/1 e 2/3 do repouso. O 1/3 com massa é o do passo 156 do critério. Os 13 com polia ideal ficam verdes.
  - Ignorar o `keep` (`ropeFrame` chama `ropePath(…, undefined)`): 4 vermelhos, todos com `M = 2`: 2/2 com `vy` = 5, 7 e 10, e 2/3 do repouso (o 2/2 com `vy = 5` do critério está entre eles). No `ropePath`, o primeiro caso de `keep` já nasceu vermelho (`expected -1 to be 1`).
  - Tirar o limite de 3π/2 em `ropePath` (`if (false && keep && …)`): o segundo caso de `keep` fica vermelho (`expected 1 to be -1`).
  - Os testes de `ropePath` chamam a função direto, então o vermelho do commit de testes basta como registro deles; os 24 cenários passam pelo motor público, e o registro está acima.
- 2026-10-01 Stage 2, reabertura (R1). Commit de testes `ae28633`: os dois testes novos de `keep` ficaram vermelhos sobre o código com a cedência (`direction at y = …` e `direction at e = -0.00: expected -1 to be 1`). Correção: `ropePath` segue sempre o `keep`, sem a regra de 3π/2 (`6993723`). Os 24 cenários ficaram verdes sem a cedência, então a corda não se solta da polia no motor.
  - Mutate-verify repetido sobre o código final: ignorar o `keep` (`return turn >= 0 ? 1 : -1`) deixa 7 vermelhos, 3 de `ropePath` e 4 do motor com `M = 2` (2/2 com `vy` = 5, 7 e 10, 2/3 do repouso; o de `vy = 5` dá `expected 2489.41… to be less than or equal to 0.5`). Desfeito; as mutações do aro e da guarda de `pullPieces` não tocam código alterado e valem como registradas acima.
  - Gate: 30 arquivos, 768 testes verdes; lint, typecheck e build com saída 0.
  - A atribuição `rope.keep = …` em `ropeFrame` (`simulator.ts:224`) virou idempotente com a cedência fora; fica, por ser inofensiva e fora desta correção.

#### Review (2026-10-01)

Verdict: Reopen (critério 2, R1)

Comparação fixada em `git diff ecfac46f813d2332f00bbe056f3a9d0a044c1732...b6b61d8`, base `sweatshop/2026-10-01-1211`. Revisão completa dos eixos Standards e Spec em sub-agentes; reprodução, mutações e validação pelo agente principal. Commits examinados: `59fe8bb` (testes e metadados) e `b6b61d8` (produção e metadados, sem alterar testes). Rebase sobre a sessão: já atualizado. Nenhuma linha `Proxy decided` no ticket.

**Standards:** Primary files e separação teste/código respeitados; nenhum smell com benefício concreto de correção. Três observações de documentação, sem bloquear este ticket: ADR-0004 ainda afirma que polias só têm colliders no grupo 0 e atravessam corpos; `simulator.ts:813` ainda diz "Mass 0 builds nothing"; `simulator.ts:1171` compara a nova guarda com o ramo escalar `k <= 0`, embora o escalar zere a tensão e retorne, enquanto a guarda troca `along`. Registradas no CLEAN-20, bloqueado pelo PHY-45 para documentar o mecanismo final.

**Spec:** um critério não atendido, R1 abaixo. Grade autorizada completa: 13 cenários ideais e 11 com massa, total 24, por 600 passos; energia calculada independentemente e cruzamento medido na âncora do topo transformada para o mundo. Nenhuma ampliação de escopo ou outra regressão identificada na leitura de todo o diff e dos callers.

**❌ R1 — critério 2: a troca de direção após a corda passar reta pela polia salta o comprimento.** Em `src/scene/ropePath.ts:57–59`, o rebuild com a direção natural não preserva o comprimento na passagem pela tangente. O segundo teste novo (`src/scene/ropePath.test.ts:224–233`) compara apenas uma pose depois da troca com o caminho natural; essa igualdade não verifica continuidade antes/depois.

Reprodução descartável, importando a função de produção `src/scene/ropePath.ts` diretamente no Node 24: uma polia em `(0, 0)`, raio `1`, `keep = [-1]`, `a = (-3, h)` e `b = (3, h)`. Subir as duas pontas por `h = 1` leva a corda ao segmento reto tangente no topo do disco e depois ao outro lado; ambas as pontas permanecem fora do disco.

| `h` | Direção | Varredura | Comprimento (m) |
| --- | --- | --- | --- |
| 0,999999 | −1 | 0,0000006666667036192564 | 6,000000000000334 |
| 1 | −1 | 0 | 6 |
| 1,000001 | +1 | 1,2870027509198187 | 7,287003417586782 |

Mover cada ponta 2 micrômetros produz um salto de **1,2870034175864484 m**. A asserção descartável `Math.abs(after.length - before.length) < 0.00001` falhou com exit 1: `AssertionError [ERR_ASSERTION]: criterion 2: continuous wrap switch; observed length jump=1.2870034175864484`. No limite pela esquerda o comprimento é 6; pela direita é `6 + 4·atan(1/3)`. O método descrito na prosa foi implementado, mas não cumpre o critério numerado "sem salto de comprimento".

Restante para a etapa 2: provar R1 em um commit de teste vermelho na mesma costura `ropePath` já autorizada, amostrando a transição antes/durante/depois; corrigir a continuidade preservando a direção guardada no balanço por baixo e os 24 cenários. O critério 2 e os demais critérios não foram reescritos. A correção exige teste novo, portanto não cabe como pequeno fix da etapa 3.

**Mutate-verify repetido pelo reviewer**, cada mutação isolada sobre `b6b61d8` e desfeita antes da seguinte:

| Mutação de produção | Saída vermelha reproduzida |
| --- | --- |
| Remover `world.createCollider(rim, …)`, substituindo por `void rim` | `-t PHY-45`: **24 failed, 71 skipped (95)**, exit 1. O 1/3 ideal falha com `expected 20210.342689398185 to be less than or equal to 0.5`. |
| Remover a atribuição da guarda de `pullPieces` | **6 failed, 18 passed, 71 skipped (95)**, exit 1. O 1/3 com massa falha com `expected 12890.141529255683 to be less than or equal to 0.5`. |
| Ignorar `keep` em `ropePath`, usando `natural.map((d) => d)` | **4 failed, 20 passed, 71 skipped (95)**, exit 1. O 2/2 com massa e `vy = 5` falha com `expected 2489.413977600549 to be less than or equal to 0.5`. |
| Desativar o limite de 3π/2 em `ropePath` | Nos dois testes PHY-45 de geometria: **1 failed, 1 passed, 12 skipped (14)**, exit 1; segundo caso: `expected 1 to be -1`. |

Discrepância de verificação no critério 4: o texto menciona 26 cenários, mas o critério 1 e o plano de testes autorizam 24; os dois casos com massa restantes pertencem ao PHY-52. Foram reproduzidos os 24 vermelhos autorizados, sem ampliar a grade. As asserções agregam os 600 passos; esta revisão não confirmou os passos exatos 71/156 citados na prosa.

Todas as mutações foram restauradas byte a byte; diff de produção e testes limpo. Após restaurar: `npx vitest run src/sim/acceptance.test.ts src/sim/simulator.test.ts src/scene/ropePath.test.ts` → **3 files passed, 138 tests passed**.

**Validação do gate:** duas tentativas do comando obrigatório pararam em `npm test`, ambas com **29 files passed, 1 failed; 766 tests passed, 1 failed (767)**. Única falha: timeout de 5000 ms no teste existente `src/sim/simulator.test.ts:520` ("a body launched beyond the viewport integrates indefinitely"); execuções de 6533/6457 ms. Esse arquivo isolado passa **29/29** em 2,86 s. Diagnóstico sem alterar testes, configuração ou tolerâncias: `npx vitest run --maxWorkers=2` → **30 files passed, 767 tests passed**, 35,29 s. Executados separadamente `npm run lint && npm run typecheck && npm run build`: todos exit 0; aviso existente de chunk acima de 500 kB. O diagnóstico com dois workers não substitui a confirmação do gate padrão no próximo handoff.

`Stage: to-implement` neste commit de reabertura, sem merge e sem linha no ledger. Sem alteração persistente de produção ou testes na revisão. Totais: Standards 3 observações de documentação no CLEAN-20; Spec 1 falha do critério 2 (R1), além da limitação de validação do gate registrada acima.
