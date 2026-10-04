# PHY-83: Snap de orientação de mola e corda
Stage: done
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

### Stage 2 — red/green e mutate-verify (2026-10-04)

- Commits de testes separados da produção: `bb95c1d` (módulo ausente), `07be3f5` (`bodyOrientationSnap is not a function`: 11 failed / 8 passed), `685cb3f` (DOM arrasto: 2 failed / 1 passed / 217 skipped) e `58a83fb` (DOM ferramentas: 4 failed / 5 passed / 217 skipped). Todos executados antes da implementação correspondente.
- Green focado: módulo puro, 19 passed; `App.test.ts -t 'orientation snap'`, 9 passed / 217 skipped. Os testes existentes não foram alterados.
- O canvas também traceja contornos de corpos fixos em coordenadas locais (`[6/ppm, 4/ppm]`). O harness observa a guia de orientação (`#999`, 1 px) para não confundir esse desenho existente com os critérios 4/5/7.
- `anchorSnap` retorna somente coordenadas locais, sem flag de feature. No App, a saída é reconhecida como centro/face/vértice antes da orientação; isso preserva inclusive cliques exatamente sobre uma feature, que uma comparação com o clique cru deixaria passar. O módulo de âncora foi consumido sem alteração.

Cada mutação abaixo foi aplicada temporariamente a **src/App.tsx**, executada com `npm test -- src/App.test.ts -t <nome>` (via CLI do Vitest nas mutações), produziu exit 1 por assertion e foi restaurada antes da próxima. Nome = trecho identificador do teste novo.

| Teste novo | Mutação de produção | Saída vermelha observada |
| --- | --- | --- |
| `snaps a pendulum drag exactly` | Ignorar `bodyOrientationSnap` no ramo move | `1 failed / 225 skipped`; `expected { x: 6.08, y: 5 } to deeply equal { x: 6, y: 5 }` |
| `draws the vertical guide` | Desabilitar `if (opts?.guide)` em paint | `1 failed / 225 skipped`; `expected [] to deep equally contain [ 6, 4 ]` |
| `gives contact snap priority` | Aplicar orientação mesmo com `neighborId` não nulo | `1 failed / 225 skipped`; `expected { x: 6, y: 0.6 } to deeply equal { x: 6, y: 0.5 }` |
| `aligns the spring tool second end` | Clique usa apenas `anchorSnap`, ignorando orientação | `2 failed / 224 skipped` junto com rope; `expected 0.2666666666666666 to be 0.2` |
| `aligns the rope tool second end` | Mesma mutação do clique acima | Mesma execução: ambos os testes identificados como `FAIL`, mesma assertion |
| `gives anchor features priority at 0.08333333333333333` | Remover guard de features em `toolAnchorAt` | `2 failed / 224 skipped` junto com centro exato; `expected [ [ 6, 4 ] ] to deeply equal []` |
| `gives anchor features priority at 0` | Mesma mutação do guard acima | Mesma execução: ambos os offsets identificados como `FAIL`, mesma assertion |
| `previews the horizontal guide` | Hover devolve sempre `guide = null` | `1 failed / 225 skipped`; `expected [] to deep equally contain [ 6, 4 ]` |
| `does not orient a rope routed` | Remover exclusão `tool.via.length > 0` | `1 failed / 225 skipped`; `expected [ [ 6, 4 ] ] to deeply equal []` |

Limpeza da guia também verificada por mutação: remover `dragRef.current = null` tornou `draws the vertical guide` vermelho (1 failed); remover `toolGuideRef.current = null` tornou os dois testes `aligns ... tool` e `previews ...` vermelhos (3 failed). Todos: `expected [ [ 6, 4 ] ] to deeply equal []`.

No módulo puro, mutações detectadas: inverter sinal de delta vertical/horizontal; duplicar tolerância; remover exclusão de segmento curto; inverter escolha do menor afastamento; excluir fronteira da tolerância; usar pose antiga; ignorar âncoras locais; incluir corda com polia; mover corpo no retorno sem candidato; e fazer o último candidato vencer. Todas produziram assertions vermelhas; todos os 19 casos novos aparecem entre os testes que falharam nessas execuções. Produção restaurada em `finally` em todas as mutações.

### Stage 2 — handoff (2026-10-04)

- Implementado: tolerância perpendicular de 10 px; segmentos curtos excluídos; escolha do menor afastamento; corpo na pose proposta com âncoras locais; mola/corda sem polia; prioridade do contato no arrasto e de features no clique/hover; guia cinza de 1 px, tracejado [6, 4], de borda a borda; limpeza ao sair da tolerância, soltar, concluir ou cancelar ferramenta. Um undo por arrasto preservado. CONTEXT.md atualizado.
- Gate completo: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0. Vitest: **34 files passed, 1315 tests passed**, duração 78.66 s. ESLint e TypeScript sem erros; Vite: 53 módulos, build concluído. Aviso de chunk >500 kB emitido para bundles existentes, sem alteração no motor.
- Ambiente: primeira execução no sandbox terminou com 29 falhas de Chromium (`Chromium disconnected` / `failed to connect to Chromium DevTools`), 1286 testes verdes. O sandbox também recusou criação de processos com erro 1909. A repetição fora do sandbox passou todos os 1315 testes, inclusive Chromium.
- Diff final revisado contra `sweatshop/2026-10-04-1243`: somente Primary files e ticket; nenhum teste existente alterado, nenhuma mudança de produção em commits de testes e nenhum teste em commits de produção. `contactSnap.ts`, `anchorSnap.ts` e motor permanecem sem alterações. `git diff --check` passou. Sem bloqueio de validação pendente.
- Etapa 2 encerrada em `to-review`; revisão/merge pertencem à próxima sessão.

#### Resolution (2026-10-04)

Verdict: Approve

Critérios 1–8 aprovados na revisão completa de `0ee2c04...b29744f`. Integração na sessão `sweatshop/2026-10-04-1243`, sem squash, pelo merge `9c22144`. Rebase sem alteração: a branch já estava atualizada sobre `0ee2c04`. Nenhuma correção de produção ou de testes foi necessária na Stage 3.

**Standards**

0 violações obrigatórias; 1 observação de manutenção. Possível Duplicated Code: `toolAnchorAt` (`src/App.tsx:1555–1564`) reconstitui as features de `src/editor/anchorSnap.ts:12–24` com `const vertices = localVertices(hit)`, centro por `reduce` e pontos médios por `map`. As duas definições podem divergir em uma alteração futura. Compartilhar o resultado/candidatos exigiria alterar `anchorSnap.ts`, que este contrato manda consumir sem alteração; registrado em CLEAN-32, sem reabrir PHY-83.

Diff limitado aos Primary files e ao ticket. Os quatro commits de testes precedem a fatia correspondente de produção; nenhum commit de produção toca testes. As assertions existentes foram preservadas. Todos os nove casos novos de DOM possuem registro de mutação e saída vermelha, reproduzidos nesta revisão. CONTEXT.md corresponde à entrada aprovada.

**Spec**

0 violações obrigatórias; 2 observações fora dos casos numerados. Hover/click de corda: `onPointerMove` verifica corpos, enquanto `onToolClick` prioriza `pulleyAtPoint`; um eixo de polia sobre um corpo grande, fora das features de âncora, pode receber uma prévia de orientação embora o clique acrescente a polia. O roteamento existente continua correto; CLEAN-33 registra a investigação. Edição bloqueada: `drag.guide` é atribuída dentro do callback antes de `editDoc` recusar a mudança estrutural; um repaint posterior pode mostrar a guia sem mover o documento. O bloqueio de edição continua efetivo; CLEAN-34 registra a investigação. Ambas são observações de inspeção estática, sem alterar os critérios ou acrescentar testes persistidos.

Chamadores e interações examinados: `snapOrientation` em `bodyOrientationSnap` e `toolAnchorAt`; clique/hover de mola, corda e polia; move/rotate/resize/alpha/forceAnchor; `paint/repaint`; undo no pointerup; cancelamento/conclusão/troca de ferramenta e cena; prioridades de contato e features; poses locais rotacionadas, pontas A/B, constraints concorrentes, escala do canvas e Foco/playback. Caminhos de falha: ausência de constraints ou corpo parceiro, mesmo corpo, segmento curto/coincidente, vínculo fora da tolerância, corda via polia e recusas do editor. Nenhum chamador alterado relevante ficou sem inspeção. Não houve passe visual manual dedicado em navegador; as novas guias foram verificadas no DOM/canvas, e os testes existentes de Chromium passaram no gate.

A linha `Proxy decided` de 2026-10-04 foi revisada: corrige somente o exemplo conflitante do critério 1 para `(0.16, 0.12)`, mantendo a exclusão de segmentos curtos. Comprimento 12 px, afastamentos 9,6/7,2 px; escolha horizontal correta. Nenhuma nova decisão de proxy nesta revisão.

| Critério | Resultado |
| --- | --- |
| 1 | ✅ Tolerância 10 px, segmentos curtos excluídos e menor afastamento; exemplos e fronteira cobertos. |
| 2 | ✅ Pose proposta e âncoras locais, pêndulo/mola, A/B, corda via polia excluída e retorno sem candidato preservado. |
| 3 | ✅ Pêndulo em x=6; fora da tolerância x=6,3; um undo por arrasto. |
| 4 | ✅ Contato mantém bloco em y=0,5 e declara o par no drop; sem guia de orientação. |
| 5 | ✅ Guia vertical de (450,0) a (450,600), cinza 1 px e [6,4]; limpa fora da tolerância e após pointerup/repaint. |
| 6 | ✅ Mola com âncora mundo y=0,2; feature a 5 px e clique exato vencem; corda sem polia também coberta. |
| 7 | ✅ Hover a 4 px mostra guia horizontal de (0,528) a (900,528); a 30 px e após Esc/repaint não mostra. |
| 8 | ✅ Testes anteriores de contato, âncora, arrasto e ferramentas verdes, sem alterar suas assertions. |

**Prova vermelha/verde reproduzida nesta revisão**

Os 20 grupos de mutações registrados na Stage 2 foram reaplicados sequencialmente. Cada execução saiu com código 1 por assertions esperadas. Os dois arquivos de produção foram restaurados byte a byte em `finally` após cada execução; nenhum teste foi alterado.

| Mutação no App / teste(s) | Vermelho observado |
| --- | --- |
| Ignorar orientação no move / `snaps a pendulum drag exactly` | 1 failed, 225 skipped; `expected { x: 6.08, y: 5 } to deeply equal { x: 6, y: 5 }`. |
| Desabilitar guia em paint / `draws the vertical guide` | 1 failed, 225 skipped; `expected [] to deep equally contain [ 6, 4 ]`. |
| Remover prioridade do contato / `gives contact snap priority` | 1 failed, 225 skipped; `expected { x: 6, y: 0.6 } to deeply equal { x: 6, y: 0.5 }`. |
| Clique usa apenas anchorSnap / `aligns the spring tool` e `aligns the rope tool` | 2 failed, 224 skipped; ambos: `expected 0.2666666666666666 to be 0.2`. |
| Remover guard de features / `gives anchor features priority`, offsets 5/60 e 0 | 2 failed, 224 skipped; ambos: `expected [ [ 6, 4 ] ] to deeply equal []`. |
| Hover com guide=null / `previews the horizontal guide` | 1 failed, 225 skipped; `expected [] to deep equally contain [ 6, 4 ]`. |
| Incluir corda via polia / `does not orient a rope routed` | 1 failed, 225 skipped; `expected [ [ 6, 4 ] ] to deeply equal []`. |
| Não limpar dragRef no release / `draws the vertical guide` | 1 failed, 225 skipped; guia continua após pointerup. |
| Não limpar toolGuideRef / dois `aligns ... tool` e `previews ...` | 3 failed, 223 skipped; guia continua após conclusão/Esc. |

Nos 11 grupos do módulo puro, sempre sobre seus 19 casos: sinal vertical invertido **4 failed / 15 passed**; sinal horizontal **5/14**; tolerância duplicada **4/15**; segmentos curtos incluídos **3/16**; escolha do menor afastamento invertida **5/14**; fronteira excluída **1/18**; pose antiga **2/17**; âncoras locais ignoradas **2/17**; corda via polia incluída **1/18**; corpo sem candidato deslocado **6/13**; último candidato vence **1/18**. Cada um dos 19 casos puros falhou em pelo menos uma dessas mutações. Os nove casos DOM também ficaram vermelhos com as mutações listadas.

**Gate e fechamento**

Antes da revisão: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0; **34 files passed, 1315 tests passed**, 85.76 s. Após as mutações/restauração e o rebase: o mesmo gate, exit 0; **34 files passed, 1315 tests passed**, 80.52 s. ESLint e TypeScript sem erros; Vite construiu 53 módulos. Aviso não bloqueante de chunks maiores que 500 kB; simulador/Rapier permanece no bundle separado existente. Execuções fora do sandbox devido ao erro de logon Windows 1909.

Arquivos revistos: `src/editor/orientationSnap.ts`, `src/editor/orientationSnap.test.ts`, `src/App.tsx`, `src/App.test.ts`, `CONTEXT.md` e este ticket; `anchorSnap.ts` e `contactSnap.ts` somente consumidos. Revisão final do diff e `git diff --check` verdes; sem mutação residual, logs acidentais, segredos ou artefatos gerados incluídos. Fechamento inclui ledger e CLEAN-32/33/34 como needs-triage, sem implementar seus escopos.

Padrões: 0 violações, 1 follow-up; especificação: 0 violações, 2 follow-ups. `Stage: done`; ledger aponta para `9c22144`. A sessão fica responsável pelo push/PR do lote.
