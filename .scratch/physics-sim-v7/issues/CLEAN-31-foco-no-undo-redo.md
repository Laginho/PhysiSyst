# CLEAN-31: Foco atual ao desfazer/refazer uma edição física
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - src/App.tsx (restauração dos snapshots em Undo/Redo)
  - src/App.test.ts (costuras existentes de DOM e persistência)

#### What to build

A revisão do PHY-78 encontrou que o histórico de edição física guarda Scene inteira e restaura um focus antigo. Em 2026-10-07 o humano aprovou o recorte: Undo/Redo restaura a edição física e preserva o Foco do documento corrente, tanto `show` quanto `hidden`. Chips e legenda continuam fora do histórico.

Aplicar a preservação somente na restauração em `App.tsx`, antes de passar o documento pelo guard existente de `editDoc`. Não alterar `editor/history.ts`, o modelo de Scene, os bloqueios físicos nem o consumo de histórico. Foco ausente continua ausente, com todos os grupos visíveis; não materializar um padrão nem entregar `focus: undefined` ao codec.

#### Acceptance criteria

1. Cena nova → adicionar bola → desligar momento e esconder `E_c` → Undo: a bola sai, o chão permanece, momento continua desligado e a cena salva mantém `hidden.energy = ['E_c']`; Undo fica desabilitado e Redo habilitado.
2. Editar massa da bola para 5 → Undo para 1 → desligar momento e esconder `E_c` → Redo: massa volta a 5, momento e `E_c` continuam desligados, o autosave mantém o Foco corrente e Redo fica desabilitado.
3. Cena antiga sem Foco mantém os quatro chips ligados e a ausência de `focus` no documento salvo após Undo e Redo, enquanto a adição física é removida/restaurada.
4. Os testes existentes de chips/legenda fora do histórico e de recusa de Undo/Redo estrutural durante playback continuam verdes; não consumir histórico quando `editDoc` recusa a restauração.

#### Verification

    npm.cmd test -- src/App.test.ts -t 'CLEAN-31|scene focus chips|clickable graph legend|undo/redo|PHY-39|PHY-78|PHY-81' --pool=threads --maxWorkers=1
    npm test && npm run lint && npm run typecheck && npm run build

## Comments

- 2026-10-04 — Aberto pelo stage 3 do PHY-78; requisito fora dos critérios daquele ticket, sem usá-lo como achado de reabertura.
- Reprodução confirmada no DOM com o simulador falso existente: cena nova → adicionar um corpo → desligar momento → desfazer a adição. O corpo desaparece e momento volta a ligado. Sondagem temporária: `expected 'true' to be 'false'` na expectativa de que o chip continuasse desligado; arquivo restaurado sem novo teste persistido.
- Causa examinada em `src/App.tsx:847` e `:1363-1373`: pushHistory guarda o documento inteiro, undo/redo passam step.entry inteiro a editDoc. O chip fora do histórico não impede snapshots físicos anteriores de conter focus antigo. `src/editor/history.ts` é genérico e não conhece Foco.
- O critério 11 do PHY-78 só exige histórico vazio depois de cliques em chips numa cena nova e preservação de playback; não define o consumo de um histórico físico já existente. Estender isso também afeta focus.hidden usado pela legenda do PHY-81 e precisa de teste no DOM com histórico real.
- Arquivos/costura a examinar no stage 1: App.tsx (undo/redo e documento corrente), App.test.ts (fluxos físicos + chips); evitar alterar o histórico genérico sem benefício concreto. Nenhum desses caminhos foi modificado nesta revisão.

#### Implementação autorizada e mutate-verify (2026-10-07)

- O humano aprovou a correção limitada ao App durante a revisão do PR #17, incluindo as costuras de DOM e save/load existentes. Dois ciclos separados: primeiro o teste de Undo contra a produção anterior falhou no chip de momento (`expected 'true' to be 'false'`); depois o teste de Redo falhou com a mesma saída antes de conectar Redo à restauração corrigida. Cada implementação mínima ficou verde antes da próxima fatia.
- `restoreHistoryEntry` copia o snapshot físico, conserva o Foco do documento corrente (ou remove a chave se ausente) e chama `editDoc`. A troca de histórico continua acontecendo somente depois da autorização do guard. O histórico genérico e os demais caminhos físicos não foram alterados.
- Evidência por teste novo, todas as mutações temporárias em produção restauradas com `finally`, somente nos hunks desta correção:

| Teste em `src/App.test.ts` | Mutação de produção | Saída vermelha observada |
| --- | --- | --- |
| `CLEAN-31 preserves current groups and hidden graph curves when undoing a body addition` | Ler `entry.focus` em vez de `docRef.current.focus` na restauração | Chip de momento: `expected 'true' to be 'false'`; lote com Undo e Redo: **2 failed, 230 skipped**. |
| Mesmo teste de Undo, preservação de curvas | Preservar somente `{ show: focus.show }`, descartando `hidden` | Save/load: `expected { show: [ 'forces', 'energy' ] } to deeply equal { show: [ 'forces', 'energy' ], …(1) }`; diff vermelho mostra ausência de `hidden.energy = ['E_c']`; lote: **2 failed, 230 skipped**. |
| `CLEAN-31 preserves current groups and hidden graph curves when redoing a mass edit` | Ler `entry.focus` em vez do Foco corrente | Chip de momento: `expected 'true' to be 'false'`; mesmo lote de **2 failed, 230 skipped**. |
| Mesmo teste de Redo, preservação de curvas | Preservar somente `{ show: focus.show }` | Botão `E_c`: `expected 'true' to be 'false'`; mesmo lote de **2 failed, 230 skipped**. |
| `CLEAN-31 keeps legacy scenes without focus showing all groups through undo and redo` | Substituir a remoção da chave ausente por `next.focus = { show: [...FOCUS_GROUPS] }` | Save/load: `expected { version: 1, …(5) } to not have property "focus"`; recebido o objeto explícito com os quatro grupos; **1 failed, 232 skipped**. |

- O teste de limite legado conserva um comportamento existente e foi conferido vermelho com a mutação antes da execução verde. Não testa helper privado nem detalhes de tipo; observa chips, documento salvo e adição/remoção do corpo pela interface pública.
- Verificação focada acima, com a produção restaurada: **1 file passed; 55 passed, 178 skipped (233)**, exit 0. Os três testes novos, os casos existentes de foco/legenda e os bloqueios de histórico selecionados passaram. `git diff --check` sem erros.
- Gate completo e revisão final pertencem à sessão raiz, depois da integração das duas correções do PR #17. Stage permanece `to-review` até essa validação.

#### Revisão final e gate (2026-10-07)

- Commit de implementação `96fe38b`, revisado independentemente por dois subagentes GPT-6.1-sol high: Standards **0 achados**, Spec **0 achados**. A revisão da raiz confirmou preservação de `show`/`hidden`, ausência de Foco legado e o guard físico existente.
- Gate completo na raiz: `npm.cmd test -- --maxWorkers=2` — **34 arquivos, 1322 testes aprovados, nenhum skip**; `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` — exit 0.
- `git diff --check` limpo; somente as duas correções autorizadas e seus testes/registros. `Stage: done` e a linha CLEAN-31 no ledger são gravados juntos. O PR #17 continua sujeito às revisões humanas existentes de PHY-68 e PHY-76.
