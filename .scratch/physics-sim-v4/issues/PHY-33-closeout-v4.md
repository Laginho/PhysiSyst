# PHY-33: Closeout v4
Stage: done
Status: ready-for-agent
Blocked by: PHY-23, PHY-24, PHY-25, PHY-26, PHY-27, PHY-28, PHY-29, PHY-30, PHY-31, PHY-32
Review: human

- Primary files:
  - `FINAL_REPORT.md` (seção v4)
  - `CONTEXT.md` (conferir os termos novos contra o que foi entregue)
  - `README.md` (lista de recursos)
  - `package.json` (`version` → 0.4.0)

#### What to build

O ciclo fecha verificável: portões verdes, passe manual executado no browser real e registrado, e o FINAL_REPORT ganha a seção v4 (escopo entregue por ticket, portões, passe manual, limitações conhecidas, próximos passos segundo o roadmap da spec).

Passe manual (desktop):

1. Montar Atwood à mão e conferir `T` no painel contra a analítica
2. Montar bloco na mesa com bloco pendurado, declarar μₖ e ver a aceleração cair
3. Montar polia móvel e ver o bloco andar a metade do contrapeso
4. Pêndulo em volta completa lento: o fio afrouxa no topo
5. Mola "comprimida de 5 cm" pelo campo `Δx`: oscila com o período certo
6. Rótulos `P`, `N`, `F`, `T`, `F_el`, `v₀` legíveis; trocar para inglês troca `P`→`W`
7. Apagar um corpo com corda, polia e mola presas: nada fica pendurado; Ctrl+Z restaura tudo
8. Galeria em árvore: só nós com preset, cada preset novo roda

#### Acceptance criteria

1. Quatro portões verdes localmente e CI verde no último merge
2. Passe manual executado, resultado por item no FINAL_REPORT; cada ❌ vira ticket `needs-triage`
3. FINAL_REPORT v4: escopo, portões, passe manual, limitações (as do v1 que seguem + as novas), próximos passos
4. `CONTEXT.md` descreve Rope, Pulley, Spring, Anchor snap, Vector label e Preset tree como entregues
5. README lista vínculos, rótulos e galeria em árvore; `version` 0.4.0
6. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: ticket de documentação e verificação manual.

## Comments

- 2026-09-25 Attempt 1 failed: exit 0. Log tail: ...the real app in headless Chromium through all eight checks. /  / So far: / - **Gates:** green locally, 703 tests in 30 files, plus lint, typecheck and build. CI is green on the latest merge on `main` (`ca9aab8`, PR #8). Most of v4 is still on the unpushed session branch, so its CI hasn't run yet. The report says so. / - **Branch:** `phy/PHY-33-closeout-v4`, with the move to `implementing` committed. / - **Docs, not yet committed:** /   - `package.json` is at 0.4.0. /   - The README now lists ropes, pulleys and springs, the vector letters and the gallery tree. /   - `CONTEXT.md` needed two fixes: the Scene definition didn't mention pulleys, and it still said the wedge is "preset #1", which stopped being true with the gallery tree. /   - The v4 section of `FINAL_REPORT.md` is drafted: scope per ticket, gates, limitations and next steps. The manual-pass results go in when the agent finishes. / - **Loose end:** `package-lock.json` still says version 0.3.0. It's outside this ticket's allowed files, so I'll note it on the ticket rather than change it. /  / When the pass comes back I'll fill in its results and open a `needs-triage` ticket for each failure. Then I'll commit, with the ticket moved to `to-review`. /
- 2026-09-25 Attempt 2 (stage 2). The first attempt ended because it left the manual pass running in a background agent, and its branch did not survive. This attempt restarted from the session branch at `edf6b16` and ran everything in the foreground.
  - Gates: 703 tests / 30 files, lint, typecheck and build green, both before the edits and after them. CI is green on the latest merge on `main` (`ca9aab8`). v4 itself has not been through CI yet, and `FINAL_REPORT.md` says so.
  - Manual pass: headless Chromium at 1280 px, driven through `src/test/browser.ts` (loaded by Vite SSR) with real palette clicks, pointer clicks on the canvas and inspector fields. The per-item numbers are in `FINAL_REPORT.md`. All eight items pass. The driver script and screenshots stayed in the session scratchpad and are not committed, because a pass script is not among this ticket's Primary files.
  - Defects opened as `needs-triage`: PHY-36 (a scene switch inherits the simulated state), PHY-37 (a body covered by its own pulley can't be selected), PHY-38 (the step-0 acceleration ignores ropes and springs). The three ticket files sit outside Primary files. Criterion 2 is what asks for them.
  - `CONTEXT.md`: the Scene definition now lists pulleys, and the Preset entry no longer calls the wedge "preset #1". Rope, Pulley, Spring, Anchor snap, Vector label and Preset tree already matched what was delivered.
  - Loose end: `package-lock.json` still says `version` 0.3.0. It is outside Primary files and was left alone.

#### Resolution (2026-09-25)

Verdict: Approve

Stage 3 review (Standards + Spec axes, two sub-agents), merged into `sweatshop/2026-09-24-1853` at `1b8cfcf`. `Review: human` holds nothing inside a session branch; it puts this ticket at the top of the session PR.

- **Criteria 1–6 met.** Gate rerun on the ticket branch after the fix commit: 703 tests / 30 files, `eslint .`, `tsc --noEmit`, `vite build` (entry 285.67 kB, lazy Rapier chunk 2,132.26 kB, the >500 kB advisory only on that chunk). CI on `main` `ca9aab8` (PR #8) confirmed green with `gh run list`. All eight manual-pass items have a result row; the three defects opened as `needs-triage` (PHY-36, PHY-37, PHY-38) exist, are next in sequence, and their claims were checked against the code: `pulleyAtPoint` runs before `bodyAtPoint` and hits the whole disk; the "Polia móvel" load is 0.3 m inside a 0.25 m pulley; `getAcceleration` sums only gravity and applied forces and marks `≈` only from Contacts; `switchToScene` never resets playback and `carryOver` keeps same-id, same-pose bodies. CONTEXT.md's six terms match the code (letters match the i18n catalogs; `galleryGroups()` hides empty nodes). README's "doze cenas prontas" matches the twelve entries of `PRESETS`. `package.json` 0.4.0.
- **Contract rules.** No test files in any commit (documentation ticket, none expected). Diff stays inside the four Primary files plus the PHY-33 ticket and the three tickets criterion 2 asks for. No `Proxy decided` lines.
- **Small fixes made here (`091c3fa`, FINAL_REPORT.md only):** the "Also open at closeout" paragraph named CLEAN-13 by `Stage` while its neighbours were named by `Status`; manual-pass item 3 called the `carga` Body "Load", a word CONTEXT.md reserves for applied forces.
- **Findings left as notes, none a criterion:** (1) PHY-36's comment describes item 4's control run as "não achava a corda para selecionar" while the report's row says the preset "resumed the previous run"; same bug, two symptoms, harmless. (2) PHY-36's criterion 2 names six switch paths but its planned test covers only duplicate; stage 1 settles it at triage. (3) PHY-36 and PHY-37 list Primary files with the fix in the scope note; PHY-35 set the precedent. (4) `package-lock.json` still records 0.3.0; outside Primary files, the next `npm install` rewrites it. (5) Prose uses "block" and "wedge" as problem nouns as v3 did; not changed.
- Red-green proof: not applicable, no tests in this ticket.
