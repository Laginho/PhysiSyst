# CLEAN-08: Vértices do triângulo por `localVertices` no `simulator` e no `draw`, e nome do teste do overlay
Stage: to-implement
Status: needs-triage
Blocked by: CLEAN-07
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (só o `convexHull` do triângulo em `colliderDescFor`)
  - `src/render/draw.ts` (só o caso `triangle` de `pathBody`)
  - `src/render/overlay.test.ts` (só o nome do teste da linha 82)

#### What to build

O review do CLEAN-07 (2026-09-24) deixou fora do contrato:

1. `localVertices` foi para o `scene`, mas o hull do triângulo em `simulator.colliderDescFor` (`[0, 0, base, 0, base, h]`) e o `pathBody` do `draw.ts` (`moveTo/lineTo/lineTo`) ainda soletram os mesmos três vértices à mão. Uma fonte só: `localVertices(body)`.
2. O teste `overlay.test.ts:82` chama-se "maps anchor through localToWorld …", e `localToWorld` não existe mais; o overlay usa `bodyPointToWorld`.

Nenhum item muda comportamento; a suíte existente prova cada um.

#### Acceptance criteria

1. O hull do triângulo em `simulator.ts` vem de `localVertices(body)`; nenhum vértice literal do triângulo fora do `scene` em `src/` (testes à parte)
2. O caso `triangle` de `pathBody` em `draw.ts` percorre `localVertices(body)`
3. O nome do teste de `overlay.test.ts:82` diz `bodyPointToWorld`
4. `npm test` com os mesmos números de antes; gate verde

#### Verification

    npx vitest run src/sim src/render
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: refactor sem efeito observável.

## Comments

- 2026-09-24 Aberto pelo review do CLEAN-07 (stage 3). Stage 1 confirma o recorte antes de implementar; `needs-triage` até lá.
