# CLEAN-20: ADR-0004 e comentários descrevem o aro e a direção guardada da polia
Stage: done
Status: ready-for-agent
Blocked by: PHY-45
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md`
  - `src/sim/simulator.ts` (somente comentários de `buildWorld`, no laço de polias, e da guarda de `pullPieces`; nenhuma alteração de comportamento)

#### What to build

O ADR-0004 e os comentários do simulador descrevem o mecanismo entregue pelo PHY-45. Hoje o ADR ainda afirma que polias atravessam corpos e que `mass` ausente ou 0 não constrói nada; os comentários também confundem a nova guarda matricial com o retorno sem tensão do caminho escalar. Atualizar esses registros depois que o PHY-45 resolver a continuidade na troca de direção, sem redesenhar o mecanismo ou alterar a física.

#### Acceptance criteria

1. O ADR-0004 descreve o collider do aro em toda polia, ideal ou com massa: bola de raio `R` no suporte e na âncora da polia, massa/atrito/restituição zero, regras de combinação Min. Distingue o aro dos colliders de massa que continuam no grupo 0; não afirma que a polia atravessa corpos ou que a polia ideal não constrói collider. Registra que o suporte não colide com o próprio aro e que a polia móvel pode colidir com outros corpos.
2. O ADR descreve a guarda de `pullPieces` quando `ropeInvMass(row.pulls, row.along) <= 0` e a direção guardada por polia em `RopeBinding`, atualizada nas poses reais e apenas consultada nas previsões. A descrição da troca de direção corresponde à implementação final aprovada do PHY-45. Distingue o caminho de desenho `scenePath`, que continua sem guardar direção.
3. O comentário de `buildWorld` não diz que massa 0 não constrói nada; o comentário da guarda de `pullPieces` não afirma que o ramo escalar `k <= 0` faz a mesma troca, pois ele zera a tensão e retorna. Os comentários explicam o comportamento final sem mudar código executável.
4. Nenhuma alteração de comportamento, API, testes ou tolerâncias; gate verde.

#### Verification

    git diff -- src/sim/simulator.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: documentação e comentários, sem mudança de comportamento. Conferir as afirmações contra a produção aprovada do PHY-45 e executar a suíte existente.

## Comments

- 2026-10-01 Aberto pela revisão do PHY-45. Quality gate §5 do Engineering Workflow exige documentação correta; o ADR fica fora dos Primary files do PHY-45, portanto o acompanhamento fica neste ticket. Os dois comentários poderiam ser pequenos fixes de revisão, mas seguem aqui com a documentação enquanto o PHY-45 volta à implementação pelo critério 2. Bloqueado pelo PHY-45 para registrar o mecanismo final após a correção de continuidade.
- 2026-10-01 Estágio 2: nenhum teste (documentação e comentários). ADR e comentários conferidos contra `buildWorld`, `ropeFrame`/`ropePath` (`keep`) e `pullPieces` na branch `clean-20`; diff de `simulator.ts` só em comentários. Gate verde: 30 arquivos, 768 testes, lint, typecheck e build.

#### Resolution (2026-10-01)

Verdict: Approve

Revisão completa em sub-agentes independentes nos eixos Standards e Spec, sobre `git diff 4f73aa94c0edadb7f03d771e36d8ae6670bbf799...bdf0c1ab1e5c935ae7662926176f69428e50ffbf`, base `sweatshop/2026-10-01-1211`. Commit examinado: `bdf0c1a`. Dependência PHY-45 concluída na base; nenhuma linha `Proxy decided` neste ticket. Nenhuma correção de produção ou testes feita pela etapa 3.

**Standards:** 0 violações documentadas e 0 smells que justifiquem mudança. Primary files respeitados; comentários e ADR mantêm o vocabulário do domínio. Metadados do ticket seguem o tracker. Nenhuma refatoração ou alteração fora do escopo.

**Spec:** 0 achados; critérios 1–4 atendidos. O ADR distingue o aro de toda polia dos colliders de massa no grupo 0, com propriedades, suporte e colisões da polia móvel corretos. `keep` conserva a direção guardada, é atualizado pelas poses reais e apenas consultado nas previsões; `scenePath` continua sem direção guardada. A guarda matricial troca `along` por `pulls`, enquanto o ramo escalar zera a tensão e retorna. Os dois comentários corrigidos correspondem à produção final do PHY-45.

**Prova de preservação de comportamento:** o diff de `src/sim/simulator.ts` altera somente os dois comentários autorizados. Comparação com `typescript.transpileModule`, removendo comentários, produz JavaScript idêntico ao da base. Nenhuma alteração de API, testes ou tolerâncias. Prova red-green e mutate-verify não se aplicam: o contrato prevê nenhum teste novo por se tratar apenas de documentação e comentários.

**Gate padrão após rebase:** `npm test && npm run lint && npm run typecheck && npm run build` → **30 files passed, 768 tests passed**, duração da suíte 30,23 s; lint, typecheck e build exit 0. Apenas o aviso existente do chunk do simulador acima de 500 kB. `git diff --check` sem problemas.

Rebase sobre a sessão já atualizado, sem conflitos. Branch `clean-20` integrada com `--no-ff`, sem squash, em `9a1445d`. Arquivos revisados: `docs/adr/0004-rope-as-own-constraint-around-world-step.md` e comentários de `src/sim/simulator.ts`. Resolução, linha do ledger e `Stage: done` registrados juntos no commit de fechamento sobre a sessão, conforme o fluxo de sessão.

Totais: Standards 0 achados; Spec 0 achados. Nenhuma pendência deste ticket.
