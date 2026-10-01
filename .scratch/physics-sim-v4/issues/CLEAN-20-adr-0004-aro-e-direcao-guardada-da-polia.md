# CLEAN-20: ADR-0004 e comentários descrevem o aro e a direção guardada da polia
Stage: to-review
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
