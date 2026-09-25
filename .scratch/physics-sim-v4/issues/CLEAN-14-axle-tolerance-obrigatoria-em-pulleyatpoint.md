# CLEAN-14: `axleTolerance` obrigatória em `pulleyAtPoint`
Stage: done
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

#### Resolution (2026-09-25)

Verdict: Approve

- Critério 1 ✅: `axleTolerance: number` sem default em `src/editor/hitTest.ts`; `pulleyAtPoint(scene, w)` é erro de tipo. Reproduzido no review: com `hitTest.test.ts` no estado da session branch e `hitTest.ts` novo, `npm run typecheck` dá `TS2554: Expected 3 arguments, but got 2` nas linhas 176, 177, 178, 179 e 184.
- Critério 2 ✅: gate verde na session branch (30 arquivos, 712 testes; lint, typecheck e build limpos).
- Primary files respeitados: o único commit toca `hitTest.ts`, `hitTest.test.ts` e o ticket. Sem teste novo, como o ticket previa (critério 1 é o typecheck).
- Os dois callers de produção (`src/App.tsx` 1193 e 1275) já passavam `AXLE_HIT_RADIUS_PX / camera.pixelsPerMeter`; nenhum outro caller no repo. Docstring de `pulleyAtPoint` já não menciona default.
- Merge: `2b0bd2f` na `sweatshop/2026-09-24-1853`.

## Tests stage 2 writes (own commit, red)

- Nenhum: o critério 1 é o typecheck (nenhum comportamento observável muda). Um commit só.

## Comments

- 2026-09-25 Aberto pelo review do PHY-37 (stage 3): achado fora dos Primary files daquele ticket (`hitTest.test.ts`).
- 2026-09-25 Stage 2: `axleTolerance: number` sem default; os cinco call sites do PHY-28 passam `Infinity`. Prova do critério 1: com só `hitTest.ts` mudado (testes em stash), `npm run typecheck` dá `TS2554: Expected 3 arguments, but got 2` em `hitTest.test.ts` 176, 177, 178, 179 e 184. Gate verde: 30 arquivos, 712 testes; lint, typecheck e build limpos.
