# CLEAN-29: testes para as três regras do CLEAN-25 que nenhum critério cobre
Stage: blocked
Status: needs-triage
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

(A definir pelo stage 1. Este arquivo ainda não autoriza implementação.)

#### Acceptance criteria

(A definir pelo stage 1.)

#### Verification

(A definir pelo stage 1.)

## Tests stage 2 writes (own commit, red)

(A definir pelo stage 1.)

## Comments

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir da recomendação 6 do relatório `docs/relatorios/2026-10-02-sweatshop-sonnet-5.5-opus-5.5-2`. A revisão do CLEAN-25 (merge `6f5cdf1`) aprovou todos os critérios, mas registrou três regras do ticket que estão implementadas em `src/scene/ropePath.ts` e que nenhum critério testa: (1) uma polia solta sozinha fica no meio da perna (`t = 1/2`); (2) o espaçamento `t = k/(n + 1)` vale também entre duas polias em que a corda ainda está presa; (3) o `arcs[i].start` de uma polia solta não muda (decisão do proxy de 2026-10-02 no CLEAN-25). Nada foi commitado além deste ticket. Como são testes de comportamento que já existe, o vermelho vem por mutação, não antes do código; cabe ao stage 1 nomear as mutações e o bloco de testes.
