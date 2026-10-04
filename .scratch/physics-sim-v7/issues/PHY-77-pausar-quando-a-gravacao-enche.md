# PHY-77: Pausar quando a gravação enche
Stage: to-implement
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

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: ao encher, pausar no último passo com o aviso "gravação cheia (10 s) — reinicie"; na ponta cheia reproduzir e passo não fazem nada, slider e voltar um passo navegam, replay pausa de novo no fim, reiniciar apaga tudo; altera o critério 14 do PHY-64 e corrige o bug do slider em 10 s com a ponta em 15 s.
- Planner: a regra fica em `advance` (puro), com `play` recebendo `length` opcional; o App só passa `length` e desabilita os dois botões na ponta cheia.
