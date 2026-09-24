# PHY-23: Tracer — corda sobre uma polia fixa
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: human

- Primary files:
  - `src/scene/types.ts` (`Pulley`, `Constraint` com o ramo `rope`, coleções `pulleys` e `constraints` na Scene)
  - `src/scene/codec.ts`, `src/scene/codec.test.ts`
  - New: `src/scene/ropePath.ts`, `src/scene/ropePath.test.ts` (caminho tangente + comprimento, puro)
  - `src/scene/index.ts` (reexports)
  - `src/sim/simulator.ts`, `src/sim/index.ts`
  - `src/sim/acceptance.test.ts`
  - `src/playback/routing.ts`, `src/playback/routing.test.ts`
  - `src/editor/doc.ts` (`removeBodyAndDependents`), `src/editor/doc.test.ts`
  - `src/render/draw.ts` (desenho mínimo de corda e polia)
  - New: `docs/adr/0004-<slug>.md`

#### What to build

Uma cena importada por JSON com dois corpos ligados por uma corda que passa por uma polia fixa roda com a física certa: a máquina de Atwood e o bloco na mesa puxado por um bloco pendurado (com μₖ na mesa) aceleram como no livro, e a tração lida do simulador bate com a analítica. A corda e a polia aparecem no canvas (segmentos retos tangentes + círculo). Não há ferramenta de editor ainda.

Este ticket decide a arquitetura do vínculo. A corda é código nosso rodando em volta do `world.step()` (o Rapier 0.20 não tem polia nem devolve força de junta). O risco é o vínculo não convergir junto com contato e atrito. Se as famílias abaixo não passarem na tolerância, **não force**: `Stage: blocked` com as medições em `## Comments` — a decisão de reabrir o ADR-0001 é humana.

Schema (spec, seção Schema): `pulleys: { id, bodyId, anchor, radius, mass? }[]`, `constraints: ({ id, kind: 'rope', a: End, b: End, via: pulleyId[] } | …)[]`, `End = { bodyId, anchor }`. A corda não guarda comprimento: `L` sai do caminho nas posições do documento. Neste ticket o codec aceita apenas corda com exatamente uma polia montada em Corpo fixo; o resto é rejeitado com mensagem clara até PHY-24.

#### Acceptance criteria

1. `parse`/`serialize` fazem round-trip de `pulleys` e `constraints` (corda); documentos sem essas chaves parseiam com coleções vazias
2. O codec rejeita: polia em corpo inexistente, ponta de corda em corpo inexistente, `via` com polia inexistente, `radius ≤ 0`, e (temporário, até PHY-24) corda com `via.length ≠ 1` ou com polia em Corpo não fixo
3. `ropePath` devolve o caminho (segmentos tangentes às polias + arcos) e o comprimento; o lado do contorno sai da geometria entrada→saída; casos: simétrico, assimétrico, polia com raio grande
4. Atwood (m₁ ≠ m₂, pendurados de uma polia fixa): `a = (m₁−m₂)g/(m₁+m₂)` e `T = 2m₁m₂g/(m₁+m₂)` dentro de 2%, medidos em 1 s
5. Bloco na mesa (μₖ declarado no Contact) puxado por bloco pendurado: `a = (m₂ − μₖm₁)g/(m₁+m₂)` e `T = m₂(g − a)` dentro de 5%
6. O comprimento do caminho fica a menos de 1 mm de `L` enquanto a corda está esticada, durante todo o teste
7. O Simulator expõe uma leitura dos vínculos com `T` por corda; é ela que os critérios 4 e 5 verificam
8. `replaceScene` com carry no meio do movimento mantém o `L` do documento (t=0), não o das posições carregadas
9. Toda mudança em `pulleys` ou `constraints` roteia como estrutural
10. `removeBodyAndDependents` remove as polias montadas no corpo, as cordas presas a ele e as cordas que passam por essas polias
11. Verificação live em browser: importar a cena de Atwood por JSON, play, corda e polia desenhadas, massas se movem no sentido certo
12. `docs/adr/0004-*.md` registra o mecanismo escolhido, por que não a junta de corda do Rapier, e os erros medidos nos critérios 4–6
13. Testes de regressão mutate-verified conforme o `AGENTS.md`
14. Gate verde

#### Verification

    npx vitest run src/scene src/sim src/playback/routing.test.ts src/editor/doc.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: round-trip e rejeições (critérios 1–2). Vermelho porque a Scene não tem `pulleys`/`constraints`.
- `src/scene/ropePath.test.ts`: caminho e comprimento (3). Vermelho porque o módulo não existe.
- `src/sim/acceptance.test.ts`: Atwood, mesa + pendurado, conservação de `L`, `L` sob carry (4–8). Vermelho porque o simulador ignora cordas.
- `src/playback/routing.test.ts`: vínculo → estrutural (9). Vermelho porque o roteador não olha as coleções novas.
- `src/editor/doc.test.ts`: dependentes (10). Vermelho porque a remoção não conhece polias nem cordas.

## Comments

### Stage 2 (2026-09-24) — notes for the review

Commits: `3de3ab5` (tests, red), `fc94d48` (code), and the closing commit (ADR-0004 + this note).

**Decisions the ticket did not settle — please look:**

1. **Criterion 1, "parseiam com coleções vazias".** `pulleys` and `constraints` are *additive-optional* on the Scene (`pulleys?: Pulley[]`), like `particleMode` and `vx/vy`. A document without the keys parses with the fields **absent**, which reads as empty (`scene.pulleys ?? []`), and it keeps its exact bytes. The literal alternative, where `parse` always emits `[]`, breaks `presets.test.ts` and `persistence.test.ts` (both `toStrictEqual` on `parse(serialize(preset))`) and the byte-stable `isDirty` of every existing save. It would also force the keys into `presets/index.ts`, `persistence/index.ts` and every Scene literal in the tests, all outside Primary files. An explicit `[]` round-trips as `[]`.
2. **One line outside Primary files:** `src/App.test.ts`'s fake Simulator gains `readConstraints: () => []`. Criterion 7 extends the `Simulator` interface, and without that line the fake no longer typechecks. It is in the test commit.
3. **Pulley `mass`** is in the type (spec schema, and PHY-25 does not list `types.ts`), but the codec rejects it with "pulley mass is not supported yet" until PHY-25. Accepting it now would silently simulate a massless pulley.
4. **"Polia em Corpo não fixo" is rejected for every pulley**, not only for pulleys a rope uses. It is simpler, and PHY-24 lifts it anyway.

**Mechanism** (ADR-0004): prediction before the step, applied as a force, plus a correction impulse after it, warm-started with the residual. Measured errors are in the ADR table. The worst is the table case at μₖ = 0.2: `a` 0.05%, max `T` 0.79%, max |path − L| 0.26 mm. Nothing came close to a tolerance, so no block and no ADR-0001 reopen.

**Mutate-verify** (criterion 13). Each mutation was applied to production code with the committed tests unchanged, then reverted:

| Mutation | Red |
|---|---|
| `simulator.ts`: post-step correction removed | both table rows (\|path − L\| 2.73 mm, 1.36 mm > 1 mm), carry test (`slack` false) |
| `simulator.ts`: warm-start residual dropped | both table rows (2.73 mm, 1.36 mm) |
| `simulator.ts`: `L` recomputed from the carried poses after `replaceScene` | carry test (`expected false to be true`, slack) |
| `simulator.ts`: no pre-step pull | all 5 rope acceptance tests (\|path − L\| up to 0.31 m) |
| `ropePath.ts`: wrap side flipped | 6 of 7 ropePath tests (all but the dangling-reference one) + all 5 rope acceptance tests |
| `doc.ts`: ropes over a removed mount's pulleys kept | "removing a pulley mount…" (`['r1','r2']` vs `['r2']`) |
| `codec.ts`: one-pulley rule removed | both "rope with no/two pulleys" rejections |

The routing test and the other codec rejections were red before the code existed (commit `3de3ab5`).

**Live browser check** (criterion 11). Headless Chromium drove the real Vite app at 1280 px with a throwaway script, not committed. It imported an Atwood JSON (3 kg / 2 kg, pulley r = 0.4 on a fixed ceiling) through the real "importar" file input, with no import error. The canvas showed the ceiling, the pulley (circle + axle) and the rope as two vertical legs joined by the arc over the top. After clicking "▶ reproduzir" and waiting 0.7 s, `m_a` (the heavy one) had moved down and `m_b` up, both by about 32 px, with the rope still wrapping the pulley. The drawing has no strut between the pulley and its mount, which the minimal drawing does not ask for.

**Gate:** `npm test` 29 files, 526 tests passed; `npm run lint` clean; `npm run typecheck` clean; `npm run build` ok (the >500 kB chunk warning is the known one PHY-32 owns).

### Stage 3 (2026-09-24) — review

Verdict: Approve

Two axes, both sub-agents plus my own read of the rope code. No fix commit of my own; `Review: human`, so the PR waits.

**Spec.** All 14 criteria met. 1 is met as *absent-optional* collections (`scene.pulleys ?? []`), not literal `[]`: deliberate, follows the `particleMode`/`vx`/`vy` precedent, documented in `types.ts`, and the literal form would break byte-stable `isDirty` and two `toStrictEqual` suites outside Primary files. **This is the one decision to glance at before merging.** 2: every listed rejection has a codec check and a test. 4–6: test tolerances match the criteria (2%, 5%, 1 mm), `T` checked on every sample of the 1 s window. 11 reproduced here, not accepted from the report: headless Chromium, Atwood 3/2 kg imported through the real file input, no import error; ceiling, pulley (circle + axle) and rope (two legs + arc over the top) drawn; after 0.7 s of play `m_a` down and `m_b` up by the same ~32 px. 14 re-run: 29 files, 526 tests, lint, typecheck, build all green. Outside Primary files only the one `readConstraints: () => []` line in `App.test.ts` that criterion 7's interface change forces. Extra rejections (duplicate ids, unknown `kind`, pulley `mass`) are stricter than the spec, lifted by PHY-24/25 which own `codec.ts`.

**Standards.** No documented-standard breach. Judgement calls, none blocking, all candidates for one `CLEAN-*` ticket: `step()` still inlines the rotation `bodyPointToWorld` now provides; `pullRope`/`correctRope` share a prologue; `new Map(scene.bodies…)` is built in four places and `scenePath` rebuilds it per rope in `drawRopes`; `RopeFrame.length` (current) vs `RopeBinding.length` (fixed `L`) share a word for opposite roles; `drawRopes` also draws pulleys. No unit test pins `drawRopes` — the ticket asked for the live check (11) instead, which is what was done.

**Found outside this ticket, filed as PHY-34.** `resetForces` does not clear the torque `addForceAtPoint` adds, so torque accumulates step after step for any anchor off the COM: measured ω = 40.4 rad/s after 1 s where τ/I·t = 3 rad/s. Pre-existing on applied forces; the rope inherits it for off-COM ends, which none of this ticket's families have. Fix is one line but needs a regression test, so not a stage-3 fix. Comment left on PHY-24.

- 2026-09-24 Foreman: back to `to-review`. The review approved it but took the no-session flow (PR #7 against `main`, `to-merge`) while `sweatshop/2026-09-24-1506` was open; the reviewer card named `main` as the base, fixed in `dbfc90b`. Re-review merges into the session.
