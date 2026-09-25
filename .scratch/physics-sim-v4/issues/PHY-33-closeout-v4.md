# PHY-33: Closeout v4
Stage: implementing
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
