# CLEAN-33: Prévia da corda respeita clique em polia
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

#### What to build

A revisão Spec do PHY-83 observou uma possível diferença entre a prévia de orientação no hover da ferramenta Corda e a prioridade do clique sobre um eixo de polia. O roteamento do clique permanece correto. A política da prévia nesse alvo não está nos casos numerados do PHY-83 e precisa de triagem/especificação.

Sem Primary files ou critérios aprovados. Stage blocked até o stage 1 publicar o recorte e a aceitação.

## Comments

- 2026-10-04 — Aberto pela Stage 3 do PHY-83, sem tratar um comportamento fora dos casos numerados como reabertura.
- Inspeção estática: `onPointerMove` (`src/App.tsx:1689–1691`) usa bodyAtPoint/toolAnchorAt; `onToolClick` (:1584–1589) dá prioridade a pulleyAtPoint e acrescenta via antes de considerar uma âncora B.
- Cenário candidato: ferramenta Corda com ponta A fixa; eixo de polia montado num retângulo grande, afastado de centro, faces e vértices, a menos de 10 px do eixo por A. Hover pode mostrar a guia de orientação; clique acrescenta a polia, sem colocar B, e limpa a guia por mudança da ferramenta.
- Não houve reprodução DOM específica desse alvo na revisão. Confirmar o cenário e decidir o feedback esperado na Stage 1; possível costura App.test.ts com polia fora das features. Os testes atuais de corda via polia e criação passaram.
