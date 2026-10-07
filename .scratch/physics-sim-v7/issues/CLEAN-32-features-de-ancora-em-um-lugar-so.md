# CLEAN-32: Features de âncora em um lugar só
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

#### What to build

A revisão Standards do PHY-83 encontrou uma duplicação entre a definição de features em anchorSnap e seu reconhecimento em toolAnchorAt. Este é um ponto de manutenção para triagem; não há falha de comportamento demonstrada nem contrato de refatoração aprovado.

Sem Primary files ou critérios aprovados. Stage blocked até o stage 1 avaliar o benefício e publicar um recorte.

## Comments

- 2026-10-04 — Aberto pela Stage 3 do PHY-83 como follow-up, sem reabrir o ticket.
- Inspeção de `src/App.tsx:1555–1564` e `src/editor/anchorSnap.ts:12–24`: ambos calculam centro por média dos vértices, vértices e pontos médios. O App reconhece uma saída do anchorSnap como feature, inclusive um clique exato, para preservar a prioridade sobre orientação.
- Risco: uma futura mudança nas features pode atualizar um lado e deixar o outro para trás. O PHY-83 exigia consumir anchorSnap sem alteração; a duplicação atual é coerente e seus testes passaram.
- Costura a examinar: resultado de anchorSnap ou origem compartilhada de candidatos, App e testes de prioridade em círculo/retângulo/triângulo. Escolher a interface e o recorte na Stage 1; não adicionar abstração sem benefício concreto.
