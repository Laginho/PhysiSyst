# CLEAN-16: Remover o mecanismo de carry
Stage: to-review
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

#### Etapa 2 - commit vermelho (2026-09-30)

`npx vitest run src/App.test.ts -t CLEAN-16 --no-color`: **2 failed | 79 skipped (81)**. Edição ao vivo: `expected ... to contain passos: 0`, recebido `passos: 1`, pose `(9.00, 6.00)`, velocidade `5.00 m/s`. Troca de cena: esperado `(6.00, 3.50)`, recebido `(9.00, 6.00)` com velocidade `5.00 m/s` da cena antiga. Simulador falso na seam já autorizada; eventos e leituras via DOM.

Testes exclusivos de carry removidos (19 casos):

- `src/playback/view.test.ts` - `keeps kinematic state for bodies the edit did not move`.
- `src/playback/view.test.ts` - `drops a body the user repositioned in the document (an explicit placement wins)`.
- `src/playback/view.test.ts` - `drops a body the user re-rotated in the document`.
- `src/playback/view.test.ts` - `drops removed ids and never invents state for new ids`.
- `src/playback/view.test.ts` - `drops ids the world was not built with (nothing to carry from)`.
- `src/playback/view.test.ts` - `returns an empty map when there is no state yet`.
- `src/sim/simulator.test.ts` - `carries surviving ids, spawns new ids at doc-initial state, drops removed ids`.
- `src/sim/simulator.test.ts` - `a carried rebuild is transparent: the trajectory continues as if nothing happened`.
- `src/sim/simulator.test.ts` - `ignores carry entries for ids absent from the new document`.
- `src/sim/simulator.test.ts` - `carries fixed bodies without choking on their absent velocity state`.
- `src/sim/simulator.test.ts` - `toggling particle mode mid-flight is structural: carried position/linvel survive exactly, spin freezes`.
- `src/sim/simulator.test.ts` - `a paused/rebuilt world preserves the carried Initial-velocity-driven state exactly`.
- `src/sim/simulator.test.ts` - `a carried structural rebuild mid-flight does not restart the body: trajectory continues as if untouched`.
- `src/sim/acceptance.test.ts` - `replaceScene with carry keeps the document length L, not the length at the carried poses`.
- `src/sim/acceptance.test.ts` - `replaceScene with carry keeps the disk spinning: the blocks carry on at the closed-form a, no jolt (3%)`.
- `src/sim/acceptance.test.ts` - `replaceScene with carry keeps the chain: F_el per end reads the same across the rebuild, and the block follows an uninterrupted run within 3% of A`.
- `src/sim/acceptance.test.ts` - `CLEAN-09: replaceScene with carry after the block moved 0.5 m (chain re-seats)`.
- `src/sim/acceptance.test.ts` - `CLEAN-09: replaceScene with carry after the wall end re-anchored 0.5 m (chain re-seats)`.
- `src/sim/acceptance.test.ts` - `CLEAN-12: replaceScene without the wall in the carry, the block passing X_EQ (chain re-seats moving with its ends)`.

Mantidos os testes de reset, velocidade inicial, modos de partícula, rebuild transacional e retry. A recuperação transacional e o retry passaram a comparar o estado inicial do documento, acompanhando a assinatura sem carry; sua prova de erro/mundo antigo intacto permanece. O adaptador PHY-36 agora recebe só o documento. `integration.test.ts` não passava carry: só os comentários foram corrigidos.

Nota fora dos Primary files: o comentário de `src/playback/routing.ts` ainda menciona carry; não muda o comportamento e fica para limpeza documental própria.

Recorte completo antes da produção: **2 failed | 170 passed (172), 1 test file failed | 5 passed (6)**; typecheck e lint verdes.

#### Etapa 2 — implementação e mutate-verify (2026-09-30)

Commit vermelho: `b9fadb1`. Produção: `carryOver`, `samePose`, parâmetro de carry, retomada de giro dos discos, `regrip`, retomada/reassentamento das cadeias e os campos usados só pelo carry removidos. A construção normal da cadeia com velocidade inicial e o bloqueio de rotação do modo partícula permanecem. `replaceScene(scene)` continua transacional e inicia na pose/velocidade do documento.

O fallback de `applyLiveOps` chama o reset existente e mantém o erro visível. O reset limpa estados, aceleração, contatos, vínculos e leituras DOM antes de tentar reconstruir; se a tentativa falha, o documento fica visível e a reconstrução continua pendente para retry. O efeito de documento foi movido abaixo de `dispatch` para reutilizar esse caminho. ADR-0004 atualizado conforme o critério 5.

Sem mutação: `npx vitest run src/App.test.ts -t CLEAN-16 --no-color`: **2 passed | 79 skipped (81)**. Os testes também verificam o primeiro passo após reset/retry para provar que o mundo reinicia junto com a tela.

| Teste novo | Mutação aplicada em `src/App.tsx` | Comando e saída vermelha |
| --- | --- | --- |
| Uma edição ao vivo que falha mostra o erro, pausa e reinicia nas poses do documento | M1: no catch de `applyLiveOps`, substituir `dispatch({ type: 'reset' }); setSimError(messageOf(e))` por `fail(e); pendingRebuildRef.current = true` | `npx vitest run src/App.test.ts -t 'uma edi' --no-color`: **1 failed | 1 passed | 79 skipped (81)**. `App.test.ts:1789`: esperado `passos: 0`, recebido `passos: 1`, pose `(9.00, 6.00)`, velocidade `5.00 m/s`. |
| Uma edição ao vivo que falha mostra o erro, pausa e reinicia nas poses do documento | M3: remover a chamada `simRef.current?.replaceScene(docRef.current)` do reset, preservando a limpeza das leituras | Mesmo comando: **1 failed | 1 passed | 79 skipped (81)**. `App.test.ts:1795`: no passo após reset, esperado `(9.00, 6.00)`, recebido `(12.00, 8.50)` com velocidade `10.00 m/s`; a tela limpa sozinha não passa. |
| Uma troca de cena cujo replaceScene falha não mostra poses ou velocidades da cena anterior, nem após o retry | M2: remover `statesRef.current = null` tanto do reset quanto do ramo estrutural do efeito de documento | `npx vitest run src/App.test.ts -t 'uma troca de cena cujo' --no-color`: **1 failed | 80 skipped (81)**. `App.test.ts:1812`: esperado `(6.00, 3.50)`, recebido `(9.00, 6.00)` e velocidade `5.00 m/s` da cena anterior. |

Cada mutação foi executada separadamente; a produção foi restaurada byte a byte em `finally` antes do gate. O primeiro ensaio de M1 falhou ao imprimir a saída Unicode no console Python; foi repetido com saída UTF-8 e é a execução acima que fornece a evidência.

Gate completo, em primeiro plano, com a produção restaurada: `npm test && npm run lint && npm run typecheck && npm run build`, **exit 0**. **30 test files passed; 716 tests passed (716)**, lint/typecheck/build verdes. Nenhum teste foi alterado no commit de produção. Etapa 2 concluída; revisão pendente na branch `phy/CLEAN-16-remover-carry`, sobre `sweatshop/2026-09-24-1853`.
