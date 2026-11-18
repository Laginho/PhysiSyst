# CLEAN-35: Punho de força oculto ainda intercepta o arrasto do corpo
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - src/App.tsx (seleção do punho da força em `onPointerDown`)
  - src/App.test.ts (bloco `CLEAN-35 force grip visibility`)

#### What to build

Correção limitada ao bloqueador reproduzido na revisão do PR #17. O usuário autorizou diretamente corrigir os dois defeitos revisados com subagentes GPT-6.1-sol high. As costuras aceitas são controles/pointer do App pelo DOM, o caminho real de desenho observado no canvas e persistência pública save/load; não foi necessária nova autorização.

Ao desligar forças no Foco, o canvas oculta a seta e o punho, mas `onPointerDown` ainda selecionava a âncora invisível antes do corpo. Com uma bola em (6, 4) e âncora local (0, 0), arrastar o centro até (7, 4) deixava o corpo parado e movia a âncora. O hit-test deve respeitar o Foco atual de `docRef.current`, incluindo o padrão de todos os grupos quando `focus` está ausente.

#### Acceptance criteria

1. Forças ocultas: arrastar (6, 4) → (7, 4) move o corpo, mantendo a âncora local (0, 0), em escopo selecionado e global.
2. Forças visíveis: o mesmo arrasto continua movendo a âncora local para (1, 0), mantendo o corpo em (6, 4), nos dois escopos; preservar o comportamento global estabelecido.
3. Com forças ocultas, os campos x/y da âncora continuam habilitados e gravam (0.2, -0.2), sem mover o corpo.

#### Verification

    npm.cmd test -- src/App.test.ts -t 'CLEAN-35 force grip visibility' --pool=threads --maxWorkers=1
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes

O teste inicial foi escrito antes da correção: falhou no DOM público com `expected { x: 6, y: 4 } to deeply equal { x: 7, y: 4 }` (1 failed, exit 1). O mesmo teste verifica presença positiva do punho laranja no canvas e ausência após desligar forças, além da edição pelos campos do painel. A correção mínima acrescenta somente o guard de Foco ao hit-test existente.

## Comments

### Implementação e mutate-verify — 2026-10-07

Todas as mutações abaixo foram temporárias, limitadas ao hunk de seleção da âncora em `onPointerDown`, executadas e restauradas sem restaurar arquivos inteiros. Os testes mantêm reais os produtores de vetores, o desenho, o codec e a persistência; usam o simulador falso já existente no harness do App.

| Teste (`src/App.test.ts`, prefixo `CLEAN-35 force grip visibility`) | Mutação na produção | Saída vermelha observada |
| --- | --- | --- |
| `drags the body past its hidden force grip and still edits the anchor through fields: selected scope` | Remover o guard `(docRef.current.focus?.show ?? FOCUS_GROUPS).includes('forces')` do hit-test. | `expected { x: 6, y: 4 } to deeply equal { x: 7, y: 4 }` — corpo permaneceu em x=6; execução exit 1, 2 failed. |
| `drags the body past its hidden force grip and still edits the anchor through fields: global scope` | Mesma remoção do guard. | `expected { x: 6, y: 4 } to deeply equal { x: 7, y: 4 }` — mesma execução exit 1, 2 failed. |
| `drags the visible force anchor without moving the body: selected scope` | Inverter o filtro do corpo no hit-test: `if (f.bodyId === selected.id) return false`, impedindo capturar sua força visível. | `expected { x: +0, y: +0 } to deeply equal { x: 1, y: +0 }` — âncora permaneceu em x=0; execução exit 1, 2 failed. |
| `drags the visible force anchor without moving the body: global scope` | Mesma inversão do filtro. | `expected { x: +0, y: +0 } to deeply equal { x: 1, y: +0 }` — mesma execução exit 1, 2 failed. |

- Verde após restauração: **4 passed**, exit 0, filtro `CLEAN-35 force grip visibility`; os demais casos ficaram fora desse filtro.
- Diff limitado à linha do guard, ao novo bloco de testes e a este registro. Nenhuma alteração em escopo global, paint, ForcesPanel ou simulação; o campo `focus` ausente mantém forças selecionáveis.
- O gate completo e a revisão final ficam com o agente principal após integrar a correção de histórico feita no hunk separado. Nenhum commit, staging, push ou alteração do PR foi feito por este subagente.

### Revisão final e gate — 2026-10-07

- Commit de implementação `96fe38b`, revisado independentemente por dois subagentes GPT-6.1-sol high: Standards **0 achados**, Spec **0 achados**. A raiz confirmou o Foco corrente no hit-test, o fallback de cenas antigas e a preservação dos dois escopos e dos campos de edição.
- Gate completo: `npm.cmd test -- --maxWorkers=2` — **34 arquivos, 1322 testes aprovados, nenhum skip**; `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` — exit 0.
- `git diff --check` limpo; produção sem mutações residuais. `Stage: done` e a linha CLEAN-35 no ledger são gravados juntos. As revisões humanas existentes de PHY-68 e PHY-76 permanecem pendentes no PR #17.
