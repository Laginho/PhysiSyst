# PHY-65: Play e passo único a partir de um ponto anterior
Stage: done
Status: ready-for-agent
Blocked by: PHY-64
Review: human
Difficulty: normal

- Primary files:
  - src/playback/scheduler.ts (`advance`: `play`, `frame`, `stepOnce` com cursor)
  - src/playback/scheduler.test.ts
  - src/App.tsx (o laço de `frame` e o `stepOnce`, que hoje rodam passos no mundo vivo)
  - src/App.test.ts

#### What to build

Com o PHY-64, play ou passo único com o slider para trás primeiro voltam ao vivo. Depois deste ticket, eles tocam o que está gravado a partir do ponto do slider e, ao chegar ao fim da gravação, continuam ao vivo (decisão do Bruno). O replay respeita a velocidade: o cursor avança pelos registros à mesma taxa de passos que o mundo vivo avançaria.

Regra no scheduler, com `length` = registros na gravação, que `frame` e `stepOnce` passam a carregar como o `seek` do PHY-64: o cursor `c` avança `k` passos (os `k` de hoje: o crédito de velocidade no `frame`, 1 no `stepOnce`). Se `c + k < length − 1`, o cursor vai a `c + k` e nenhum passo roda no mundo. Senão, o cursor fica `null` (ao vivo) e rodam no mundo os `c + k − (length − 1)` passos que sobraram. Sem a gravação cheia, o último registro é o próprio mundo vivo, então o replay emenda no ao vivo sem salto. Com a gravação cheia e o mundo além de 10 s, chegar ao fim pula para o mundo vivo.

Isso substitui o critério 3 e o 15 do PHY-64 (play e passo com o cursor num registro voltavam ao vivo antes de agir).

#### Acceptance criteria

1. No scheduler, `play` com o cursor num registro passa a tocar e mantém o cursor.
2. No scheduler, `frame` tocando com o cursor `c` e `k` passos de crédito: com `c + k < length − 1`, o cursor vai a `c + k`, a transição pede 0 passos e `stepsTaken` não muda; com `c + k ≥ length − 1`, o cursor fica `null` e a transição pede `c + k − (length − 1)` passos.
3. No scheduler, `stepOnce` com o cursor `c` segue a mesma regra com `k = 1`, em qualquer status.
4. No scheduler, com o cursor `null`, `play`, `frame` e `stepOnce` agem exatamente como hoje.
5. No app, play com o slider no registro i desenha os registros i+1, i+2… nos quadros seguintes (em 1x, um registro por quadro; em 0,5x, um a cada dois quadros), e o slider, o rótulo de tempo e o painel de leitura acompanham.
6. Durante o replay a gravação não cresce. Ao chegar ao fim (sem a gravação cheia), o mundo vivo volta a dar passos e a gravação volta a crescer, sem salto: as poses do primeiro quadro ao vivo continuam as do último registro.
7. Os campos de g e F, undo e redo voltam a ficar habilitados quando o replay chega ao ao vivo.
8. Pausar durante o replay mantém o cursor onde está.
9. Passo único com o slider no registro i mostra o registro i+1, sem dar passo no mundo; no penúltimo registro, vai ao ao vivo.
10. Com a gravação cheia e o mundo além de 10 s, o replay que chega ao fim passa a mostrar o mundo vivo.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/playback/scheduler.test.ts`: critérios 1 a 4 chamando `advance` direto; 1 a 3 vermelhos hoje (o PHY-64 manda o cursor a `null`). Os testes do PHY-64 que fixam "volta ao vivo antes de agir" (critério 3 dele) são trocados nesse mesmo commit. O 4 passa hoje e vai junto.
- `src/App.test.ts`, com o simulador falso e o `requestAnimationFrame` controlado: critérios 5 a 10; vermelhos hoje. Os testes do critério 15 do PHY-64 são trocados no mesmo commit. Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.

## Comments

- 2026-10-02 Aberto no stage 1 dos tickets do feedback da v4 (fatiado do PHY-64 pelo Bruno).
- Bruno decidiu: play depois de voltar toca o gravado e depois continua ao vivo.
- Proxy decided: passo único com o slider para trás avança um passo seguindo a regra do play; a velocidade continua sendo só a taxa do play — o passo é a menor unidade da mesma regra.
- Planner: o excesso de passos além do fim da gravação roda no mundo vivo; com a gravação cheia isso é um salto para o mundo vivo, aceito porque só acontece depois de 10 s.

- Stage 2 (2026-10-03): PHY-64 está done na base sweatshop/2026-10-02-2210. Consumidores de advance: App (dispatch/frame/fail), testes de integração, overlay e accelerationTracker. Os consumidores ao vivo existentes omitem length; preservar essa compatibilidade. Casos de fronteira: cursor zero, crédito fracionário sem passo, igualdade no último registro, excesso a 2x, gravação inicial/vazia no transporte ao vivo e limite de 600 registros.
- Red antes de produção: `npx vitest run src/playback/scheduler.test.ts src/App.test.ts --reporter=dot`: 15 failed, 170 passed (185). As falhas são do contrato antigo: play perde cursor, stepOnce executa física em vez de história, frame ignora cursor. No DOM: replay 1x/0.5x recebeu slider 4 em vez de 0; single-step recebeu 4 em vez de 2; excesso 2x deu 6 passos em vez de 5; limite play/step recebeu 599 em vez de 598; teste atualizado da PHY-64 recebeu passos 203 em vez de 11.
#### Stage 2 — mutate-verify (2026-10-03)

Mutações temporárias em produção, sempre restauradas em `finally`. Nenhum teste usa cópia do scheduler.

- M1: em `advanceCursor`, substituir o cálculo por `cursor = null` e `steps = credit` (pular registros e executar física).
- M2: remover `showFrame(...)` do laço de frame do App (não exibir o registro nem restaurar o snapshot vivo antes dos passos excedentes).
- M3: devolver `cursor: null` no `play` do scheduler.
- M4: remover `setPlayback(t.state)` do laço de frame (refs avançam, mas os controles React ficam no cursor antigo).

Comando M1: `npx vitest run src/App.test.ts src/playback/scheduler.test.ts -t 'PHY-65' --reporter=dot`: **14 failed, 4 passed, 167 skipped (185)**. Comando M2: `npx vitest run src/App.test.ts -t 'PHY-65' --reporter=dot`: **4 failed, 2 passed, 120 skipped (126)**.

Evidência por teste DOM novo (nomes começam com PHY-65):

| Teste | Mutação | Saída vermelha observada |
|---|---|---|
| replay at 1x paints recorded frames, pauses and resumes live without a jump | M1; M2 | `expected '5' to be '1'`; leitura não contém `(6.01, 4.00) m` |
| replay at 0.5x paints recorded frames, pauses and resumes live without a jump | M1; M2 | `expected '4' to be '0'`; leitura não contém `(6.01, 4.00) m` |
| single-step follows records and unlocks live fields and both history actions at the tip | M1; M4 | `expected '4' to be '2'`; `expected true to be false` nos controles que deveriam desbloquear |
| spends only surplus 2x credit in the live world and restores live acceleration first | M1; M2 | `expected vi.fn() to be called 5 times, but got 6 times`; leitura não contém `(9.00, 0.00) m/s²` |
| capped replay reaches the current live world via play | M1; M2 | `expected '599' to be '598'`; leitura não contém `(11.98, 4.00) m` |
| capped replay reaches the current live world via step | M1 | `expected '599' to be '598'` |

M3: `npx vitest run src/playback/scheduler.test.ts -t 'play keeps' --reporter=dot`: **1 failed, 58 skipped (59)**, cursor `null` em vez de `2`. M4: `npx vitest run src/App.test.ts -t 'PHY-65 single-step' --reporter=dot`: **1 failed, 125 skipped (126)**. Os oito casos de frame/stepOnce do scheduler falham sob M1; a preservação de play falha sob M3. Os três casos ao vivo são checks de compatibilidade já verdes antes da mudança.

Implementação: play preserva cursor; frame/stepOnce consomem crédito em registros antes do mundo vivo, mantendo stepsTaken como contador físico. `length` é opcional para preservar os consumidores ao vivo existentes; o App fornece o comprimento atual nas duas ações. O frame restaura os refs ao vivo antes dos passos excedentes, atualiza controles ao mudar cursor e repinta cada registro. Sem mudanças no timestep ou no simulador.
- Gate final (2026-10-03), produção restaurada após todas as mutações: `npm test` **31 files passed, 1003 tests passed**, 48.00 s; `npm run lint`, `npm run typecheck` e `npm run build` **exit 0**. Build: aviso de chunks maiores que 500 kB (bundle de simulação); sem erro. Foco antes das mutações: **2 files passed, 185 tests passed**.
- Revisão final do diff: somente os quatro Primary files e este ticket; testes em `12988b2`, implementação no commit seguinte sem tocar testes. Critérios 1–10 cobertos; sem alteração no simulador ou na gravação. Etapa 2 concluída; revisão humana permanece para a etapa 3/PR da sessão.

#### Stage 3 — review cleanup (2026-10-03)

- Standards: um achado documental corrigido. O invariante do scheduler ainda dizia que todo crédito avançava o mundo vivo; agora distingue registros e passos físicos. Comentários do App também descrevem a sincronização dos controles durante replay. Sem alteração de comportamento ou testes.
- Spec: zero achados; critérios 1–10 atendidos. Conferido o `Proxy decided` existente: passo único avança um registro independentemente da velocidade, nos dois status.
- Separação de commits confirmada: `12988b2` contém testes e ticket; `f90b54a` contém produção e ticket, sem testes. As seis novas instâncias de teste DOM têm mutação e saída vermelha registradas acima.
- Red reproduzido com os dois arquivos de produção temporariamente em `abd9606` e os testes atuais: `npx vitest run src/playback/scheduler.test.ts src/App.test.ts -t 'recorded replay|recorded time player' --reporter=dot` → **15 failed, 13 passed, 157 skipped (185)**, pelas expectativas de cursor, passos físicos e leituras. Arquivos restaurados byte a byte em `finally`.
- A primeira reprodução sem filtro confirmou as mesmas 15 falhas e duas desconexões do Chromium nos testes preexistentes PHY-44 (**17 failed, 168 passed**); a verificação focada acima isolou o contrato. O gate completo será executado com acesso ao navegador fora do sandbox.

#### Resolution (2026-10-03)
Verdict: Approve

- Standards: um achado documental, corrigido em `1d839b1`; zero violações pendentes e nenhum smell que justifique alteração. Spec: zero achados; critérios 1–10 atendidos, sem regressão identificada. Revisões dos dois eixos realizadas em subagentes independentes.
- Arquivos revisados: `src/playback/scheduler.ts`, `src/playback/scheduler.test.ts`, `src/App.tsx` e `src/App.test.ts`. A revisão corrigiu somente comentários do scheduler e do App; nenhum teste ou comportamento foi alterado.
- `Proxy decided` conferido: passo único percorre um registro independentemente da velocidade; não houve nova decisão por proxy nesta revisão.
- Red/green: produção da base `abd9606` com testes atuais → **15 failed, 13 passed, 157 skipped (185)** no foco de gravação/replay. Produção restaurada → gate completo **31 files passed, 1003 tests passed**, 42.38 s; `npm run lint`, `npm run typecheck` e `npm run build` **exit 0**. A execução fora do sandbox também passou nos dois testes Chromium que haviam desconectado na primeira tentativa.
- Evidência por teste DOM, mutações M1–M4 e separação de commits red/produção verificadas. `git diff --check` passou; diff limitado aos Primary files e registros do ticket, sem artefatos gerados ou alterações alheias.
- Branch já atualizada sobre `sweatshop/2026-10-02-2210`, integrada sem squash em `5318fa4`. `Stage: done` e ledger registrados juntos neste commit de fechamento. `Review: human` segue para a revisão do PR da sessão, conforme o fluxo de sessão; nenhum push ou PR individual nesta etapa.
- Limitação: build mantém o aviso de chunk de simulação acima de 500 kB; nenhuma falha de validação pendente.
