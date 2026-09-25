# CLEAN-14: `axleTolerance` obrigatória em `pulleyAtPoint`
Stage: to-implement
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/editor/hitTest.ts` (`pulleyAtPoint`, assinatura)
  - `src/editor/hitTest.test.ts` (os call sites de `pulleyAtPoint` do PHY-28)

#### What to build

O PHY-37 deu a `pulleyAtPoint(scene, w, axleTolerance = Infinity)` um default que preserva o comportamento antigo (disco inteiro sobre o corpo de montagem). O default existe só para os cinco call sites de `src/editor/hitTest.test.ts` não mudarem; os dois callers de produção em `src/App.tsx` passam `AXLE_HIT_RADIUS_PX / camera.pixelsPerMeter`. Um caller futuro que omita o argumento recupera em silêncio o bug que o PHY-37 fechou.

Tornar o parâmetro obrigatório e passar `Infinity` explicitamente nos testes do PHY-28 (que testam o disco, não o eixo). Sem mudança de comportamento.

#### Acceptance criteria

1. `pulleyAtPoint` exige `axleTolerance`; `pulleyAtPoint(scene, w)` é erro de tipo
2. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: o critério 1 é o typecheck (nenhum comportamento observável muda). Um commit só.

## Comments

- 2026-09-25 Aberto pelo review do PHY-37 (stage 3): achado fora dos Primary files daquele ticket (`hitTest.test.ts`).
