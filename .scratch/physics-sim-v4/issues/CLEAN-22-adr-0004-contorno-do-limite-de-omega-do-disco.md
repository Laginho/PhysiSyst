# CLEAN-22: ADR-0004 descreve o contorno do limite de ω no disco da polia
Stage: done
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
- 2026-10-01 Stage 2. Sem teste novo (documentação apenas, como o ticket prevê). O ADR agora descreve o guarda-e-devolve de ω conferido contra `step()` (L964-969), `pullPieces` (`w0`, L1176) e `correctPieces` (L1234); o aro mora no mount, não no disco, então "discos sem contatos" vale. Gate: lint, typecheck e build verdes; `npm test` 795/796. A falha é `simulator.test.ts > no invisible walls (T7/M2) > a body launched beyond the viewport…`, timeout de 5000 ms (6,3 s na suíte cheia, 3,2 s isolado e verde). Reproduz idêntica na base sem a minha mudança (stash), então não é desta edição; tocar o teste ou o timeout está fora dos Primary files e do critério 3. O gate verde (critério 4) não foi alcançado por causa disso.

#### Resolution (2026-10-01)

Verdict: Approve

Revisão independente em dois eixos sobre `b92c5d8...0a818a9`, com a sessão `sweatshop/2026-10-01-1211` como base. A dependência PHY-50 está fechada na sessão. Nenhuma correção adicional foi necessária.

##### Standards

0 violações documentadas e 0 smells. Os dois trechos do ADR mantêm seu vocabulário, atualizam a decisão não óbvia conforme o Quality gate §5 e ficam dentro dos Primary files. A atualização administrativa do ticket preserva a separação entre Stage e Status. A ausência de testes novos segue a exceção documental expressa do contrato.

##### Spec

1. Atendido: o ADR descreve a captura de ω, a entrada do disco com ω = 0 em `world.step()` e a restauração com ω guardado mais `angvel()`, conforme `simulator.ts:966–969`. Previsão e correção leem ω inteiro (`1176–1178` e `1234`); o texto distingue o giro do grip de `disk.rotation()`.
2. Atendido: a consequência restringe o contorno aos discos sem contatos, explica que o aro pertence ao mount e remete os corpos comuns ao PHY-51, sem prometer remover os demais limites do Rapier. Conferido contra a construção dos colliders (`simulator.ts:824–844`).
3. Atendido: apenas documentação e registros do fluxo mudaram; nenhum comportamento, código, API, teste ou tolerância foi alterado.
4. Atendido: gate independente verde com um worker temporário, com a limitação operacional abaixo registrada.

##### Verificação e gate

Sem teste novo ou mutação a repetir: o ticket é documental. A prova é a conferência dos dois trechos contra a produção aprovada do PHY-50. `git diff --check` passou; a comparação contra a base confirmou ausência de alterações em `src`, dependências e configuração.

`npm test && npm run lint && npm run typecheck && npm run build`, com `VITEST_MAX_WORKERS=1` somente no ambiente da chamada, restaurado ao terminar: **30 arquivos e 796 testes verdes**, suíte em **53,44 s**; lint, typecheck e build exit 0.

A execução com a concorrência padrão teve **795 verdes e 1 timeout** no teste existente `a body launched beyond the viewport…` (`src/sim/simulator.test.ts:520`, 6252 ms para o limite de 5000 ms). É a mesma limitação preexistente registrada no estágio 2 e nas resoluções de PHY-48 e PHY-50. O worker temporário segue esse precedente; nenhum timeout, tolerância ou configuração persistente foi alterado.

##### Integração e fechamento

Rebase sobre a sessão já atualizado, sem conflitos. Branch `clean-22` integrada com `--no-ff`, sem squash, em `e0008a7`; a árvore do merge é idêntica à validada. Resolução, linha do ledger e `Stage: done` registrados juntos no commit de fechamento sobre a sessão. Nenhum PR ou push neste estágio.

Totais: Standards 0 achados; Spec 0 achados.
