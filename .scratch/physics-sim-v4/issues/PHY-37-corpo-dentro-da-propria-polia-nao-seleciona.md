# PHY-37: Corpo coberto pela polia montada nele não pode ser selecionado
Stage: to-implement
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

Um corpo que tem uma polia montada continua selecionável pelo canvas, qualquer que seja o tamanho da polia. O triage escolhe a regra: por exemplo, a polia pega só perto do aro, ou o corpo ganha longe do eixo.

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
