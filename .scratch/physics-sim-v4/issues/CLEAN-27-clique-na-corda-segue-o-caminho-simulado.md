# CLEAN-27: O clique na corda durante o playback segue o caminho simulado
Stage: done
Status: ready-for-agent
Blocked by: PHY-56
Review: agent
Difficulty: normal

- Primary files:
  - src/editor/hitTest.ts (`ropeAtPoint`: parâmetro `constraints`)
  - src/editor/hitTest.test.ts (bloco `pulleyAtPoint and ropeAtPoint (PHY-28)`)
  - src/App.tsx (`onPointerDown`: a chamada de `ropeAtPoint`)
  - src/App.test.ts (bloco `desenho da corda durante o playback (PHY-56)`)

#### What to build

Durante o playback, o clique seleciona a corda onde ela está desenhada. Depois do PHY-56, a corda desenhada é o `RopeState.path` do simulador: depois que ela sai de uma polia ideal, é a perna reta entre as pontas. O `ropeAtPoint` ainda testa as pernas do `scenePath` das poses. Por isso, clicar na perna reta desenhada não seleciona a corda, e clicar onde a corda não aparece (subindo até a polia) seleciona.

`ropeAtPoint` recebe um `constraints` opcional, o mesmo `readonly ConstraintState[]` de `drawScene` e `tensionArrows`. Uma corda cujo estado tem `path` é testada contra os segmentos desse `path`. Sem `constraints`, sem estado para a corda ou sem `path`, ela é testada contra o `scenePath`, como hoje. O `onPointerDown` do App passa as mesmas leituras guardadas que o `paint` passa a `drawScene`: `constraints` quando há leitura do simulador (`states` não nulo), `[]` quando não há. No editor o `constraintsRef` pode estar velho (PHY-56).

As pernas de uma polia solta são dois segmentos colineares e contam como pernas. Os arcos continuam fora do teste, como hoje: eles ficam sobre a polia, que é atingida primeiro.

**Fora do escopo:** `springAtPoint`. A mola é desenhada entre as âncoras das poses, então desenho e clique já coincidem.

#### Acceptance criteria

1. `ropeAtPoint`, chamado direto, na `SCENE` do bloco do PHY-28 (pernas em x = ±0,5, polia `p1` em (0, 4)). O estado de `r1` traz um `path` montado à mão: a perna reta de (−0,5; 0,2) a (0,5; 0,2), dividida em dois segmentos colineares numa junção interior, e um arco de `p1` com varredura −0,5. Com tolerância 0,1:
   1. (0; 0,25) acerta `r1`;
   2. (−0,45; 2), que fica na perna do `scenePath`, não acerta nada.
2. `ropeAtPoint` sem `constraints`, ou com `constraints` sem estado para a corda ou sem `path`, dá os mesmos resultados de hoje. Os testes existentes do bloco ficam como estão.
3. App, com o simulador falso do bloco do PHY-56. O `readConstraints` falso devolve para a `corda` um `path` marcador que passa por um ponto da tela em espaço aberto, longe da corda do documento:
   1. Depois de `⏭ passo`, um clique nesse ponto seleciona a `corda`.
   2. Antes de qualquer passo, e depois de `⟲ reiniciar`, o mesmo clique não seleciona nada.
4. Mutate-verify conforme o `AGENTS.md`. Para cada teste do App, o ticket registra a mutação aplicada e a saída vermelha:
   - `onPointerDown` passa a `ropeAtPoint` as leituras sem guarda: o item 2 do critério 3 fica vermelho.
   - `onPointerDown` não passa leituras a `ropeAtPoint`: o item 1 do critério 3 fica vermelho.
5. Os testes existentes ficam verdes sem mudar tolerância nem texto.

#### Verification

    npx vitest run src/editor/hitTest.test.ts
    npx vitest run src/App.test.ts -t PHY-56
    npm test && npm run lint && npm run typecheck && npm run build

O gate precisa de um Chromium na máquina (`CHROME_BIN` aponta para ele quando está fora dos caminhos padrão), por causa dos testes de layout do `AGENTS.md`.

## Tests stage 2 writes (own commit, red)

- `src/editor/hitTest.test.ts`, bloco `pulleyAtPoint and ropeAtPoint (PHY-28)`, chamando `ropeAtPoint` direto: o critério 1, com `CLEAN-27` no nome. Fica vermelho hoje porque o quarto argumento é ignorado: (0; 0,25) fica a 0,5 m das duas pernas do `scenePath`, e (−0,45; 2) cai numa delas. Chamada direta, sem registro de mutação.
- `src/App.test.ts`, bloco `desenho da corda durante o playback (PHY-56)`: o critério 3, com `CLEAN-27` no nome, sobre o mesmo contexto gravado e o mesmo simulador falso. O item 1 fica vermelho hoje. O item 2 passa hoje e é a guarda do editor, que só a mutação mostra. Costura de DOM: registro das duas mutações do critério 4 no ticket.

## Comments

- 2026-10-02 Aberto no stage 1 do PHY-56 por decisão do proxy: o clique na corda é outra costura (editor, não render), e ficou fora daquele ticket. Depende do `RopeState.path` e da guarda do `paint` que o PHY-56 cria. Nada commitado.
- 2026-10-02 Stage 2. Red commit: both new tests failed for the right reason (hitTest: `ropeAtPoint` ignored the fourth argument, got `undefined` for (0; 0,25); App: panel `corda` absent after `⏭ passo`). Gate green: 852 tests, lint, typecheck, build.
- 2026-10-02 Stage 2. Mutate-verify, App test `CLEAN-27: o clique na corda segue o caminho...` (`src/App.tsx`, `onPointerDown`):
  - `ropeAtPoint(view, w, tolerance, constraintsRef.current)` (no `statesRef.current` guard): red, `AssertionError: expected <fieldset …(1)>…(4)</fieldset> to be undefined` at `App.test.ts:2339` (the click after `⟲ reiniciar` still selected the rope).
  - `ropeAtPoint(view, w, tolerance)` (no readings): red, `AssertionError: expected undefined to be defined` at `App.test.ts:2333` (the click after `⏭ passo` selected nothing).
  - Production code restored after both; the guarded call is what is committed.
- 2026-10-02 Stage 3. The App test never clicked before the first step, so half of criterion 3.2 ("Antes de qualquer passo") was unexercised. The case is real: the simulator boots at mount and `ensureSim` fills `constraintsRef` with the marker reading while `statesRef` is still `null`. Review added `click(canvas, OPEN_SPACE)` before the pre-step assertion (test-only commit). Mutations re-run on the amended test:
  - no guard: red, `AssertionError: expected <fieldset …(1)>…(4)</fieldset> to be undefined` at `App.test.ts:2330:34` (now the pre-step click; it was 2339 before).
  - no readings: red, `AssertionError: expected undefined to be defined` at `App.test.ts:2334:34` (the stage-2 line, shifted by one).
  - Production code restored after both.

#### Resolution (2026-10-02)

Verdict: Approve

- Criterion 1 ✅ `hitTest.test.ts`, PHY-28 `SCENE`: the straight leg (−0,5; 0,2)→(0,5; 0,2) split at (0; 0,2) into two collinear segments, an arc of `p1` with sweep −0,5, tolerance 0,1. (0; 0,25) hits `r1`; (−0,45; 2) hits nothing.
- Criterion 2 ✅ the same test checks `undefined`, `[]`, a state without `path` and a state for another id: (−0,45; 2) hits `r1` and (0; 0,25) misses, as before. The existing tests in the block are unchanged.
- Criterion 3 ✅ after a review fix. 3.1 is met. For 3.2, the code met the pre-step half, because the guard covers `statesRef === null` at boot. The test did not exercise it until `9f95310` added the pre-step click (see Comments). `OPEN_SPACE` (2,5; 0,5) is about 2 m from the document rope, the pulley and every body.
- Criterion 4 ✅ both mutations are recorded with red output by stage 2, and again by the review on the amended test.
- Criterion 5 ✅ both test files gain additions only, plus one type import. No tolerance or name changed.
- The guard in `onPointerDown` (`statesRef.current ? constraintsRef.current : []`) is equivalent to `paint`'s (`states ? (opts?.constraints ?? []) : []`). `App.tsx:1320` is the only production caller of `ropeAtPoint`.
- Test-first ✅ `1c96be0` touches only tests, plus the ticket's `Stage:`. `8920c02` touches no test file. Every changed source file is in Primary files.
- Regressions: none found.
- Review fixes:
  - `9f95310`: test only, the pre-step click.
  - `59f3bcd`: docs only. The `constraintsRef` docblock, the `paint` guard comment and the "kept direction" item in ADR-0004 now name the click among the users of `RopeState.path`.
  - The ticket's Comments are reordered by date.
- Not fixed, judgement calls:
  - The parameter is `readings`, not the ticket's `constraints`, because the function's local `constraints` already holds `scene.constraints`. `drawConstraints` uses the same name. The new test loop still calls the value `constraints`.
  - The "reading's path, else `scenePath`" lookup now appears three times (`draw.ts`, `overlay.ts`, `hitTest.ts`).
  - The editor guard appears twice (`paint`, `onPointerDown`).
  - The branch is `clean-27`, not `AGENTS.md`'s `phy/<ID>-<slug>`. The driver named it.
- Proxy decided: none on this ticket. The proxy decision that opened it is PHY-56's.

Gate on `clean-27` at `59f3bcd`, based on the session tip `180309f`: `npm test` 30 files, 852 tests passed; `lint`, `typecheck` and `build` clean.

Merged into `sweatshop/2026-10-02-1156` as `ab63211` (`--no-ff`).
