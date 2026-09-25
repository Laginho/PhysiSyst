# PHY-37: Corpo coberto pela polia montada nele não pode ser selecionado
Stage: to-review
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (`onPointerDown`: a ordem polia → corpo)
  - `src/editor/hitTest.ts` (`pulleyAtPoint`)
  - `src/App.test.ts`

#### What to build

No clique, a polia ganha do corpo em que está montada, e `pulleyAtPoint` acerta o disco inteiro da polia. Um corpo que cabe todo dentro do disco nunca é selecionado pelo canvas. Não dá para arrastá-lo, apagá-lo, nem ler ou editar sua massa.

É o caso do preset "Polia móvel": a `carga` (0,3 × 0,3 m, meia diagonal 0,212 m) fica toda dentro da polia `movel` (raio 0,25 m, no centro de massa). No passe manual do PHY-33 (Chromium, 1280 px), cliques no centro e em três cantos da `carga` selecionaram a `movel` todas as vezes.

Um corpo que tem uma polia montada continua selecionável pelo canvas, qualquer que seja o tamanho da polia. Regra (decidida pelo proxy, ver Comments): dentro do disco a polia ganha, exceto onde o ponto também está dentro do corpo em que ela está montada; ali a polia só ganha a até `AXLE_HIT_RADIUS_PX` (5 px, o ponto do eixo de 3 px mais margem) do eixo. A mesma regra vale na seleção e na ferramenta Corda. Outros corpos sob o disco continuam perdendo para a polia.

#### Acceptance criteria

1. No preset "Polia móvel", um clique na `carga` fora do eixo da polia seleciona a `carga`
2. A polia continua selecionável por clique, e o clique na polia continua valendo na ferramenta Corda
3. Teste de regressão mutate-verified conforme o `AGENTS.md`
4. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: preset "Polia móvel", clique num canto da `carga`, confere que ela foi selecionada. Vermelho porque a `movel` é selecionada no lugar.

## Comments

- 2026-09-25 Aberto pelo passe manual do PHY-33, item 3. A polia móvel montada à mão no passe precisou de uma carga de 0,8 m de largura para a carga poder ser clicada.
- 2026-09-25 Proxy decided: regra A (no próprio corpo de montagem a polia só pega perto do eixo; fora dele, o disco inteiro) — só o aro quebraria o contrato do PHY-28 e degeneraria em polias pequenas.
- 2026-09-25 Proxy decided: raio do eixo `AXLE_HIT_RADIUS_PX = 5`, não os 10 px das alças — a 60 px/m a `carga` tem 18 px e 10 px a engoliriam quase toda.
- 2026-09-25 Mutate-verify (stage 2), `src/App.test.ts` › "corpo coberto pela polia montada nele (PHY-37)", `npx vitest run src/App.test.ts -t PHY-37`:
  - "um clique num canto da carga…": red before the fix (commit 1, `expected undefined to be defined` on `panel(host, 'carga')` — `movel` got selected). Mutation M3, `onPointerDown` back to `pulleyAtPoint(view, w)` (whole disk): the same red, 1 failed | 2 passed.
  - "o eixo da polia continua selecionando a polia": mutation M1, `onPointerDown` passing axle radius `0`: `expected undefined to be defined` on `panel(host, 'movel')`, 1 failed | 2 passed. The first version clicked exactly on the axle (d = 0) and stayed green under M1, hollow; commit 2 moves the click 3 px off the axle.
  - "na ferramenta Corda, o eixo da polia entra na corda…": mutation M2, `onToolClick` passing axle radius `0`: `expected undefined to be defined` on `panel(host, 'corda-2')`, 1 failed | 2 passed.
  - Gate after restoring: 30 files, 712 tests passed; lint, typecheck, build clean.
