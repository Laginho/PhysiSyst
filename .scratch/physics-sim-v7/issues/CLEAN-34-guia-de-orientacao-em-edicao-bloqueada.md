# CLEAN-34: Guia de orientação em edição bloqueada
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

#### What to build

A revisão Spec do PHY-83 observou que uma tentativa de arrasto recusada pelo bloqueio de edição estrutural pode deixar uma guia de orientação disponível para repaint. O bloqueio continua preservando o documento. A política da guia durante essa recusa precisa de triagem/especificação; os critérios do PHY-83 cobrem arrasto editável.

Sem Primary files ou critérios aprovados. Stage blocked até o stage 1 publicar o recorte e a aceitação.

## Comments

- 2026-10-04 — Aberto pela Stage 3 do PHY-83 como follow-up, sem reabrir o ticket.
- Inspeção estática: `editDoc` resolve o callback (:881–890) antes de avaliar canEditDoc. No ramo move, `drag.guide` é atribuída (:1711) dentro desse callback; se a edição estrutural for recusada depois de t=0, a ref ainda guarda a guia.
- `repaint` consome a guia da ref (:997). Um repaint posterior de animação ou Foco pode desenhá-la, embora o corpo/documento não tenha sido movido. Pointerup limpa a ref como antes, e o bloqueio da edição continua efetivo.
- Não houve reprodução DOM específica da guia sob bloqueio na revisão. Confirmar com pêndulo após um passo e repaint antes de pointerup; decidir o feedback na Stage 1. Costuras candidatas: App.tsx (resultado da edição e guia) e App.test.ts (bloqueio estrutural existente).
