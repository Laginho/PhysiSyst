# CLEAN-21: ADR-0004 descreve o giro integrado da polia com massa
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-49
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (descrição do não deslizamento em Pulleys with mass e consequência sobre o giro do disco)

#### What to build

O ADR descreve a integração própria do giro entregue pelo PHY-49. Hoje o parágrafo de não deslizamento afirma que o giro do disco e a deriva do ponto de encontro passam por `wrapAngle`, e as consequências mantêm uma restrição de giro menor que π por passo. A produção já não lê `disk.rotation()`: o giro vem de ω antes e depois do passo. Atualizar a memória do mecanismo, sem alterar a física.

#### Acceptance criteria

1. O parágrafo de não deslizamento descreve `Δt·(ω₀ + φ·(ω₁ − ω₀))`, com ω₀ capturado em `pullPieces`, ω₁ lido após `world.step()` e antes dos impulsos de correção, e `φ` vindo de `substepFactor`. Previsão e correção usam a mesma integração; Rapier continua dono de ω, mas seu ângulo não mede o giro do grip.
2. A descrição mantém `wrapAngle` somente para a deriva do ponto de encontro no arco e retira a consequência que exige giro do disco menor que π por passo para `gripShares`. Não promete superar o limite de ω do Rapier, acompanhado no PHY-50.
3. Nenhuma mudança de comportamento, código, API, testes ou tolerâncias; gate verde.

#### Verification

    Conferir o texto contra Grip, gripShares, pullPieces e correctPieces em src/sim/simulator.ts.
    git diff -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: documentação apenas. Conferir as afirmações contra a produção aprovada do PHY-49 e executar a suíte existente.

## Comments

- 2026-10-01 Aberto pela revisão Standards do PHY-49. O mecanismo entregue contradiz as descrições antigas do ADR-0004, linhas 34 e 99 na revisão de `01d279a`; atualização exigida pelo Quality gate §5 e por `docs/agents/domain.md` (Flag ADR conflicts). O ADR fica fora dos Primary files e dos critérios numerados do PHY-49, portanto a correção segue separadamente, sem bloquear sua aprovação.
