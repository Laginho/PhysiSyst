# CLEAN-16: Remover o mecanismo de carry
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-39
Review: agent

- Primary files:
  - `src/playback/view.ts`, `src/playback/index.ts` (`carryOver`)
  - `src/playback/view.test.ts`, `src/playback/integration.test.ts`, `src/playback/rebuild-retry.test.ts` (os casos de carry)
  - `src/App.tsx` (o efeito do `doc`, `dispatch` e `switchToScene`: o rebuild sem carry e o fallback de edição ao vivo que falha)
  - `src/App.test.ts`
  - `src/sim/simulator.ts` (`replaceScene` e o que só o carry alcança: giro de disco carregado, `regrip` no carry, `same()` e o reassentamento da cadeia no carry)
  - `src/sim/acceptance.test.ts`, `src/sim/simulator.test.ts` (os casos de carry: PHY-23 critério 8, PHY-25, PHY-30, CLEAN-09, CLEAN-12)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (bullets "Carry", linha de resultado do carry, a frase de `L` sobre edição durante a corrida)

#### What to build

Com o PHY-39, a edição estrutural só acontece com `passos = 0`, e então o rebuild estrutural sempre começa sem estado simulado: `statesRef` é `null` e o `carryOver` devolve vazio. O mecanismo de carry, que desde a v1 existia para levar o estado dos corpos através de uma edição no meio da corrida (a decisão T7), fica sem uso. Ele inclui:
- `carryOver`;
- o parâmetro `carry` de `replaceScene`;
- o giro do disco carregado e o `regrip` (PHY-25);
- a retomada e o reassentamento da cadeia da mola (PHY-30, CLEAN-09, CLEAN-12).

Só um caminho ainda chega nele: quando uma edição ao vivo falha (`applyLiveOps` lança), o App agenda um rebuild com carry no meio da corrida. Decisão do grilling (2026-09-30): esse caminho passa a mostrar o erro e reiniciar para t = 0, como o ⟲. O mecanismo sai inteiro, com os testes que só existiam para ele.

Isto também fecha, por construção, o vazamento de uma troca de cena que falha, que os reviews do PR 9 acharam (F4 do Opus, F4b do Sonnet). Quando `replaceScene` lança numa troca, o `catch` do reset mantém `statesRef` da cena antiga, e o `carryOver` levava esse estado para a cena nova. Sem carry, não há o que vazar. Por isso esse achado não ganhou um ticket próprio.

#### Acceptance criteria

1. `replaceScene` recebe só a cena; `carryOver` e o parâmetro `carry` não existem mais, nem o código que só o carry alcançava
2. Uma edição ao vivo que falha mostra o erro e deixa o playback em `passos = 0`, com os corpos nas poses do documento
3. Numa troca de cena em que `replaceScene` lança, nenhum corpo da cena nova mostra pose ou velocidade da cena anterior
4. Os testes que só exercitavam carry saem. Os outros testes não mudam, a não ser para acompanhar a assinatura nova de `replaceScene`. O ticket lista os testes removidos
5. O ADR-0004 não descreve mais carry e registra que edição estrutural só acontece em t = 0 (PHY-39). O comentário de `view.ts` sobre a decisão T7 sai junto com a função
6. Os testes novos dos critérios 2 e 3 são mutate-verified conforme o `AGENTS.md` (seam de DOM: mutação e saída vermelha registradas por teste)
7. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: uma edição ao vivo cujo `applyLiveOps` lança (simulador falso) termina em `passos = 0` nas poses do documento. Vermelho porque hoje o fallback reconstrói com carry no meio da corrida.
- `src/App.test.ts`: uma troca de cena em que `replaceScene` lança não herda o estado da cena anterior. Vermelho porque hoje o `carryOver` herda.
- A remoção dos testes de carry vai no mesmo commit vermelho, e o ticket a registra.

## Comments

- 2026-09-30 Aberto como consequência do PHY-39, por decisão do grilling com o dono. Absorve o achado da troca de cena que falha (Opus F4, Sonnet F4b), que no plano era um PHY próprio. Ele deixou de ser preciso porque, sem carry, o vazamento não existe.
