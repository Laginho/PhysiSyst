# CLEAN-31: Foco atual ao desfazer/refazer uma edição física
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

#### What to build

A revisão do PHY-78 encontrou um comportamento que os critérios numerados daquele ticket não definem: o histórico de edição física guarda Scene inteira e pode restaurar um focus antigo. O stage 1 precisa decidir/publicar o contrato de preservação do Foco em undo/redo antes de implementar este ticket.

Não há recorte aprovado nem critérios de aceitação publicados. Stage blocked até a triagem e especificação; não despachar implementação a partir desta observação.

## Comments

- 2026-10-04 — Aberto pelo stage 3 do PHY-78; requisito fora dos critérios daquele ticket, sem usá-lo como achado de reabertura.
- Reprodução confirmada no DOM com o simulador falso existente: cena nova → adicionar um corpo → desligar momento → desfazer a adição. O corpo desaparece e momento volta a ligado. Sondagem temporária: `expected 'true' to be 'false'` na expectativa de que o chip continuasse desligado; arquivo restaurado sem novo teste persistido.
- Causa examinada em `src/App.tsx:847` e `:1363-1373`: pushHistory guarda o documento inteiro, undo/redo passam step.entry inteiro a editDoc. O chip fora do histórico não impede snapshots físicos anteriores de conter focus antigo. `src/editor/history.ts` é genérico e não conhece Foco.
- O critério 11 do PHY-78 só exige histórico vazio depois de cliques em chips numa cena nova e preservação de playback; não define o consumo de um histórico físico já existente. Estender isso também afeta focus.hidden usado pela legenda do PHY-81 e precisa de teste no DOM com histórico real.
- Arquivos/costura a examinar no stage 1: App.tsx (undo/redo e documento corrente), App.test.ts (fluxos físicos + chips); evitar alterar o histórico genérico sem benefício concreto. Nenhum desses caminhos foi modificado nesta revisão.
