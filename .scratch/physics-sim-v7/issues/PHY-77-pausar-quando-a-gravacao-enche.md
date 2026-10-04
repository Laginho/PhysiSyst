# PHY-77: Pausar quando a gravação enche
Stage: reviewing
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

- 2026-10-04 Stage 3, S1 (Standards): o coment?rio de m?dulo do scheduler ainda prometia `floor(N * speed)` sem considerar o limite e o descarte de cr?dito. Corrigido somente o coment?rio para descrever a pausa na ponta cheia; nenhuma altera??o de comportamento ou teste novo. Corre??o pequena dentro de Primary files, conforme `ticket-flow`. Spec: dez crit?rios atendidos, sem finding. As nove execu??es das muta??es registradas foram repetidas e verificadas; produ??o restaurada byte a byte antes desta corre??o.
