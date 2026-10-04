# PHY-80: Setas de v e a ao vivo
Stage: reviewing
Status: ready-for-agent
Blocked by: PHY-78
Review: agent
Difficulty: normal

- Primary files:
  - src/render/overlay.ts (`ArrowKind` :38; `initialVelocityArrows` :81-98 → `velocityArrows`; nova `accelerationArrows`; `SYMBOL_KEY` :225-232; novo `VECTOR_COLORS`)
  - src/render/overlay.test.ts
  - src/App.tsx (`paint` :186-292: camadas :245-252 e ramo de seleção :257-268; cores das camadas saem para `VECTOR_COLORS`)
  - src/App.test.ts
  - src/playback/accelerationTracker.ts (`getAcceleration` :69, consumido sem alterar)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`vector.velocity`, `vector.acceleration`)
  - CONTEXT.md (entrada **Vector label**: a lista de símbolos ganha `v` e `a`)

#### What to build

Hoje o canvas desenha v₀ só antes do primeiro passo e nunca desenha a aceleração. Depois deste ticket, com o grupo cinemática do Foco ligado (PHY-78), o corpo carrega duas setas ao vivo:

**v.** `initialVelocityArrows(view, ppm)` vira `velocityArrows(view, states, ppm)`. Sem estados (`null`, antes do primeiro passo) devolve o que devolve hoje: `kind: 'initial-velocity'`, chave `initial-velocity:<id>`, rótulo v₀, a partir de `vx`/`vy` do documento. Com estados, devolve `kind: 'velocity'`, chave `velocity:<id>`, rótulo `t('vector.velocity')` ("v"), a partir de `state.position` ao longo de `state.linvel`; corpo fixo ou |v| = 0 não desenha. A cor é a mesma de v₀ (`#43a047`): a seta de v substitui a de v₀ depois do primeiro passo.

**a.** Nova `accelerationArrows(view, accelerations: ReadonlyMap<string, Vec2>, ppm)`: uma seta por corpo dinâmico com |a| > 0, `kind: 'acceleration'`, chave `acceleration:<id>`, rótulo `t('vector.acceleration')` ("a"), a partir da posição do corpo. O App monta o mapa com `getAcceleration(accelRef.current, scene, id, …)` para cada corpo dinâmico: é a aceleração gravada do registro exibido (`showFrame` já troca `accelRef`), e em t = 0 a analítica, como a leitura do painel. `overlay.ts` não importa `accelerationTracker.ts` (que já importa `overlay.ts`). A cor é nova e distinta das seis de hoje; o implementador escolhe.

**Regra e escopo.** As duas usam `vectorArrowLengthPx` (20·√módulo, clamp [24, 120] px) e `vectorLabels` (numeradas `v_1`, `v_2` só com dois ou mais corpos). O escopo é o de hoje: `showGlobal` desenha em todos os corpos; desligado, só no corpo selecionado (como v₀ e F já fazem no ramo de seleção de `paint`). O chip cinemática desliga as três (v₀, v, a).

**Cores.** As cores das camadas saem do literal em `paint` para `export const VECTOR_COLORS: Record<ArrowKind, string>` em `overlay.ts`, com `velocity` igual a `'initial-velocity'` e `acceleration` nova.

#### Acceptance criteria

1. `velocityArrows(view, null, ppm)` devolve exatamente o que `initialVelocityArrows(view, ppm)` devolve hoje (mesmos `from`, `vec`, `kind: 'initial-velocity'`, `key`), inclusive nada para `vx = vy = 0` e para corpo fixo.
2. `velocityArrows(view, states, ppm)` com `linvel: { x: 3, y: 4 }` devolve uma seta `kind: 'velocity'`, `key: 'velocity:<id>'`, `from` igual a `state.position`, `vec` de módulo `vectorArrowLengthPx(5) / ppm` na direção (0,6, 0,8); nada para `linvel` nulo e para corpo fixo.
3. `accelerationArrows(view, new Map([[id, { x: 0, y: -9.81 }]]), ppm)` devolve uma seta `kind: 'acceleration'`, `key: 'acceleration:<id>'`, para baixo, de módulo `vectorArrowLengthPx(9.81) / ppm`; com `{ x: 100, y: 0 }` o módulo é `ARROW_MAX_PX / ppm`; corpo sem entrada no mapa ou com `{ 0, 0 }` não desenha; corpo fixo não desenha mesmo com entrada.
4. `vectorLabels` rotula `'velocity'` como `v` e `'acceleration'` como `a` em pt-BR e em en; com dois corpos, `v_1`/`v_2` e `a_1`/`a_2`.
5. `VECTOR_COLORS.velocity === VECTOR_COLORS['initial-velocity']` e `VECTOR_COLORS.acceleration` é diferente de cada uma das outras seis entradas.
6. No `App`, antes do primeiro passo num corpo com `vx: 2`, `paint` escreve `v₀` e não escreve `v`; depois de um passo com o simulador falso devolvendo `linvel: { x: 1, y: 0 }`, escreve `v` e não escreve `v₀`.
7. Depois de dois passos com o simulador falso (poses que mudam a velocidade), `paint` escreve `a`; com o cursor no registro 1 a seta de a usa o tracker do registro 1 (o `lineTo` da seta difere do da ponta ao vivo quando as acelerações diferem).
8. `showGlobal` desligado e nenhum corpo selecionado: nenhum `v` nem `a`; com um corpo selecionado entre dois dinâmicos, só uma seta `v` e uma `a`. Chip cinemática desligado: nenhum `v₀`, `v` nem `a` em escopo nenhum.
9. `vector.velocity` e `vector.acceleration` em pt-BR e en (`'v'` e `'a'` nos dois); paridade verde.

#### Verification

    npm test -- src/render/overlay.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/overlay.test.ts`: critérios 1 a 5 chamando `velocityArrows`, `accelerationArrows`, `vectorLabels` e `VECTOR_COLORS` direto; vermelhos hoje porque não existem (o 1 falha no import).
- `src/App.test.ts`: critérios 6 a 8 com o simulador falso e o mock de canvas (`fillText`, `lineTo`); vermelhos hoje. Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: depende de D1; v ao vivo usa o verde de v₀ e a substitui depois do primeiro passo; a ganha uma cor nova escolhida pelo implementador e lê a aceleração gravada, sem saída nova do motor; mesma regra 20·√módulo, mesmo clamp e mesmo escopo das setas de força.
- Planner: `velocityArrows(view, states, ppm)` generaliza `initialVelocityArrows`; `accelerationArrows` recebe um mapa pronto para evitar import circular; `VECTOR_COLORS` em `overlay.ts` torna a distinção da cor testável.

- Stage 2 harness correction: the scope test initially included a mass-label subscript `a` in its vector-symbol list. It now filters the canvas vector colors before checking symbols. This is a test-only correction; both initial/live scope cases remain red without acceleration integration.

- Stage 2: the approved seams are the overlay producers/labels and App's canvas after transport/focus interactions. Callers inspected: paint's global and selected branches, vectorLabels, existing initial-velocity tests, repaint/showFrame, and getAcceleration's panel consumer. Empty/missing state maps, zero vectors, fixed bodies and the recording cursor at zero are covered. PHY-78 is done on the active session base.

#### Stage 2 mutation evidence (2026-10-04)

The new tests observe the real overlay producers and `drawArrow`; only the simulator, time and canvas platform are faked. Every temporary production mutation was restored before validation.

| New App test | Production mutation | Observed red output |
| --- | --- | --- |
| `PHY-80 replaces launch velocity with live velocity after stepping and restores it at record zero` | In the global velocity layer, replace `velocityArrows(view, states, ppm)` with `velocityArrows(view, null, ppm)`. | `AssertionError: expected [ 'v₀' ] to deeply equal [ 'v' ]`; **1 failed, 208 skipped**. |
| `PHY-80 paints analytic acceleration at initial time and restores it when seeking to zero` | Build the acceleration map using `getAcceleration(initialTracker(), ...)` instead of the displayed `accelRef.current`. | After two steps, `AssertionError: expected 360 to be 300`; **1 failed, 208 skipped**. |
| `PHY-80 paints acceleration from the displayed recording instead of the live tip` | Build the acceleration map using `liveFrameRef.current.acceleration` instead of `accelRef.current`. | At record 1, expected arrow-tip x `474.6`, received `485.24101615137755`; **1 failed, 208 skipped**. |
| `PHY-80 composes initial kinematic vectors with global scope, selection and focus` | In the selection branch, pass an empty acceleration map. Separately, replace the `showKinematics` focus check with `true`. | Selection mutant: `expected [ 'v₀' ] to deeply equal [ 'v₀', 'a' ]`. Focus mutant: `expected [ 'v₀', 'a' ] to deeply equal []`. Each run: **2 failed, 207 skipped**, including the live case. |
| `PHY-80 composes live kinematic vectors with global scope, selection and focus` | Same selection and focus mutations, at live time. | Selection mutant: `expected [ 'v' ] to deeply equal [ 'v', 'a' ]`. Focus mutant: `expected [ 'v', 'a' ] to deeply equal []`. Each run: **2 failed, 207 skipped**, including the initial case. |

Direct-producer mutation checks: returning `[]` from `velocityArrows` fails both new velocity cases (**2 failed, 52 skipped**); returning `[]` from `accelerationArrows` fails both geometry cases and both localized-label cases (**4 failed, 55 skipped**); setting acceleration's color to velocity's `#43a047` fails the color contract (**1 failed, 58 skipped**). Initial red commits: `7d78a24` (velocity), `b5e4e5f` (acceleration/labels/colors), `0bae6b8` (App), with the test-only mass-label harness correction in `3dae2b6`.

Implementation: `velocityArrows` uses null states for v₀ and simulated states for v; `accelerationArrows` consumes a prepared map without importing the tracker. The App uses the displayed frame's tracker, preserves scene-wide numbering under selection, and gates all three kinematic arrows on current focus. Acceleration uses red `#c62828`; previous layer colors are retained in `VECTOR_COLORS`. Both language catalogs and the Vector label domain entry are updated.

#### Stage 2 handoff (2026-10-04)

- Branch: `phy/PHY-80-setas-de-v-e-a-ao-vivo`, based on `sweatshop/2026-10-04-1243`. All nine numbered criteria implemented; no tracker or simulator changes. Only Primary files and this ticket changed.
- Added 12 test cases: seven overlay cases and five App canvas cases. After restoring mutations, overlay **59 passed (59)** and the PHY-80 App filter **5 passed, 204 skipped (209)**.
- Full gate `npm test && npm run lint && npm run typecheck && npm run build`: **exit 0**. Vitest: **33 files passed (33), 1274 tests passed (1274)**, including Chromium layout checks; ESLint and TypeScript passed; Vite built **52 modules**. Vite warns about chunks over 500 kB (the simulator chunk is 2,136.71 kB); this does not fail the build.
- `git diff --check` passed. Final diff inspected for scope, regressions, temporary mutations and generated artifacts; `dist` is not tracked. Tests remain in their own commits; production commits do not touch test files.
- Stage 2 stops at `to-review`; stage 3 reviews and integrates the branch into the session base.

- 2026-10-04 Stage 3 documentation cleanup: README's vector list now includes live `v`/`a` and their displayed-record/initial-time behavior. Stage 2 comments were moved after the existing planner entries to preserve append order under `## Comments`. No source or test files changed.
