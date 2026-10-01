# CLEAN-22: ADR-0004 descreve o contorno do limite de ω no disco da polia
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-50
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (Pulleys with mass e consequência sobre o limite de ω do disco)

#### What to build

O ADR passa a descrever a preservação de ω entregue pelo PHY-50. Hoje a consequência sobre o giro do disco ainda afirma que o limite do Rapier continua sendo o teto da polia e que o mecanismo não o supera. A produção guarda ω antes de `world.step()`, zera a velocidade angular do disco durante a integração do torque e devolve o valor guardado somado ao incremento do Rapier. Atualizar a memória do mecanismo, sem alterar a física.

#### Acceptance criteria

1. A seção Pulleys with mass descreve o guarda-e-devolve de ω em volta de `world.step()`: durante o passo o disco entra com ω = 0 e o Rapier integra o incremento do torque; depois recebe ω guardado mais `angvel()`. A previsão e a correção continuam lendo ω inteiro, e o ângulo do disco no Rapier não mede o giro do grip.
2. A consequência que apresenta o limite de ω como teto da polia é atualizada para o contorno do PHY-50. A descrição restringe o método aos discos sem contatos e mantém o limite dos corpos comuns como assunto do PHY-51; não promete remover todo limite de integração do Rapier.
3. Nenhuma mudança de comportamento, código, API, testes ou tolerâncias.
4. Gate verde.

#### Verification

    Conferir o texto contra step(), pullPieces e correctPieces em src/sim/simulator.ts.
    git diff -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: documentação apenas. Conferir as afirmações contra a produção aprovada do PHY-50 e executar a suíte existente.

## Comments

- 2026-10-01 Aberto pela revisão Standards do PHY-50, sobre `54b0350`. A última consequência do ADR-0004 ainda diz “The ceiling is Rapier's own cap on ω, tracked in PHY-50; this mechanism does not lift it”, descrição superada para os discos. O Quality gate §5 exige manter decisões não óbvias documentadas. O ADR fica fora dos Primary files e dos critérios numerados do PHY-50; a correção segue separadamente conforme o ticket-flow.
