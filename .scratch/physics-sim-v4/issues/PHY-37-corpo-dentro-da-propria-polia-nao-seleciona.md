# PHY-37: Corpo coberto pela polia montada nele não pode ser selecionado
Stage: done
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

#### Resolution (2026-09-25)

Verdict: Approve

Findings:

- Critério 1 ✅ — `pulleyAtPoint` recebe `axleTolerance` e, dentro do disco, só devolve a polia se `d <= axleTolerance` ou o ponto está fora do corpo de montagem (`!pointInBody(mount, w)`). Os dois callers em `App.tsx` (`onPointerDown` e o ramo Corda de `onToolClick`) passam `AXLE_HIT_RADIUS_PX / camera.pixelsPerMeter`. O teste clica no canto da `carga` do preset "Polia móvel" e lê o painel da `carga`, não o da `movel`.
- Critério 2 ✅ — clique 3 px ao lado do eixo seleciona a `movel`; na ferramenta Corda o mesmo clique entra na `via` e a corda `corda-2` nasce. Fora do corpo de montagem o disco inteiro continua pegando: mutando `!pointInBody(mount, w)` para `false`, 8 testes do PHY-28 caem (`Polia: um clique num corpo monta a polia…`, `Corda: A → polias → B…`, …), 8 failed | 704 passed. O ramo já está pinado pelos testes existentes.
- Critério 3 ✅ — o ledger de mutate-verify do stage 2 (M1, M2, M3 acima) está completo, uma mutação e um vermelho por teste; o registo do primeiro teste do eixo ter sido oco (d = 0) e corrigido no commit 2 é exatamente o que o `AGENTS.md` pede.
- Critério 4 ✅ — gate verde (abaixo).
- Test-first ✅ — `de18db5` toca `src/App.test.ts` + ticket; `deb76aa` só `src/App.test.ts`; `311871c` toca `src/App.tsx`, `src/editor/hitTest.ts` + ticket, nenhum teste. Tudo dentro dos Primary files. O fix está na função partilhada por todos os callers, não em cada caller.
- Regressão: nenhuma. Dois efeitos da regra literal, ambos o que o ticket pede: (a) um corpo empilhado sobre o corpo de montagem, debaixo do disco e fora do eixo, ganha da polia (`bodyAtPoint` devolve o topo); (b) a `fixa` do preset perde para o `teto` na fatia do disco que entra no `teto`, sem impacto visível. Só juízo, sem ação.
- Nota (fora dos Primary files, vai para o CLEAN-14): `axleTolerance = Infinity` como default em `pulleyAtPoint` existe só para os cinco call sites do `src/editor/hitTest.test.ts` (PHY-28) não mudarem. Um caller futuro que omita o argumento recupera em silêncio o bug do PHY-37. Tornar o parâmetro obrigatório toca `hitTest.test.ts`, fora dos Primary files.
- Proxy decided: regra A (no corpo de montagem a polia só pega perto do eixo; fora dele, o disco inteiro); `AXLE_HIT_RADIUS_PX = 5`. Ambas as decisões estão no código e nos testes como descritas.
- Standards: sem violações. O `Spec` sub-agent apontou "ramo fora do corpo de montagem sem teste"; verificado por mutação acima e descartado.

Files: `src/editor/hitTest.ts` (`AXLE_HIT_RADIUS_PX`, `pulleyAtPoint(scene, w, axleTolerance)`), `src/App.tsx` (dois callers), `src/App.test.ts`.

Red-green: com `src/App.tsx` e `src/editor/hitTest.ts` na versão do branch de sessão, `npx vitest run src/App.test.ts -t PHY-37` → 1 failed | 2 passed (`expected undefined to be defined` em `panel(host, 'carga')`). Com o fix: 3 passed.

Gate: `npm test` 30 files, 712 passed; `npm run lint` limpo; `npm run typecheck` limpo; `npm run build` ok (aviso de chunk > 500 kB pré-existente).

Merged into `sweatshop/2026-09-24-1853` at `b51e873`.
