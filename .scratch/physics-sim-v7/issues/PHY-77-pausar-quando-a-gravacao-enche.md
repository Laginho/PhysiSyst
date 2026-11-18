# PHY-77: Pausar quando a gravação enche
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/playback/scheduler.ts (`PlaybackAction` :42-52 — `play` ganha `length?`; `advanceCursor` :80-86; `advance` :88-130)
  - src/playback/scheduler.test.ts
  - src/playback/recording.ts (só o comentário de `RECORDING_CAP` :1, que diz "once full, the live world keeps running")
  - src/App.tsx (`runSteps` :1080-1107, loop rAF :1296-1322, `togglePlay`/`stepOnce` :1395-1415, barra de transporte :1834-1921, rótulo de tempo :1917)
  - src/App.test.ts (`keeps running past the cap and the last slider position is the live world` :3354 e `PHY-65 capped replay reaches the current live world via %s` :3333 reescritos)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`playback.recordingFull`)

#### What to build

Hoje, com `RECORDING_CAP` registros (600 = 10 s), `Recording.push` devolve `false`, nada mais é gravado e a simulação segue ao vivo (critério 14 do PHY-64, em `.scratch/physics-sim-v5/issues/PHY-64-player-de-tempo.md`). O bug relatado é a consequência: a cena corre além de 10 s, o slider acaba em 10 s e a ponta mostra 15 s, um instante que não está em registro nenhum. Este ticket altera aquele critério: **ao encher, a simulação pausa no último passo gravado**.

A regra mora no scheduler puro, que já recebe `length` em `frame` e `stepOnce`:

- `frame` e `stepOnce` com o cursor na ponta ao vivo rodam no máximo `RECORDING_CAP − length` passos; quando o resultado deixa a gravação cheia (`length + steps ≥ RECORDING_CAP`), o estado volta `paused` com `acc` 0. Com `length ≥ RECORDING_CAP` e cursor `null`, os dois são no-op (0 passos), e `frame` pausa.
- `play` ganha `length?: number`: com `length ≥ RECORDING_CAP` e cursor `null`, não sai de `paused`.
- Replay (cursor num registro) continua andando pela gravação; ao chegar ao último registro com a gravação cheia, o cursor vira `null`, 0 passos são rodados e o estado pausa, mesmo que o crédito sobrasse (2× no 598 não roda o passo que excederia).
- `seek`, `pause`, `setSpeed` e `reset` não mudam; `reset` continua apagando a gravação e o cursor.

No App: `togglePlay` e `stepOnce` passam `recordingRef.current!.length`; os botões reproduzir e passo ficam `disabled` quando a gravação está cheia e o cursor está `null` (voltar um passo, o slider e reiniciar continuam habilitados); a barra mostra `t('playback.recordingFull')` ("gravação cheia (10 s) — reinicie" / "recording full (10 s) — reset") enquanto `recordingLength ≥ RECORDING_CAP`. O contador de passos e o rótulo de tempo passam a bater com a ponta: 599 passos, `t = 9,98 s`.

#### Acceptance criteria

1. `advance({ status: 'playing', cursor: null, speed: 1, acc: 0 }, { type: 'frame', length: 600 })` devolve `steps: 0` e estado `paused` com `acc: 0`. Com `length: 599` e crédito 2 (`speed: 2`), `steps: 1` e `paused`; com `length: 598` e crédito 2, `steps: 2` e `paused`; com `length: 597` e crédito 2, `steps: 2` e ainda `playing`.
2. `advance(paused, cursor null, { type: 'play', length: 600 })` devolve o mesmo estado `paused`; com `length: 599`, `playing`; sem `length`, comporta-se como hoje.
3. `advance(state, { type: 'stepOnce', length: 600 })` com cursor `null` devolve `steps: 0` e o estado inalterado (status, `acc` e `stepsTaken` iguais).
4. Replay cheio: `playing`, cursor 598, `length: 600`, crédito 1 → cursor `null`, `steps: 0`, `paused`; cursor 597 e crédito 2 → cursor `null`, `steps: 0`, `paused`; cursor 10 e crédito 1 → cursor 11, `playing` (replay segue até o fim).
5. Com o cursor `null`, `length < RECORDING_CAP` e qualquer ação, `advance` devolve exatamente o que devolve hoje (os testes existentes do scheduler continuam verdes sem alteração).
6. No `App`, com o simulador falso: reproduzir e rodar 610 quadros chama `step` exatamente 599 vezes; o slider tem `max` 599 e `value` 599; o botão mostra `t('playback.play')`; o texto contém `t('playback.recordingFull')`, `passos: 599` e `t = 9,98 s`.
7. Na ponta cheia, os botões reproduzir e passo estão `disabled`; clicar neles, apertar Espaço ou → não muda o número de chamadas a `step`. Voltar um passo leva o slider a 598 e `seek(10)` mostra a pose do registro 10; o botão voltar um passo e o slider não estão `disabled`.
8. `seek(590)` e reproduzir: o slider sobe até 599, o botão volta a `t('playback.play')` e `step` continua com 599 chamadas.
9. Reiniciar depois da ponta cheia: o aviso some, o slider tem `max` 0, reproduzir volta a ficar habilitado e chama `step` no quadro seguinte.
10. `playback.recordingFull` em pt-BR e en; paridade verde. O comentário de `RECORDING_CAP` em `recording.ts` descreve a pausa, não "keeps running".

#### Verification

    npm test -- src/playback/scheduler.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/playback/scheduler.test.ts`: critérios 1 a 5 chamando `advance` direto; 1 a 4 vermelhos hoje (o scheduler ignora o limite), 5 passa e pina a ausência de regressão.
- `src/App.test.ts`: critérios 6 a 9 com `setupRecording` e o `requestAnimationFrame` controlado que o arquivo já usa; vermelhos hoje (`step` é chamado 610 vezes e não há aviso). Os dois testes que fixavam o comportamento antigo (:3333 e :3354) são reescritos no mesmo commit para a regra nova. Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

- Stage 2, harness de tradução: a troca de idioma usa o select público (valor `en`), não `setLang` isolado nem um botão. Correção em commit só de teste/documentação; os seis casos permanecem vermelhos contra o adaptador antigo.

- 2026-10-04 Stage 2: costuras aprovadas: `advance` direto e DOM do App com `setupRecording`. Chamadores examinados: dispatch e rAF do App; transportes de integração, aceleração e overlay que omitem `length` preservam o comportamento anterior. Limites cobertos: gravação inicial, crédito fracionário/zero, uma ou duas vagas restantes, `length` acima do cap, stepOnce já cheio, replay com crédito excedente e retomada após reset.

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: ao encher, pausar no último passo com o aviso "gravação cheia (10 s) — reinicie"; na ponta cheia reproduzir e passo não fazem nada, slider e voltar um passo navegam, replay pausa de novo no fim, reiniciar apaga tudo; altera o critério 14 do PHY-64 e corrige o bug do slider em 10 s com a ponta em 15 s.
- Planner: a regra fica em `advance` (puro), com `play` recebendo `length` opcional; o App só passa `length` e desabilita os dois botões na ponta cheia.

#### Stage 2 — provas red/green e mutate-verify (2026-10-04)

- Scheduler: commit vermelho `99a1d23` (16 falhas, 69 passes); implementação `57e7c4a` (85 passes). Nenhum teste existente foi alterado. Os novos casos cobrem critérios 1–5, inclusive stepOnce que enche, replay com sobra a 2×, crédito fracionário e comprimento acima do limite.
- DOM: commit vermelho `e23b63c`, harness corrigido em `7263303`; seis casos vermelhos contra o App antigo (botão ainda em pausar, controles habilitados e aviso ausente). Depois da implementação: filtro `PHY-77|full recording` com 32 passes, 222 ignorados.
- Mutação M1: substituir temporariamente o import de `RECORDING_CAP` no scheduler por `const RECORDING_CAP = Number.POSITIVE_INFINITY`. Filtro combinado: **22 falhas, 10 passes, 222 ignorados** (16 scheduler + seis DOM). Filtro só DOM: **seis falhas, 163 ignorados**. Mutação restaurada antes das verificações verdes.

| Teste DOM (prefixo PHY-77) | Mutação aplicada | Saída vermelha observada |
| --- | --- | --- |
| capped replay pauses at the last recorded pose via play | M1 | `expected "vi.fn()" to be called 599 times, but got 610 times` |
| capped replay pauses at the last recorded pose via step | M1 | `expected "vi.fn()" to be called 599 times, but got 610 times` |
| pauses when full with the slider, clock and step count at the last record | M1; adicional: renderizar aviso só com `recordingLength > RECORDING_CAP` | M1: 610 chamadas em vez de 599; aviso: `expected 'physics-simidioma portuguêsenglish◢▶ …' to contain 'gravação cheia (10 s) — reinicie'` |
| blocks full-tip buttons and keyboard steps while keeping recorded navigation available | Omitir `length` de play; omitir `length` de stepOnce; forçar ambos `disabled={false}` (três execuções independentes) | Play: `expected undefined to be true`; stepOnce: 600 chamadas em vez de 599; disabled: `expected false to be true`. Uma falha, 168 ignorados em cada execução |
| replays a full recording from 590 and pauses again without new physics steps | M1; adicional: no rAF, sincronizar setPlayback só em mudança de status, omitindo mudança de cursor | Replay: `expected '590' to be '591'` (uma falha, 168 ignorados) |
| reset clears the full warning and enables recording a new run | M1; adicional: suprimir `resetRecording()` no dispatch quando length é 600 | M1: 610 chamadas em vez de 599; reset: `expected 'physics-simidioma portuguêsenglish◢▶ …' not to contain 'gravação cheia (10 s) — reinicie'` (uma falha, 168 ignorados) |

- Todas as mutações foram removidas. A troca para inglês usa o select real do App e verifica o aviso inglês no DOM. O aviso tem `role="status"`; nenhuma chamada à física ocorre em replay cheio.
- Mutação adicional de tradução: trocar `en['playback.recordingFull']` por `incorrect notice`; o teste `pauses when full` falhou com `to contain 'recording full (10 s) — reset'` (uma falha, 168 ignorados), depois restaurado.
- Correção de harness após typecheck: o teste de compatibilidade passa a ação com `length` numa variável, respeitando a checagem de propriedades extras do TypeScript para pause/reset/setSpeed, sem mudar as ações públicas. Commit separado só de teste/documentação; red novamente com M1.
- Verificação focada sem filtro: 252 passes, duas falhas de infraestrutura em testes Chromium PHY-44 (`Chromium disconnected`), sem falha dos testes PHY-77. Gate completo executado fora do sandbox para verificar o navegador.
- Verificação final (todas as mutações restauradas): `npm test -- src/playback/scheduler.test.ts src/App.test.ts` — **2 arquivos, 254 testes passaram**, incluindo Chromium.
- Gate final: `npm test && npm run lint && npm run typecheck && npm run build` — **33 arquivos, 1171 testes passaram**, lint e typecheck sem erros; Vite construiu 52 módulos com sucesso. Paridade i18n incluída no gate.
- Handoff: App sincroniza status/cursor do scheduler e interrompe rAF ao pausar; 599 passos e `t = 9,98 s` na ponta cheia, controles/atalhos sem passos extras, aviso localizado, navegação/replay e reset preservados. `stepOnce` já passava length no App. Diff limitado a Primary files e ao ticket; commits de implementação não alteram testes. Stage 2 concluída; revisão e merge ficam para Stage 3.

- 2026-10-04 Stage 3, S1 (Standards): o comentário de módulo do scheduler ainda prometia `floor(N * speed)` sem considerar o limite e o descarte de crédito. Corrigido somente o comentário para descrever a pausa na ponta cheia; nenhuma alteração de comportamento ou teste novo. Correção pequena dentro de Primary files, conforme `ticket-flow`. Spec: dez critérios atendidos, sem finding. As nove execuções das mutações registradas foram repetidas e verificadas; produção restaurada byte a byte antes desta correção.

#### Resolution (2026-10-04)

Verdict: Approve

Revisão independente do diff completo `0108bf0...1de642f` contra este ticket e o spec v7, com Standards e Spec em sub-agentes separados. O revisor principal conferiu os chamadores, os commits, o gate e as mutações. Contrato, critérios e Primary files preservados; única correção permanente da etapa: comentário de módulo do scheduler, commit `2cd5a4d`, sem mudança de comportamento ou testes.

##### Standards

- S1 corrigido: o comentário ainda prometia consumir `floor(N * speed)` sem considerar o limite. Agora explica a capacidade restante, a pausa na ponta cheia e o descarte de crédito. Correção documental pequena, conforme a regra de documentação tornada obsoleta de `ticket-flow` e o quality gate de Engenharia, item 5.
- Nenhuma outra violação ou smell acionável. Os commits `99a1d23`, `e23b63c`, `7263303` e `8bba124` alteram somente testes/ticket; `57e7c4a` e `1de642f` alteram somente produção/ticket. A correção documental também não toca testes. Costuras de produção reais e evidência de mutação por teste DOM; aviso localizado com `role="status"`. Sem refactor ou artefato gerado no diff. Nenhuma linha `Proxy decided` neste ticket.

##### Spec

Nenhum finding de Spec, scope creep ou regressão introduzida identificado.

| Critério | Parecer |
| --- | --- |
| 1 | ✅ Frame limita passos às vagas restantes e pausa com acc 0 ao encher; casos 597–601, 1×/2× e crédito fracionário cobertos. |
| 2 | ✅ Play recusa a ponta cheia, permite length 599 e preserva a chamada sem length. |
| 3 | ✅ StepOnce na ponta cheia devolve zero passos e o mesmo estado, incluindo status, acc e stepsTaken. |
| 4 | ✅ Replay cheio termina com cursor null, paused e zero passos físicos; sobra a 2× descartada, replay intermediário preservado. |
| 5 | ✅ Compatibilidade abaixo da transição para o cap e dos chamadores sem length; testes anteriores do scheduler preservados. |
| 6 | ✅ App: 599 chamadas em 610 quadros, slider 599/599, botão reproduzir, aviso, passos 599 e t = 9,98 s. |
| 7 | ✅ Botões e atalhos na ponta não executam passos; voltar e slider continuam habilitados e exibem os registros 598/10. |
| 8 | ✅ Replay a partir de 590 chega a 599 e pausa novamente sem novas chamadas físicas. |
| 9 | ✅ Reset remove aviso, zera slider e habilita reprodução; quadro seguinte executa novo passo. |
| 10 | ✅ Avisos pt-BR/en, paridade no gate, troca real de idioma no DOM e comentário de RECORDING_CAP atualizado. |

Consumidores e interações examinados: `advance`/`advanceCursor`; dispatch, rAF, runSteps, showFrame e poll do App; play/step assíncronos e roteamento de teclado; reset, reconstrução e troca de cena; edição ao vivo/estrutural e travas; seek pelo slider/gráfico, voltar, replay, leituras de aceleração/energia e relógio; transportes de integração, aceleração e overlay que omitem length. Fronteiras e falhas examinadas: gravação inicial, crédito zero/fracionário, uma/duas vagas, length acima do cap, replay com sobra, ponta cheia em ambos os status, boot/rebuild/step com erro e reset depois do cap. Não houve novo probe manual de física, comparação visual ou validação em outros navegadores; motor e mecanismos de layout não foram alterados.

##### Prova vermelho/verde repetida

Todas as mutações registradas em stage 2 foram repetidas, com restauração byte a byte em `finally` e relatório de cada execução. M1 (cap infinito no scheduler): **22 failed, 10 passed, 222 skipped (254)** no filtro combinado; **6 failed, 163 skipped (169)** no filtro só DOM. Os 16 casos de scheduler que exigem o limite ficaram vermelhos. Cada uma das sete execuções adicionais abaixo teve **1 failed, 168 skipped (169)**.

| Teste DOM (prefixo PHY-77) | Mutação repetida | Saída vermelha observada nesta revisão |
| --- | --- | --- |
| capped replay pauses at the last recorded pose via play | M1 | `expected "vi.fn()" to be called 599 times, but got 610 times` |
| capped replay pauses at the last recorded pose via step | M1 | Mesma saída: 610 chamadas em vez de 599. |
| pauses when full with the slider, clock and step count at the last record | M1; aviso apenas com length > cap; aviso en incorreto | M1: 610 chamadas; aviso: `to contain 'gravação cheia (10 s) — reinicie'`; en: `to contain 'recording full (10 s) — reset'`. |
| blocks full-tip buttons and keyboard steps while keeping recorded navigation available | Omitir length de play; omitir length de stepOnce; forçar disabled false (execuções separadas) | Play: `expected undefined to be true`; step: 600 chamadas em vez de 599; disabled: `expected false to be true`. |
| replays a full recording from 590 and pauses again without new physics steps | M1; sincronizar playback só em mudança de status | M1: botão reproduzir ausente (`Cannot read properties of undefined (reading 'disabled')`); cursor: `expected '590' to be '591'`. |
| reset clears the full warning and enables recording a new run | M1; suprimir resetRecording no dispatch cheio | M1: 610 chamadas; reset: `not to contain 'gravação cheia (10 s) — reinicie'`. |

A primeira execução do runner temporário por cmd selecionou 31 casos; a chamada foi corrigida para a CLI direta do Vitest, que selecionou os 32 casos esperados e reproduziu os números acima. Nenhum teste ou produção foi alterado para corrigir o runner. As nove execuções finais foram verificadas; `summary.json` registra `restored: true`. Logs por mutação e runner: `%TEMP%/phy77-review-0d12911ed3ae43bdb446da22ffde799d/`. A evidência essencial permanece neste ticket.

##### Gate e fechamento

- Gate oficial independente antes da revisão: **33 arquivos e 1171 testes passed, sem skips**; lint/typecheck/build exit 0. A tentativa inicial no sandbox teve 28 falhas de conexão com Chromium e 1143 testes passed; executar fora do sandbox resolveu as conexões sem mudança de código.
- Gate oficial final depois das mutações restauradas e da correção documental: `npm test && npm run lint && npm run typecheck && npm run build`, **exit 0; 33 arquivos e 1171 testes passed, sem skips**; lint/typecheck/build exit 0; Vite: 52 módulos. Aviso de chunk sim >500 kB já existente (2136,50 kB).
- `git rebase sweatshop/2026-10-04-1243` confirmou a branch atualizada. Merge sem squash **cc2f7e0** na sessão; `git diff --exit-code 2cd5a4d HEAD` confirmou a mesma árvore validada, antes do fechamento documental. Sem PR ou push nesta etapa, conforme o fluxo de sessão.
- `Stage: done`, este Resolution e a linha de ledger são registrados juntos no commit de fechamento sobre a sessão. `Review: agent` preservado.

Totais por eixo: Standards — 1 finding documental corrigido, 0 pendentes, 0 smells acionáveis; Spec — 0 findings, dez critérios atendidos.
