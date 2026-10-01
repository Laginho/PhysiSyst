# CLEAN-21: ADR-0004 descreve o giro integrado da polia com massa
Stage: done
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
- 2026-10-01 Stage 2: documentação apenas, sem commit de teste (o ticket não nomeia nenhum). Linhas 34 e 99 do ADR reescritas contra `Grip.w0`, `gripShares`, `pullPieces`, `correctPieces` e `substepFactor` em `src/sim/simulator.ts`. Gate verde: 793 testes, lint, typecheck, build.

#### Resolution (2026-10-01)

Verdict: Approve

Revisão em sub-agentes independentes nos eixos Standards e Spec, sobre `git diff 597692244f89e8c1f8fc6dd3096b27465d99f7a5...980278ea4011cc1f9e69515d25c9772ac6310aa5`, base `sweatshop/2026-10-01-1211`. Dependência PHY-49 concluída. Nenhuma correção feita pela etapa 3 e nenhuma linha `Proxy decided` neste ticket.

**Standards:** 0 violações documentadas e 0 smells heurísticos. O ADR passa a registrar o mecanismo entregue no PHY-49, atendendo ao Quality gate §5 e à regra Flag ADR conflicts de `docs/agents/domain.md`. O vocabulário segue `CONTEXT.md`; grip, piece e share permanecem termos internos do mecanismo.

**Spec:** 0 achados; critérios 1–3 atendidos. A fórmula `Δt·(ω₀ + φ·(ω₁ − ω₀))`, a captura de `w0` em `pullPieces`, a leitura de ω₁ após `world.step()` e antes dos impulsos em `correctPieces`, e a origem de φ em `substepFactor` conferem com a produção. Previsão e correção usam a mesma integração, respectivamente com ω₁ extrapolado do torque e medido no disco. `wrapAngle` permanece apenas na deriva do encontro; a restrição de giro do disco menor que π foi retirada e o limite de ω do Rapier continua explicitamente acompanhado no PHY-50. O diff inteiro altera somente os dois trechos previstos do ADR e os metadados do ticket; comportamento, código, API, testes e tolerâncias preservados.

**Verificação:** texto conferido contra `Grip`, `gripShares`, `pullPieces`, `correctPieces`, `substepFactor` e a ordem de `step()` em `src/sim/simulator.ts`; `git diff --check` limpo. Prova red-green e mutate-verify não se aplicam: este ticket é exclusivamente documental e não acrescenta nem altera testes.

**Gate executado pelo reviewer:** `npm test && npm run lint && npm run typecheck && npm run build` → **30 files passed, 793 tests passed**, suíte em 30,11 s; lint, typecheck e build exit 0. Apenas o aviso existente do chunk tardio do simulador acima de 500 kB. Sem alteração de flags, timeouts ou tolerâncias.

Rebase sobre a sessão já atualizado, sem conflitos, mantendo `980278e` e a árvore validada. Branch `clean-21` integrada com `--no-ff`, sem squash, em `6f3e9d6`; a árvore após o merge é idêntica à validada (`ddbf075de0090b0cd22bfb3b80efe90915ca6c49`). Resolução, linha do ledger e `Stage: done` registrados juntos no commit de fechamento sobre a sessão. O limite de ω continua no PHY-50.

Totais: Standards 0 achados; Spec 0 achados.
