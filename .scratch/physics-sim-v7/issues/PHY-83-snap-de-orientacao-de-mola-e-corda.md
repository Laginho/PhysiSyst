# PHY-83: Snap de orientação de mola e corda
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - New: src/editor/orientationSnap.ts
  - New: src/editor/orientationSnap.test.ts
  - src/editor/contactSnap.ts (`CONTACT_SNAP_TOLERANCE_PX` :3, modelo; consumido sem alterar)
  - src/editor/anchorSnap.ts (`anchorSnap` :31, consumido sem alterar)
  - src/App.tsx (`paint` :186-292 ganha `opts.guide`; `dragRef` :844-850 ramo `move`; `onToolClick` :1441-1466; `onPointerMove` :1545-1605; `onPointerUp` :1607-1625)
  - src/App.test.ts
  - CONTEXT.md (entrada nova **Orientation snap**, ao lado de Contact snap e Anchor snap)

#### What to build

O encaixe em contato alinha um corpo a uma superfície e o de âncora puxa um ponto para uma feature do corpo; nenhum deixa uma mola ou corda exatamente na vertical ou na horizontal. Este ticket acrescenta o terceiro da família, sem tocar no motor e sem ser snap de grade.

**Módulo puro** `src/editor/orientationSnap.ts`:

    export const ORIENTATION_SNAP_TOLERANCE_PX = 10
    export type Axis = 'vertical' | 'horizontal'
    export interface OrientationSnap { axis: Axis; through: Vec2; delta: Vec2 }
    /** Desloca `moving` para a vertical ou horizontal que passa por `other`, se estiver a até a tolerância (px de tela) dela. */
    export function snapOrientation(moving: Vec2, other: Vec2, pixelsPerMeter: number): OrientationSnap | null
    /** O corpo proposto deslocado para alinhar um segmento de mola ou corda sem polia que o liga a outro corpo. */
    export function bodyOrientationSnap(doc: Scene, proposed: Body, pixelsPerMeter: number): { body: Body; guide: OrientationSnap | null }

`snapOrientation`: `dx = moving.x − other.x`, `dy = moving.y − other.y`, tolerância `tol = 10 / ppm`. Segmento de comprimento ≤ `tol` → `null`. `|dx| ≤ tol` → vertical, `delta = (−dx, 0)`; `|dy| ≤ tol` → horizontal, `delta = (0, −dy)`; o menor afastamento vence quando os dois cabem. `through` é `other`. `bodyOrientationSnap` percorre `doc.constraints`: molas e cordas com `via: []` que tenham uma ponta em `proposed.id` e a outra em outro corpo; calcula as âncoras no mundo (`bodyPointToWorld`, com a do corpo proposto na pose proposta), chama `snapOrientation(minha, outra, ppm)` e aplica à `position` do corpo o `delta` do segmento de menor afastamento; sem candidato, devolve o corpo como veio e `guide: null`. Cordas com polia ficam fora.

**No App.** No ramo `move` de `onPointerMove`, depois de `resolveContactSnap`: se o encaixe em contato disparou (`neighborId` não nulo), o de orientação não se aplica; senão, `bodyOrientationSnap(d, snapped, ppm)` dá o corpo final e a guia, guardada em `dragRef.current.guide`. Em `onToolClick`, na segunda ponta de uma mola ou de uma corda sem polia (`tool.a` fixado e `tool.via` vazio), o encaixe de âncora vence: só quando `anchorSnap` não pegou feature (devolveu o próprio ponto) o ponto clicado passa por `snapOrientation(ponto, bodyPointToWorld(corpoDeA, tool.a.anchor), ppm)` antes de virar âncora local. Com a ferramenta armada e `tool.a` fixado, `onPointerMove` sem arrasto calcula a mesma coisa para o ponto sob o ponteiro e guarda a guia em `toolGuideRef` (repintando quando muda).

**Guia.** `paint` recebe `opts.guide: OrientationSnap | null` e, quando há, desenha uma linha tracejada (`setLineDash([6, 4])`, cor `#999`, 1 px) ao longo do eixo passando por `through`, de borda a borda do canvas. Some no `pointerup`, ao soltar fora da tolerância, ao cancelar a ferramenta (Esc) ou ao concluí-la.

**CONTEXT.md.** Entrada **Orientation snap**: "The editing behavior that, while a body is dragged or a constraint anchor is placed, moves it so a spring or rope segment that is nearly vertical or nearly horizontal to its other end becomes exactly so, within a screen tolerance, showing a dashed guide. Contact snap and anchor snap take precedence. _Avoid_: grid snap, angle snap."

#### Acceptance criteria

1. `snapOrientation` com `ppm = 60`, `other = (0, 0)`: `moving = (0.05, 2)` → `{ axis: 'vertical', through: (0, 0), delta: (−0.05, 0) }`; `moving = (2, −0.1)` → horizontal, `delta: (0, 0.1)`; `moving = (0.3, 2)` (18 px de afastamento) → `null`; `moving = (0.1, 0.12)` (comprimento ≈ 9,4 px) → `null`; `moving = (0.16, 0.12)` (comprimento 12 px; `|dx|` 9,6 px e `|dy|` 7,2 px cabem os dois) → horizontal, `delta: (0, −0.12)` (menor afastamento vence).
2. `bodyOrientationSnap`: pêndulo com `pivo` fixo em (6, 7) e `bola` proposta em (6.08, 5), corda `via: []` âncoras CM → `body.position` (6, 5) e `guide` vertical com `through` (6, 7); mola de `parede` (âncora mundo (4.1, 0.2)) a `bloco` com âncora local (−0.2, 0) proposto em (6.1, 0.27) → `body.position.y` 0,2 e guia horizontal; a mesma corda com `via: ['polia']` → corpo inalterado e `guide: null`; corpo sem vínculo → inalterado, `null`.
3. No `App`, arrastar a `bola` de um pêndulo (jsdom, `pointerdown`/`pointermove`/`pointerup` como os testes de arrasto existentes) até o ponteiro corresponder a x = 6,08 deixa `doc.bodies` com `bola.position.x` exatamente 6; até 6,3, fica 6,3. Um único item de undo por arrasto, como hoje.
4. Com o encaixe em contato disparando no mesmo movimento (bloco solto quase no chão perto de uma parede com mola horizontal a uma altura diferente), a posição final é a do encaixe em contato e nenhum `setLineDash` é chamado.
5. Durante o arrasto do critério 3 com o snap ativo, `paint` chama `setLineDash` e desenha uma linha de `(x, 0)` a `(x, altura)` com `x = worldToScreen(6, ·).x`; depois do `pointerup`, repintar não chama `setLineDash`.
6. Ferramenta mola com `tool.a` na parede (âncora mundo (4.1, 0.2)): clicar num retângulo 2 × 2 m num ponto a 4 px acima da horizontal por `a` e a mais de `ANCHOR_SNAP_TOLERANCE_PX` de toda feature do corpo cria a mola com `bodyPointToWorld(bloco, b.anchor).y` igual a 0,2; clicar a 5 px do centro do corpo cria a mola com `b.anchor` = (0, 0) (feature vence).
7. Com a ferramenta armada e `tool.a` fixado, mover o ponteiro (sem botão) até 4 px da horizontal por `a` faz `paint` chamar `setLineDash`; mover a 30 px, não; Esc limpa a guia.
8. Os testes existentes de `contactSnap`, `anchorSnap`, arrasto e ferramenta continuam verdes sem alteração.

#### Verification

    npm test -- src/editor/orientationSnap.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/orientationSnap.test.ts`: critérios 1 e 2 chamando o módulo direto; vermelhos hoje porque o módulo não existe.
- `src/App.test.ts`: critérios 3 a 7 com o simulador falso e o mock de canvas (`setLineDash`, `moveTo`/`lineTo`); vermelhos hoje (nenhum snap, nenhuma guia). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: independente; arrastando um corpo ou âncora, segmento de mola ou corda quase vertical/horizontal em relação à outra ponta trava em 90°/0° com guia tracejada; mesma família do encaixe em contato e de âncora; sem mudança no motor; não é snap de grade.
- Planner: tolerância 10 px como as irmãs, medida como afastamento perpendicular; só molas e cordas sem polia; encaixe em contato vence no arrasto, encaixe de âncora vence no clique da ferramenta; guia também no hover com a ferramenta armada.

- 2026-10-04 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-83-snap-de-orientacao-de-mola-e-corda-asked-20261004-1630`): PHY-83 ficou `blocked`, registrado no commit `fd56c2e`. /  / O critério 1 exige snap horizontal para `(0,1; 0,05)`, mas esse segmento mede **6,71 px** e a regra exige `null` para comprimentos ≤ 10 px. /  / Recomendo trocar o exemplo por **`(0,15; 0,1)`**, que mede 10,82 px. Confirma essa correção? /  / A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) determina: “Only stage 1 does” para alterações nos critérios. O proxy configurado está indisponível neste runtime. Por isso, registrei o bloqueio; código e testes não foram alterados. `git diff --check` passou.
- 2026-10-04 Proxy decided: manter a exclusão dos segmentos curtos (é decisão do spec: "segmentos de comprimento até a tolerância não travam") e corrigir só o exemplo de menor afastamento do critério 1, de `(0.1, 0.05)` para `(0.16, 0.12)` — com `ppm = 60`, `(0.1, 0.05)` mede 6,71 px (≤ 10 px, logo `null`), enquanto `(0.16, 0.12)` mede exatamente 12 px (0,2 m, triângulo 3-4-5), `|dx| = 9,6 px` e `|dy| = 7,2 px` cabem os dois na tolerância e o menor afastamento é o horizontal. A proposta do stage 2, `(0.15, 0.1)`, também satisfaz (10,82 px), mas fica a 0,8 px da borda; `(0.16, 0.12)` está no meio da janela válida (10 px < L ≤ 14,14 px). Nenhum outro critério tem a mesma inconsistência (2, 3, 6, 7 conferidos; 4, 5, 8 sem geometria).
- 2026-10-04 Foreman: começar da sessão; a branch `-asked-20261004-1630` só tem o commit do ticket, nada a retomar.
- 2026-10-04 Stage 2: costuras aprovadas: módulo puro e DOM/canvas do App. Chamadores examinados: `onPointerMove` (move, rotate, resize, alpha, forceAnchor), `onToolClick` (spring, rope, pulley), `repaint` e cancelamento/conclusão/troca de ferramenta. Entradas de fronteira: constraints ausentes, corpo sem vínculo, pontas coincidentes/curtas, tolerância inclusiva em px, âncoras locais rotacionadas, ponta A/B, vários vínculos e cordas com polia. Primeiro red: `npm test -- src/editor/orientationSnap.test.ts` falha por `Cannot find module './orientationSnap'` (1 suite failed).
