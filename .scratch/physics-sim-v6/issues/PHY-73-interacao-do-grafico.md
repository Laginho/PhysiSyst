# PHY-73: Interação do gráfico: seek e tipos por seleção
Stage: to-review
Status: ready-for-agent
Blocked by: PHY-72
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (painel do gráfico do PHY-72; handler do slider :1839-1848 como modelo do `seek`; seleção de corpo)
  - src/render/graph.ts (`graphLayout` → inverso `indexAtX`)
  - src/render/graph.test.ts
  - src/App.test.ts, src/App.browser.test.ts
  - src/playback/scheduler.ts (ação `seek` :43, :90 — consumida, não alterada)

#### What to build

Dois comportamentos sobre o painel do PHY-72.

**Clique e arrasto fazem seek.** `pointerdown` no canvas do gráfico (e `pointermove` com o botão pressionado, com `setPointerCapture`) mapeia o x do ponteiro para o índice do registro mais próximo (`indexAtX(layout, x, tMax)` em `graph.ts`, inverso de `mapT`, limitado a `[0, recording.length − 1]`) e despacha a mesma ação `seek` que o slider despacha, com a mesma semântica: durante o play, pausa e fica pausado ao soltar; o último registro é "ao vivo" como no slider. Fora da área do `plot` (margens dos eixos) o x é limitado às bordas.

**Tipos cinemáticos só com corpo selecionado.** Sem corpo selecionado, as opções `position`, `velocity` e `acceleration` do `<select>` ficam `disabled` e, se o tipo atual era um deles, cai em `energy`. Ao selecionar um corpo, as opções voltam a ficar habilitadas (o tipo não muda sozinho).

#### Acceptance criteria

1. `indexAtX` com `tMax = 2` e 121 registros: x na borda esquerda do `plot` → 0; na direita → 120; no meio → 60; além das bordas → limitado a 0 e 120.
2. No `App`, com 61 registros gravados e a simulação pausada, `pointerdown` no meio do `plot` do gráfico muda o valor do slider para 30 e o rótulo de tempo para `t = 0,50 s`.
3. Durante o play, `pointerdown` no gráfico pausa (botão de play volta ao estado de pausado) e `pointerup` não retoma.
4. `pointermove` com o botão pressionado atualiza o slider a cada movimento; sem o botão, não.
5. Sem corpo selecionado, as opções `position`, `velocity`, `acceleration` do `<select>` têm `disabled`; `energy` e `momentum` não. Com o tipo em `velocity`, desselecionar o corpo muda o `<select>` para `energy`.
6. Selecionar um corpo habilita as três opções e mantém o tipo atual.
7. Teste de browser: clicar no gráfico num ponto medido em geometria real move o polegar do slider para o índice esperado (o `value` do `<input type="range">` muda).

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/graph.test.ts`: critério 1 chamando `indexAtX` direto; vermelho hoje porque não existe.
- `src/App.test.ts`: critérios 2 a 6 com o simulador falso e o `requestAnimationFrame` controlado; vermelhos hoje (o canvas não responde a ponteiro e as opções não desabilitam). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.
- `src/App.browser.test.ts`: critério 7 com `withBrowserSession`; vermelho hoje. Mesma regra de evidência.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: clique/arrasto despacha o `seek` existente com a semântica do polegar do slider (pausa e fica pausado); tipos cinemáticos desabilitados sem seleção, caindo em energia (segue de "nada selecionado → sistema"); seek por teclado fica no slider; um teste de browser com evidência mutate-verify.

#### Stage 2 implementation (2026-10-03)

- Base: `sweatshop/2026-10-03-1618`; branch: `phy/PHY-73-interacao-do-grafico`. Dependency PHY-72 is done. No new proxy decision or contract change.
- Read-around: `graphLayout` is consumed by graph repaint and its direct tests; the new `indexAtX` is consumed by the App pointer adapter. Existing `dispatch` callers include slider, transport, reset/edit effects and keyboard stepping; the graph dispatches the same seek action without modifying the scheduler. Inspected selection/repaint refs, playback pause, historical versus live frames, recording length/cap, zero-step and sub-second recordings, plot margins, nearest-frame rounding and CSS coordinate scaling. Existing transport and selection paths remain intact.
- Test-first commits: `bf42704` (two direct tests red: `indexAtX is not a function`), production `65375b4`, then `64cac8e` (four DOM tests and one real-browser test). Initial DOM failures: slider 60 instead of 30, missing paused play button, slider 60 instead of 15, and enabled kinematic options. Browser red outside sandbox: slider 60 instead of 30. Production commits do not modify tests.
- Implementation: inverse of the rendered time axis bounded by actual recording duration; primary-pointer capture and drag dispatch seek with scaled CSS coordinates; kinematic options disabled without a body; energy fallback persisted so reselection keeps the current kind. No scheduler changes.
- Focused green before mutations: 3 files, 7 passed / 156 skipped (163 total). Chromium needs external execution permission here: sandbox execution disconnected; external execution produced both the expected red and green.
- Mutate-verify: all mutations below were temporary and source files were restored byte-for-byte in `finally`. First run: 7 failed / 156 skipped; second run: 3 failed / 138 skipped.

| New test | Production mutation | Red output |
| --- | --- | --- |
| rounds to the nearest recorded frame and clamps plot margins | add 1 to indexAtX result | `[1,1,61,121,121]` instead of `[0,0,60,120,120]` |
| inverts the one-second minimum axis without seeking beyond a short recording | add 1 to indexAtX result | expected 16 to be 15 |
| PHY-73 seeks the midpoint to frame 30 and returns to the live tip at the right margin | force graph seek index to 0 | expected '0' to be '30' |
| PHY-73 pauses playing on graph press and stays paused after release | ignore graph seek while playing | expected undefined to be defined (paused play button) |
| PHY-73 drags through successive indices only while the primary button is held | remove buttons guard from pointermove | expected '30' to be '45' after release/hover |
| PHY-73 disables kinematics without a body and keeps energy when a body is reselected | force options enabled; separately remove persisted kind normalization | enabled flags false instead of true; expected 'velocity' to be 'energy' on reselection |
| PHY-73 seeks from a real graph click to the expected slider index | force graph seek index to 0 | expected '0' to be '30' in Chromium |

- Final gate on restored production: `npm test -- --maxWorkers=2` passed **33 files / 1092 tests**, no skips or failures; `npm run lint`, `npm run typecheck`, `npm run build` all exit 0 (Vite: 52 modules). The command-only worker limit follows the PHY-72 timeout mitigation; no configuration changed.
- Final diff and commit separation checked: only Primary files plus this ticket changed, `git diff --check` clean, no generated artifacts included. No manual visual/touch-device pass; pointer behavior is verified in DOM and the real mouse click in Chromium. Ready for independent stage 3; no merge or push in this stage.
