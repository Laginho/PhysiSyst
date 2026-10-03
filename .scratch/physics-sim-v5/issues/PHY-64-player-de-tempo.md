# PHY-64: Gravação e slider de tempo com a simulação pausada
Stage: done
Status: ready-for-agent
Blocked by: none
Review: human
Difficulty: hard

- Primary files:
  - New: src/playback/recording.ts
  - New: src/playback/recording.test.ts
  - src/playback/scheduler.ts (`PlaybackState`, `PlaybackAction`, `advance`), src/playback/index.ts (exports)
  - src/playback/scheduler.test.ts
  - src/App.tsx (`runSteps`, `syncWorld`, `dispatch`, `editDoc`/`canEditDoc`, o intervalo do painel de leitura em ~863, a barra de transporte em ~1573, os campos de g e F)
  - src/App.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts

#### What to build

Hoje o transporte só anda para frente. Depois deste ticket, o app grava cada passo simulado e um slider na barra de transporte navega pela gravação com a simulação pausada.

Cada registro guarda o que a tela já lê: os estados dos corpos (`readStates`), os contatos (`readContacts`), as cordas e molas (`readConstraints`) e a aceleração medida de cada corpo. Não há snapshot do Rapier nem re-simulação: o mundo vivo nunca volta no tempo, fica na ponta da gravação, e o slider só troca o que é desenhado e lido. O registro 0 é o estado antes do primeiro passo. Grava-se um registro por passo de `TIMESTEP` (em 2x, um quadro de 2 passos grava 2 registros), até 600 registros (10 s). Com a gravação cheia, a simulação segue ao vivo e nada mais é gravado.

O cursor do slider mora no estado puro do scheduler (`cursor: number | null`, `null` = ao vivo) e muda pela ação `seek`. A última posição do slider é "ao vivo". Com o cursor num registro, tudo o que a tela mostra vem desse registro: corpos, vetores, contatos, cordas, painel de leitura e a aceleração gravada daquele passo.

Travas, com o cursor fora do ao vivo:
- Edição ao vivo (g, F) bloqueada: os campos ficam desabilitados com a dica "Volte ao fim da gravação para editar", e undo/redo também.
- Com o cursor em t = 0, o editor se comporta como antes do primeiro passo: qualquer edição é aceita e reseta a simulação (gravação apagada, mundo reconstruído do doc).

Até o PHY-65, play ou passo único com o cursor num registro primeiro voltam ao vivo e então agem como hoje. O replay é o PHY-65.

As decisões e quem tomou cada uma estão em `../spec.md`, seção "Player de tempo".

#### Acceptance criteria

1. `recording.ts` exporta `RECORDING_CAP = 600` e uma gravação genérica: começa com um registro (o inicial); `push` acrescenta e devolve `true` enquanto há espaço, e devolve `false` sem mudar nada quando já há `RECORDING_CAP` registros; `at(i)` devolve o registro `i`; `length` é o número de registros; `reset(first)` volta a ter só `first`.
2. No scheduler, a ação `{ type: 'seek', index, length }` (`length` = registros na gravação) pausa e leva o cursor ao índice pedido limitado a `[0, length − 1]`; um `seek` no último índice (`length − 1`) ou além deixa o cursor `null` (ao vivo). `reset` deixa o cursor `null`. `initialPlayback()` tem cursor `null`.
3. No scheduler, `play` e `stepOnce` com o cursor num registro deixam o cursor `null` antes de agir; com o cursor `null`, todas as ações de hoje agem exatamente como hoje.
4. No app, cada passo simulado acrescenta um registro: depois de N passos sem encher, a gravação tem N + 1 registros, inclusive quando um quadro em 2x roda 2 passos.
5. A barra de transporte tem um `<input type="range">` com mínimo 0, máximo = registros − 1, e valor = cursor (ou o máximo, ao vivo). Ao lado, o rótulo `t = <tempo> s` com o tempo do registro mostrado (índice × `TIMESTEP`) em duas casas decimais, vírgula em pt-BR e ponto em en.
6. Mover o slider para o registro i desenha os corpos nas poses do registro i (não nas do mundo vivo), e o painel de leitura do corpo selecionado mostra a posição, a velocidade e a aceleração gravadas no registro i; o contador de passos mostra i.
7. Com o cursor no registro i e uma corda ou mola selecionada, o painel mostra a leitura dela gravada no registro i (`T`, `F_el`, `Δx`), não a do mundo vivo.
8. A aceleração mostrada no registro i é a do passo i (Δv sobre um `TIMESTEP`), nunca uma diferença entre o registro mostrado antes e o atual: saltar do registro 10 para o 200 mostra a aceleração gravada no 200.
9. Mover o slider durante o play pausa a simulação, que continua pausada depois de soltar.
10. Com o cursor num registro i > 0: os campos de g e de F (módulo e direção) estão desabilitados com o título `t('playback.scrubbedEditHint')` ("Volte ao fim da gravação para editar"), undo e redo estão desabilitados, e uma edição ao vivo que chegue ao `editDoc` por outro caminho (arrastar o ponto de força) é recusada.
11. Com o cursor em 0 depois de N > 0 passos, as ferramentas estruturais ficam habilitadas; uma edição aplicada aí reseta a simulação (gravação com um registro só, o do doc editado, `stepsTaken` 0) e o doc fica com a edição.
12. Levar o cursor a 0 não apaga a gravação: voltar o slider ao máximo mostra o ao vivo de novo, com os mesmos registros.
13. Reset e troca de cena apagam a gravação (um registro só, o inicial da cena) e deixam o cursor `null`.
14. Com a gravação cheia, a simulação continua ao vivo além de 10 s, a gravação fica com 600 registros e mover o slider até o fim mostra o mundo vivo.
15. Play e passo único com o cursor num registro voltam ao vivo e então agem como hoje (critério 3).
16. Uma edição estrutural antes do primeiro passo (t = 0, sem gravação além do registro 0) troca o registro 0 pelo estado do doc editado.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/playback/recording.test.ts`: critério 1 chamando o módulo direto; vermelho hoje (o módulo não existe).
- `src/playback/scheduler.test.ts`: critérios 2 e 3 chamando `advance` direto; vermelhos hoje (não há `cursor` nem `seek`). Os casos de cursor `null` do 3 passam hoje e vão juntos.
- `src/App.test.ts`, com o simulador falso (poses diferentes a cada `step`) e o `requestAnimationFrame` controlado que o arquivo já usa: critérios 4 a 16; vermelhos hoje (não há slider). Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 4).
- 2026-10-02 Stage 1 (planner, grilling com proxy). Bruno decidiu: slider só no já simulado; edição ao vivo bloqueada com o slider para trás; t = 0 libera a edição estrutural; registro = o que a tela lê, sem snapshot nem re-simulação; um registro por passo; limite de 10 s, ao encher a simulação segue ao vivo sem gravar; `recording.ts` puro e cursor no scheduler com `seek`; fatiamento em PHY-64, PHY-65 (replay) e PHY-66 (voltar um passo).
- Planner: a última posição do slider é "ao vivo"; cursor em t = 0 aceita qualquer edição e reseta (o mundo vivo está na ponta, não em t = 0); até o PHY-65, play e passo com o cursor num registro voltam ao vivo; a leitura de aceleração ao vivo passa a ser Δv sobre um `TIMESTEP`, porque o mundo é lido a cada passo.
- Proxy decided: tudo acompanha o slider, inclusive o painel; a aceleração é a gravada daquele passo — uma diferença sobre um salto do slider seria um número sem sentido físico.
- Proxy decided: tempo como "t = 1,23 s", contador de passos continua — duas casas bastam a 1/60 s.
- Proxy decided: reset e troca de cena apagam a gravação, levar o slider a t = 0 não — voltar a t = 0 é navegar, não descartar.
- Proxy decided: `<input type="range">` nativo, um passo = um registro, na barra de transporte à direita dos botões — o nativo já resolve teclado e acessibilidade, e é onde um player de vídeo põe o slider.
- Proxy decided: arrastar o slider pausa e continua pausado — retomar sozinho começaria um replay que ninguém pediu.
- Proxy decided: registro 0 é sempre o estado inicial — sem ele o slider não chega a t = 0.
- Proxy decided: o bloqueio desabilita g, F e também undo/redo — undo/redo seriam outro caminho para uma edição ao vivo.
- Proxy decided: atalhos de teclado fora do PHY-64; → continua passo único — voltar um passo é o PHY-66.
- Proxy decided (rodada 2, sobrescrito pelo Bruno): limite de 18 000 registros. O Bruno trocou por 10 s (600), porque a maioria das simulações dura até 5 s.


#### Stage 2 implementation (2026-10-03)

- Branch: phy/PHY-64-player-de-tempo, based on sweatshop/2026-10-02-2210. No stage-3 review or merge performed.
- Caller audit: advance is consumed by App dispatch, fail and the animation loop; runSteps is called by dispatch and that loop; syncWorld serves both stepping paths; editDoc also guards undo/redo, numeric edits and pointer drags. The readout timer previously queried live constraints directly. Paint and hit-testing share the displayed state refs. Boundary cases covered: initial-only recording, negative/end seeks, two steps per frame, cursor zero after a run, recording full while physics continues, reset and scene switch.
- Implementation: generic Recording, scheduler cursor/seek, per-step samples and acceleration, retained live tip, native time slider, historical body/constraint readouts, and edit guards. Each sample also retains the immutable scene reference so later live g/F edits cannot change recorded vectors or initial analytic acceleration. No engine snapshots or re-simulation.
- Regression found by the full suite: initial readback must not activate simulated rope paths before the first step. Preserved the existing null display-state convention while retaining an initial simulator sample for the first measured acceleration. Existing PHY-56/CLEAN-27 tests passed after the fix.
- Harness corrections, isolated in test commits: shell encoding damaged two Unicode assertions (fixed using the catalog/UTF-8); the locale scenario left the next scenario in English (setup now selects pt-BR). Neither changed the contract.
- Pure-module red proof: recording initially failed import because the module did not exist; scheduler had 11 failures before cursor/seek. Mutation removing the cap failed with expected false / received true on push 600. Mutation forcing seek cursor to null failed 3 clamping cases. Restored sources passed all 50 recording/scheduler tests.

DOM/canvas mutation evidence (every new App test; sources restored after each run):

| Test in src/App.test.ts | Production mutation | Observed red output |
| --- | --- | --- |
| records each 2x step and seeks poses, velocities and per-step acceleration without rewinding physics | Remove runSteps recording.push | slider max expected 202, received 0 |
| keeps running past the cap and the last slider position is the live world | Remove runSteps recording.push | slider max expected 599, received 0 |
| blocks live fields, history and force anchor drags while inspecting an old step | Allow live edits with nonzero cursor in canEditDoc | anchorX expected 0, received 0.39000000000000057 |
| editing structure at cursor zero replaces the initial record and resets physics | Disable resetOnEditRef at cursor zero | slider max expected 0, received 3 |
| editing gravity at cursor zero replaces the initial record and resets physics | Disable resetOnEditRef at cursor zero | slider max expected 0, received 3 |
| refreshes record zero after a pre-step structural edit and clears history on reset and scene switch | Remove recording.reset from resetRecording | after reset slider max expected 0, received 2 |
| reads the recorded spring instead of the live constraint | Read constraints from sim in the readout timer | expected F_el: 1.00 N, received F_el: 4.00 N (dx 0.040) |
| reads the recorded rope instead of the live constraint | Read constraints from sim in the readout timer | expected T: 1.00 N, received T: 4.00 N |
| paints the historical body pose and localizes the time label | Pass liveFrameRef states to paint | expected canvas translation x 450.6, received 453 |
| keeps recorded force vectors when gravity and force change later at the live tip | Pass current docRef to paint instead of displayedScene | historical arrow endpoint expected 485.24101615137755, received 560.1445115010332 |

- Focused green: 10 recorded-time DOM/canvas cases. Initial full gate in the restricted environment exposed Chromium DevTools disconnects; the unrestricted rerun passed Chromium and all other tests. Build emits the existing large Rapier chunk warning.

- Final gate (2026-10-03): npm test && npm run lint && npm run typecheck && npm run build exited 0. Tests: 31 files passed, 987 tests passed (43.48 s). ESLint and TypeScript passed; Vite build passed. Only the existing large-chunk warning remains. Final diff is restricted to Primary files plus this ticket; test and production changes are in separate commits.

- 2026-10-03 Stage 3 small documentation fix: corrected the stale acceleration-tracker comment to distinguish its batch API from App's per-step sampling (n = 1). No behavior or tests changed; documentation made stale by this ticket is permitted outside Primary files by ticket-flow.

#### Resolution (2026-10-03)

Verdict: Approve

- Decision: approved against all 16 numbered criteria and integrated without squash into the active session branch `sweatshop/2026-10-02-2210` (merge `567dc80`). `Review: human` remains a session-PR highlight under ticket-flow; this stage does not push or open a per-ticket PR.
- Standards: source/test scope, separate red-test and production commits, committed stage transitions, and the 10 DOM/canvas mutation-evidence rows conform. One nonblocking process observation: the 14 implementation commits have empty bodies, although their subjects cite PHY-64; ticket-flow asks bodies to explain why. History was preserved. No actionable code smells or ADR conflicts found.
- Spec: all 16 numbered criteria satisfied; no missing behavior, scope creep, or confirmed regression. Pre-step structural edits refresh record zero at the next syncWorld, before stepping or any subsequent historical view; no observable defect found.
- Files: bounded Recording and cursor/seek scheduler; per-step App recording, historical display/readouts, edit guards, and native localized time slider; recording/scheduler/App tests; pt-BR/en catalogs. Review commit `e6b8db6` corrected only stale acceleration-tracker documentation; the documentation exception permits that comment outside Primary files.
- Red-green proof: inspected all implementation commits and all 10 production-mutation/red-output records above. Pure-module tests call production Recording/advance; test and code changes remain in separate commits. Independent green run: 31 test files, 987 tests passed.
- Gate: `npm test && npm run lint && npm run typecheck && npm run build` completed successfully (test duration 44.58 s; ESLint, TypeScript, Vite exit 0). The restricted run first had 972 passes and 15 Chromium DevTools connection/disconnection failures; the approved unrestricted rerun passed all 987. Existing Rapier chunk-size warning only. The subsequent change was documentation only; rebase was already up to date, merge had no conflicts, and final diff checks passed.
- Proxy decisions reviewed by name: every displayed value follows the slider; acceleration belongs to the recorded step; localized two-decimal time with step counter; reset/scene-switch clears recording while seek-zero preserves it; native range in transport; seek pauses and stays paused; record zero is initial state; historical g/F and undo/redo are locked; keyboard shortcuts remain unchanged. The proxy's earlier 18,000-record proposal was explicitly superseded by Bruno's 600-record cap, which the implementation uses.
- Remaining limitation: replay and backward-step controls remain assigned to PHY-65/PHY-66; the current play/step behavior returns to live as required.
