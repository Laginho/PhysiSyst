# CLEAN-28: o caminho da corda (simulado, senão o do documento) escolhido num lugar só
Stage: blocked
Status: needs-triage
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

(A definir pelo stage 1. Este arquivo ainda não autoriza implementação.)

#### Acceptance criteria

(A definir pelo stage 1.)

#### Verification

(A definir pelo stage 1.)

## Tests stage 2 writes (own commit, red)

(A definir pelo stage 1.)

## Comments

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir da recomendação 5 do relatório `docs/relatorios/2026-10-02-sweatshop-sonnet-5.5-opus-5.5-2`. Depois do PHY-56 e do CLEAN-27, a mesma escolha "caminho que o simulador resolveu, senão o `scenePath` do documento" está escrita três vezes: `src/render/draw.ts:317` e `src/editor/hitTest.ts:97` (`(reading?.kind === 'rope' ? reading.path : undefined) ?? scenePath(scene, …)`) e `src/render/overlay.ts:134` (`state.path ?? scenePath(view, rope)`). A guarda do editor (`[]` sem `states`) também aparece duas vezes em `src/App.tsx` (`paint` e `onPointerDown`). As revisões do PHY-56 e do CLEAN-27 anotaram as duas coisas sem bloquear. A revisão do PHY-56 também apontou que `drawScene` (`src/render/draw.ts:181`) passou a ter 8 argumentos posicionais; a chamada em `src/App.tsx:198` já passa `undefined` para chegar aos dois últimos. Cabe ao stage 1 decidir onde a escolha do caminho mora (provavelmente ao lado de `scenePath`, em `src/scene/ropePath.ts`), se a guarda do editor vira uma variável só, e se `drawScene` ganha um objeto de opções neste ticket ou fica para outro.
