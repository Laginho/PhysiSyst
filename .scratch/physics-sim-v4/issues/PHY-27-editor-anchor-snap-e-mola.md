# PHY-27: Editor I — Anchor snap e ferramenta Mola
Stage: done
Status: ready-for-agent
Blocked by: PHY-26
Review: agent

- Primary files:
  - New: `src/editor/anchorSnap.ts`, `src/editor/anchorSnap.test.ts`
  - `src/editor/doc.ts`, `src/editor/doc.test.ts` (adicionar, editar e remover mola)
  - `src/editor/hitTest.ts`, `src/editor/hitTest.test.ts` (acertar uma mola)
  - `src/App.tsx`, `src/App.test.ts`
  - `src/render/draw.ts` (destaque de seleção da mola)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

O aluno cria uma mola pela paleta: clica num ponto do corpo A, depois num ponto do corpo B. Cada clique passa pelo **Anchor snap**: perto do centro de massa, do meio de uma face ou de um vértice, a âncora vai para lá; senão fica onde clicou. Esc cancela no meio. A mola nasce relaxada (`x₀ = x`). Clicar na mola a seleciona: o inspetor mostra `k`, `x₀`, `Δx` e `c`, com `x₀` e `Δx` editáveis e ligados; Delete a remove; tudo é desfazível. Com a mola selecionada durante o playback, o painel de leitura mostra `F_el` e `Δx`.

O mesmo Anchor snap passa a valer para o ponto de aplicação das forças aplicadas, que ganha arraste no canvas (os campos numéricos continuam).

#### Acceptance criteria

1. `anchorSnap(body, pontoDoMundo, transform)` devolve a âncora local: centro de massa, meio de face ou vértice quando dentro de uma tolerância fixa em pixels de tela (o mais próximo vence); o próprio ponto caso contrário; puro, para os três formatos de Corpo
2. Ferramenta Mola: clique em A → clique em B cria exatamente uma mola com as âncoras do snap e `x₀` = distância atual; clique fora de Corpo é ignorado; clique em B = A é ignorado; Esc entre os cliques cancela sem mexer no doc
3. Inspetor da mola: editar `k`, `c`, `x₀`; editar `Δx` grava `x₀ = x − Δx`; valores inválidos seguem a regra de aviso do codec
4. Arrastar um corpo ligado mantém `x₀` e muda o `Δx` mostrado
5. Clicar na mola seleciona; Delete remove só a mola; Ctrl+Z restaura
6. Durante o playback, com a mola selecionada, o painel mostra `F_el` e `Δx` lidos do simulador
7. Arrastar o ponto de aplicação de uma força no canvas move a âncora com Anchor snap; um arraste = um passo de undo
8. Strings novas nos dois catálogos
9. Verificação live em browser: montar massa-mola à mão (chão fixo, parede fixa, bloco, mola da parede ao bloco), `Δx = −0,1`, play, oscila
10. Testes novos no `App.test.ts` com mutação aplicada e saída vermelha registradas em `## Comments` (AGENTS.md)
11. Gate verde

#### Verification

    npx vitest run src/editor src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/anchorSnap.test.ts`: candidatos, tolerância, mais próximo, fora da tolerância (1). Vermelho porque o módulo não existe.
- `src/editor/doc.test.ts`: operações da mola e o vínculo `x₀`/`Δx` (2–3).
- `src/editor/hitTest.test.ts`: acerto na mola (5).
- `src/App.test.ts`, no espelho do pointer e do teclado: criação, cancelamento, seleção, Delete, undo, arraste do ponto de força (2, 4, 5, 7). Vermelho porque a ferramenta não existe.

## Comments

- 2026-09-24 (review do PHY-26, stage 3) O critério 6 lê `SpringState` (`{ id, kind: 'spring', dx, force: { a, b } }`) de `readConstraints`, mas o tipo não é exportado de `src/sim/index.ts` — CLEAN-05 exporta. Se o CLEAN-05 ainda não tiver fechado quando este ticket entrar, a etapa 1 acrescenta `src/sim/index.ts` aos Primary files.
- 2026-09-24 (stage 2) CLEAN-05 fechou antes: `SpringState` já sai de `src/sim/index.ts`, nenhum arquivo novo nos Primary files.
- Proxy decided: critério 3 — um valor que o codec rejeitaria (k ≤ 0, x₀ ≤ 0, incluindo Δx ≥ x, c < 0) nunca entra no doc; a edição é descartada, sem clamp, e o inspetor da mola mostra uma linha de aviso (string nova nos dois catálogos) — `collectWarnings` não tem aviso de mola e `parseSpring` rejeita os três, então a única regra do codec que o inspetor pode seguir é "nada que ele grava falha no parse"; clamp mudaria a física em silêncio.
- 2026-09-24 (stage 2) Escolhas de implementação, para a revisão:
  - Um Corpo sob o ponteiro ganha da ponta da mola ancorada nele; a mola é escolhida onde cruza espaço livre (tolerância 8 px em volta da linha âncora–âncora). Sem isso, um bloco com mola no centro de massa não se arrasta pelo centro.
  - Mola nova nasce com `k = 20 N/m` (`SPRING_DEFAULT_K`), sem `c`. Âncoras coincidentes (x₀ = 0) são recusadas com `error.molaSemComprimento`, mostrado na linha de dica da ferramenta.
  - O Anchor snap do círculo só tem o centro de massa: círculo não tem face nem vértice.
  - O ponto de aplicação só é arrastável com o Corpo selecionado (é quando a seta aparece), a 10 px do ponto, depois das alças; um anel marca a pega.
  - O `Δx` do inspetor é medido nas poses do documento; o da leitura vem do simulador, e só quando o mundo não espera reconstrução.
- 2026-09-24 (stage 2) Mutate-verify dos testes novos do `App.test.ts` (critério 10). Cada mutação em `src/App.tsx`, revertida depois; saída do `npx vitest run src/App.test.ts -t "PHY-27"`:
  - "cria exatamente uma mola…": âncora sem snap (`worldToLocal(hit, w)` no lugar de `anchorSnap`) → `expected 3.9038570670556063 to be close to 3.8078865529319543` (e mais 5 testes vermelhos). Um par de cliques criando duas molas num commit → passou na primeira versão; o teste passou a reselecionar a mola pela linha (commit 58021e7) e aí `AssertionError: expected undefined to be defined`.
  - "clique fora de Corpo é ignorado…": clique fora cancela a ferramenta → `Error: missing panel mola`.
  - "clique em B = A é ignorado…": clique no corpo de A troca a âncora A → `expected 4.825971404805461 to be close to 3.8078865529319543`.
  - "Esc entre os cliques cancela…": Esc sem o ramo da ferramenta → `AssertionError: expected undefined to be defined`.
  - "clicar na mola seleciona; Delete…": clique na mola nunca seleciona → `expected undefined to be defined`; Delete ignora a mola → `expected <fieldset …> to be undefined`; Delete leva também o corpo `b` da mola → `expected undefined to be defined`. (Deixar a seleção apontando para a mola removida ficou verde: é invisível, o painel exige a mola existir.)
  - "arrastar um corpo ligado mantém x₀…": inspetor com `dx={0}` → `expected +0 to be close to 0.9355299373206147`; arraste que relaxa as molas no pointerup → `expected 4.743416490252569 to be close to 3.8078865529319543`.
  - "inspetor edita k, c, x₀…": sem a checagem do codec → `expected -5 to be 80`; campo Δx gravando x₀ = v → `expected 3.8078865529319543 to be close to 3.9078865529319544`; aceitando `c < 0` → `expected -1 to be 0.5`.
  - "durante o playback… F_el e Δx": leitura da mola sempre nula → `expected 'leitura — molapassos: 150velocidade: …' to contain 'F_el: 2.00 N'`.
  - "arrastar o ponto de aplicação…": arraste sem snap (`worldToLocal`) → `expected 0.46000000000000085 to be 0.5`. Um passo de undo por pointermove → passou na primeira versão; o teste passou a desfazer até o passo de adicionar a força (commit 58021e7) e aí `expected 'forças de blocof✕módulo (N)direção (°…' to contain 'nenhuma'`.
- 2026-09-24 (stage 2) Verificação live (critério 9), Chromium headless pelo `src/test/browser.ts`, a 1280 px, num teste descartável não commitado: "nova cena" (chão fixo), retângulo fixo 1 × 4 em (1, 2) como parede, retângulo 1,5 × 1 em (5, 0,5) como bloco, ferramenta mola com clique na parede em (1,45, 0,5) e no bloco perto do meio da face esquerda. Mola criada com `x₀ = 2,800` (snap na face do bloco em x = 4,25), `Δx = 0`, `k = 20`; `Δx = −0,1` gravou `x₀ = 2,900`. Play: leitura da mola `F_el: 1.73 N`, `Δx: 0.087 m` aos 35 passos; x do bloco amostrado a cada 100 ms: 5,19 5,13 5,09 5,04 5,01 5,00 5,01 5,03 5,07 5,11 5,16 5,20 5,19 5,17 5,13 5,08 5,05 5,01 5,00 5,01 5,03 5,11 5,16 5,18 5,20 … — oscila entre 5,00 e 5,20 m, período ≈ 1,3–1,4 s (teoria `2π√(m/k)` = 1,405 s).
- 2026-09-24 (stage 2) Gate: `npm test` 30 arquivos, 620 testes verdes; `npm run lint`, `npm run typecheck` limpos; `npm run build` ok (só o chunk tardio `sim` acima de 500 kB, já documentado no PHY-32).

#### Resolution (2026-09-24)

Verdict: Approve

Stage 3 review of `b708866..ab65aac` (5 commits) against the loop's base `sweatshop/2026-09-24-1853`, plus one small fix of its own (`9fcb50e`), merged as `8ab677b`. Gate rerun first on the branch tip as received (30 files, 620/620; lint, typecheck, build clean), then two-axis review (`code-review`: Standards and Spec sub-agents) over the whole diff; every finding is listed here.

**Proxy decided** (one line on this ticket): criterion 3, an edit the codec would reject (`k ≤ 0`, `x₀ ≤ 0` including `Δx ≥ x`, `c < 0`) is discarded, no clamp, and the inspector shows one warning line. Implemented as `commitSpringEdit` + `spring.invalid` in both catalogs; the inspector test covers `k = −5`, `Δx = 5` and `c = −1`.

**Test-first rule.** `b708866` touches only the four test files the ticket names plus the ticket (Stage → implementing). The two code commits (`fa07dfb` editor modules, `8153c76` App, draw, i18n) touch no test file. `58021e7` is test-only: two assertions tightened after mutations survived (spring count, one undo step per drag), each recorded with its red output. `ab65aac` is the ticket. Every file in the diff is in Primary files.

**Red-green proof.** With the seven production files reset to the base (`anchorSnap.ts` removed) and the PHY-27 tests kept: `npx vitest run src/editor/anchorSnap.test.ts src/editor/doc.test.ts src/editor/hitTest.test.ts src/App.test.ts` → `anchorSnap.test.ts` and `doc.test.ts` fail at import (module and exports missing), 12 tests fail (4 `springAtPoint`, 8 of the 9 App tests), 42 pass. The one App test green on the base, "Esc entre os cliques cancela", is a regression guard: it is red under mutation 4 below, where the tool exists but Esc skips it. On the branch tip: 620/620.

**Mutations rerun**, all 14 of the ticket's record, one at a time on `src/App.tsx`, reverted after each (`npx vitest run src/App.test.ts -t PHY-27`, 9 tests): 1 anchor without snap → 6 red, same numbers; 2 two springs per pair → 3 red; 3 click-off cancels the tool → 1 red, `missing panel mola`; 4 click on A's body swaps anchor A → 1 red; 5 Esc without the tool branch → 1 red; 6 spring click never selects → 3 red; 7 Delete ignores the spring → 1 red, fieldset defined; 8 Delete takes body `b` too → 1 red; 9 inspector `dx={0}` → 2 red; 10 codec check removed → 1 red, `expected -5 to be 80`; 11 Δx field writes `x₀ = v` → 1 red; 12 readout always null → 1 red, `sem leitura`; 13 force drag without snap → 1 red, `0.46 to be 0.5`; 14 one history push per pointermove → 1 red, `to contain 'nenhuma'`. Every count and message matches the record.

- ✅ 1 — `anchorSnap`: pure; rectangle 9 candidates, circle 1, triangle 7 with the centroid at `(2b/3, h/3)` in the same `(0,0),(b,0),(b,h)` frame as `hitTest`/`draw`; tolerance `10 px / pixelsPerMeter`; nearest wins on `<=`; else `worldToLocal`. 13 unit tests, direct calls. Zoom test proves the tolerance is in pixels.
- ✅ 2 — `onSpringToolClick`: off-body ignored, same body ignored, Esc nulls the tool without touching the doc; `addSpring` measures `x₀` at the document's poses through each body rotation. Mutations 1–5.
- ✅ 3 — `updateSpring`, `setSpringDx` (`x₀ = x − Δx`), refusal per the proxy decision. Mutations 9–11.
- ✅ 4 — `springDx(doc, spring)` recomputed every render from the document. `doc.test.ts` "moving a linked body keeps x0"; App test with a real drag. Mutation 9.
- ✅ 5 — `springAtPoint` (topmost, segment distance, ropes never hit; 4 unit tests); a body under the pointer wins over a spring end anchored on it, disclosed by stage 2, and the App test grabs the block at the anchored center to pin it. `deleteSelected` routes the shortcut and the panel button through `removeConstraint`. Mutations 6–8.
- ✅ 6 — the readout poll reads `readConstraints()` for the selected spring, null while a rebuild is pending, `F_el = force.a` (equal at both ends for the ideal spring, ADR-0004). Mutation 12. **Small fix (stage 3, `9fcb50e`)**: the poll only wrote the reading while a spring was selected, so after deselecting `mola` and selecting `mola-2` the panel showed `mola`'s values under `mola-2`'s legend for one tick. Now null when no spring is selected, mirroring the body readout. Inside Primary files, no new test, gate rerun green.
- ✅ 7 — `forceAnchor` drag: grabbed at `HANDLE_HIT_RADIUS_PX` after the handles, `anchorSnap` per move, one `pushHistory` in `onPointerUp` like every other drag. Only with the body selected (when the arrow is drawn), disclosed by stage 2; the ticket does not say otherwise. Mutations 13–14.
- ✅ 8 — 14 keys added to both catalogs, same set (`palette.spring`, `tool.spring*`, `spring.*`, `readout.spring*`, `error.molaSemComprimento`, two reworded shortcuts). `F_el` / `F_s` per the spec's label table.
- ✅ 9 — live check recorded above (headless Chromium, hand-built mass-spring, `Δx = −0,1`, oscillation between 5,00 and 5,20 m, period ≈ 1,3–1,4 s vs 1,405 s). Not repeated; the record is what the criterion asks.
- ✅ 10 — 14 mutations recorded, all rerun above.
- ✅ 11 — gate on the merged tip: 30 files, 620/620; lint and typecheck clean; build ✓ (pre-existing chunk-size warning).

**Standards axis.** One documented-doctrine tension: `commitSpringEdit` is a per-field positivity check in the editor, which the `doc.ts` guard doctrine forbids, but the proxy decision on criterion 3 asked for exactly that. **Small fix (stage 3, `9fcb50e`)**: the doctrine comment records the exception and why (a clamp would change the physics silently). Two judgement calls noted, not acted on: `addSpring`'s `x₀ = 0` refusal is a positivity check framed as structural (user-actionable, so allowed); test-local names `wedge` and `block` sit on CONTEXT.md's _Avoid_ lists (`palette.triangle: 'wedge'` predates this ticket).

**Findings outside the contract → CLEAN-06** (none is a criterion, none blocks):
1. Selection is two nullable strings (`selectedId`, `selectedSpringId`) with the "one clears the other" invariant kept by hand at six sites; the trash drop in `onPointerUp` clears only the body id. PHY-28 adds two more selectable kinds.
2. Geometry duplicated across `anchorSnap`, `hitTest`, `contactSnap`, `handles`: `base·tan(α)` is now the seventh `switch (body.shape)` computing it; `candidates()` restates `polygonVertices`; `distanceToSegment` re-derives `closestPoint`; `anchorSnap`'s best-within-tolerance walk is `pickHandle`'s shape.
3. `drawRopes` now draws and highlights springs; `springToolRef` syncs through a setter wrapper while every other ref syncs in an effect; `updateSpring`/`removeConstraint` have no doc comment. The pending-anchor dot and the force-grip ring in `paint` are the same save/arc/restore block twice.
