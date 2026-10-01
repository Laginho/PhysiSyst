# PHY-39: Edição estrutural só com `passos = 0`
Stage: done
Status: ready-for-agent
Blocked by: none
Review: human

- Primary files:
  - `src/App.tsx` (os caminhos que mudam o documento: `commitDoc`, os `setDoc` do arrasto, `undo`/`redo`, `deleteSelected`, ferramentas e inspetores; a linha de dica)
  - `src/App.test.ts`
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts` (a mensagem nova)
  - `src/playback/routing.ts` (só se a guarda precisar de um predicado exportado sobre `routeDocChange`)
  - `src/playback/integration.test.ts`, `src/playback/rebuild-retry.test.ts` (só os casos que fazem edição estrutural com `passos > 0` pelo App)

#### What to build

Hoje qualquer edição estrutural pode ser feita no meio de uma corrida, rodando ou pausada. O rebuild então mistura duas referências: o corpo editado vai para a pose do documento, e os outros continuam na pose viva pelo `carryOver`. Os vínculos, por sua vez, são medidos nas poses do documento (ADR-0004: `L` da corda; PHY-27: `x₀` da mola). O resultado é física errada, e o review do PR 9 (2026-09-30) mediu dois casos:

- **Arrastar a ponta de uma corda no meio da simulação** (achado do Opus, confirmado com probe no motor real). O cenário é a Atwood 3/2 depois de 30 passos, com o corpo arrastado 1 cm e retirado do carry.
  - Arrastando o bloco `a`, a corda fica frouxa para sempre (`T = 0`, `slack`).
  - Arrastando o bloco `b`, a tensão vai a `T = 265,1 N` num passo, contra 23,54 N da forma fechada. Depois fica frouxa por 4 passos.
- **Mola ou corda criada depois que a corrida andou** (CLEAN-13 item 1, confirmado no Chromium pelo Sol). A parede está em (2, 4) e o bloco sai de (5, 4) a 2 m/s. Depois de 30 passos, uma mola ligando os dois centros nasce com `x₀ = 3`, embora a separação na tela seja 4 m. No passo seguinte ela mostra `F_el = 20,60 N`.

Decisão do grilling (2026-09-30): **o documento em t = 0 é o enunciado do problema.** Com `passos > 0`, rodando ou pausado, nenhuma edição estrutural passa. A dica diz para reiniciar (⟲). As edições ao vivo continuam liberadas no meio da corrida, porque não têm inconsistência: módulo, direção e ponto de aplicação de força existente, e `g`. Qual edição é "ao vivo" e qual é "estrutural" é exatamente o que `routeDocChange` já classifica; a guarda usa essa classificação e não inventa outra.

A guarda fica num lugar só, por onde passam todos os caminhos que mudam o documento. Isso inclui arrasto de corpo (mover, girar, redimensionar, `alpha`), ferramentas (corpo, força, polia, corda, mola, contato), Delete pelo teclado e pelo botão, campos estruturais dos inspetores (massa, `v₀`, geometria, atrito, `k`, `x₀`, `c`, `mₛ`) e undo/redo de um passo estrutural. Os controles correspondentes aparecem desabilitados enquanto `passos > 0`. Um caminho que só dá para barrar na hora (um arrasto, um atalho) é recusado com a mensagem na linha de dica.

Trocar de cena, importar, nova cena e ⟲ continuam liberados sempre, porque zeram `passos`.

#### Acceptance criteria

1. Com `passos > 0`, rodando ou pausado, nenhuma edição estrutural chega ao documento pelos caminhos listados acima. O documento fica o mesmo objeto, e a linha de dica mostra a mensagem nova (pt-BR: "reinicie (⟲) para editar"; en: "reset (⟲) to edit")
2. Com `passos > 0`, as edições ao vivo continuam aplicando no mundo rodando: módulo e direção de força existente, arrasto do ponto de aplicação de força e `g`
3. Com `passos = 0` (boot, depois de ⟲, depois de uma troca de cena), todas as edições funcionam como hoje
4. Os controles de edição estrutural têm `disabled` enquanto `passos > 0` e voltam depois de ⟲: botões de ferramenta, botão de excluir, campos estruturais dos inspetores. Undo/redo ficam desabilitados quando o passo que eles aplicariam é estrutural
5. Seleção e leituras (painel do corpo, tensões, forças) continuam funcionando com `passos > 0`
6. No preset Atwood, depois de 30 passos, tentar arrastar `bloco-1` deixa o documento intacto, e a tensão da corda no passo seguinte fica a menos de 1% de `2m₁m₂g/(m₁+m₂)`
7. Os testes existentes que fazem edição estrutural com `passos > 0` pelo App são reescritos no commit vermelho para assertar a recusa. O ticket registra cada um
8. Os testes de regressão são mutate-verified conforme o `AGENTS.md` (seam de DOM: mutação e saída vermelha registradas por teste)
9. Gate verde

#### Verification

    npx vitest run src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: dar passos, tentar arrastar um corpo, usar a ferramenta de mola e apertar Delete; o documento não muda e a dica aparece. Vermelho porque hoje as três edições passam.
- `src/App.test.ts`: com `passos > 0`, mudar o módulo de uma força e `g` ainda chega ao mundo. Verde hoje, e tem que continuar verde; a mutação que prova o teste é uma guarda que também recuse edições ao vivo. Usa o motor real, então espera o overlay de boot sumir antes do primeiro passo (o clique de passo é adiado por `ensureSim()` até o boot resolver; ver o padrão do teste PHY-36; com `vi.useFakeTimers()`, a espera avança o relógio falso).
- `src/App.test.ts`: o cenário do critério 6 (Atwood, 30 passos, tentativa de arrasto, `T` no passo seguinte). Vermelho hoje: 265 N ou `T = 0`.
- Os testes existentes do critério 7, reescritos.

## Comments

- 2026-09-30 Aberto a partir do review de benchmark do PR 9 (Sol, Sonnet, Opus em sessões dedicadas). Junta o F1 do Opus (corda) e o CLEAN-13 item 1 (mola), que eram o mesmo defeito: a edição estrutural no meio da corrida mistura a pose do documento com a pose viva. A trava foi decidida no grilling com o dono. `Review: human` porque é uma mudança de comportamento do editor que ele quer ver. O mecanismo de carry que fica quase morto depois deste ticket sai no CLEAN-16.

- 2026-09-30 Etapa 2, commit vermelho: `npx vitest run src/App.test.ts`: **13 failed | 66 passed (79)**; `npm run typecheck` verde. Os testes atingem o App por eventos DOM; os casos de força/g e Atwood usam o simulador real.
- Critério 7: reescrito `undo during playback pauses transport, then restores the doc` como `undo estrutural durante playback é recusado depois de um passo (PHY-39)`, avançando explicitamente um passo antes de reproduzir. Vermelho: `expected undefined to be defined` para o botão de pausa, pois o undo indevido pausa e remove o corpo. `src/playback/integration.test.ts` e `rebuild-retry.test.ts` não montam o App: seus adaptadores locais continuam testando o rebuild do motor, portanto não foram reescritos.

#### Etapa 2 interrompida (2026-09-30)

Implementação salva: `src/App.tsx` centraliza todos os caminhos de edição em `editDoc`, com classificação de `routeDocChange`, recusa antes de mudar documento/histórico e preservação da seleção. Os controles estruturais usam `disabled`; força/g continuam editáveis; reset e troca de cena liberam a edição. Mensagem adicionada aos dois catálogos.

Gate completo executado com a produção restaurada: **30 test files passed; 728 tests passed**, lint, typecheck e build verdes. `npx vitest run src/App.test.ts` completo também passou: **79 passed (79)**. O build mantém o aviso de tamanho do chunk do simulador.

**Bloqueio:** o teste já comitado `força, direção, ponto de aplicação e g continuam chegando ao mundo; undo/redo ao vivo funcionam` depende da execução conjunta. Na produção sem mutação, `npx vitest run src/App.test.ts -t PHY-39 --no-color` produz **1 failed | 13 passed | 65 skipped (79)**:

```text
AssertionError: expected 0.20000003278255463 to be close to 0.1,
received difference is 0.10000003278255462, but expected 0.000005
src/App.test.ts:1905 — expect(state.linvel.y).toBeCloseTo(0.1, 5)
```

Hipótese a confirmar: `step()` aguarda `vi.dynamicImportSettled()`, que confirma o import, mas não espera explicitamente a resolução do boot real (`createSimulator` aguarda `ensureInit()`). Cliques pendentes podem avançar o mundo depois das edições. O teste precisa aguardar a prontidão do App/motor antes do primeiro passo e das edições. A falha de um teste comitado impede alterá-lo nesta continuação: `ticket-flow`, etapa 2, exige `Stage: blocked` quando “a test proves wrong after being committed”. Nenhum teste foi alterado em commit de produção. Próxima passagem deve corrigir o teste em commit vermelho próprio e repetir o mutate-verify da edição ao vivo; o critério 8 permanece pendente.

#### Mutate-verify no DOM (2026-09-30)

Comando de cada mutação: `npx vitest run src/App.test.ts -t PHY-39 --reporter=verbose --no-color`. Produção restaurada em `finally` depois de cada execução. M1: substituir `if (!canEditDoc(resolved))` por `if (false && !canEditDoc(resolved))`, deixando as edições atravessarem a guarda. M2: substituir a expressão de `structuralLocked` por `false`, mantendo a guarda e removendo o bloqueio visual. M3: inverter `canEditDoc` para aceitar `kind === 'structural'` e recusar `kind === 'live'` após passos. Saídas: M1 **12 failed | 2 passed | 65 skipped (79)**; M2 **8 failed | 6 passed | 65 skipped (79)**; M3 **12 failed | 2 passed | 65 skipped (79)**. O teste ao vivo falha também sem mutação neste recorte e sua falha não conta como prova.

| Teste (cada variante executada) | Mutação | Saída vermelha observada |
| --- | --- | --- |
| undo estrutural durante playback é recusado depois de um passo (reescrito) | M1 | `expected undefined to be defined` para o botão de pausa |
| recusa mover, girar, redimensionar e jogar no lixo — pausado | M1 | documento diferente: `position.x: 5 -> 6` |
| recusa mover, girar, redimensionar e jogar no lixo — rodando | M1 | documento diferente: `position.x: 5 -> 6` |
| recusa o arrasto de alpha da cunha | M1 | documento diferente: `alpha: 45 -> 63.43494882292201` |
| recusa a ferramenta mola armada antes do primeiro passo | M1 | documento passa a conter a constraint `mola` |
| recusa a ferramenta corda armada antes do primeiro passo | M1 | documento passa a conter a constraint `corda` |
| recusa a ferramenta polia armada antes do primeiro passo | M1 | documento passa a conter a pulley `polia` |
| recusa Delete, Backspace e campos estruturais; desabilita controles e libera depois do reset | M1 / M2 | M1: `mass: 1 -> 2`; M2: `expected false to be true` para `:disabled` |
| desabilita o inspetor de vínculos e polias — atwood | M2 | `expected false to be true` para controles `:disabled` |
| desabilita o inspetor de vínculos e polias — spring-horizontal | M2 | `expected false to be true` para controles `:disabled` |
| bloqueia undo/redo estrutural sem consumir o histórico; libera após reset | M1 / M2 | M1: `expected true to be false` (bola reaparece); M2: `expected false to be true` para redo desabilitado |
| a recusa acompanha o idioma inglês | M1 | documento diferente: corpo `bloco` removido |
| força, direção, ponto de aplicação e g continuam chegando ao mundo; undo/redo ao vivo funcionam | M3, refeita após corrigir a espera do boot | `AssertionError: expected { x: +0, y: +0 } to strictly equal { x: 0.5, y: +0 }`, `src/App.test.ts:1905`: a guarda invertida recusa o arrasto da âncora |
| Atwood após 30 passos: arrasto recusado preserva documento e T dentro de 1% | M1 | documento diferente: `(5.75, 3) -> (5.76, 2.752706289291382)` |

Atwood sem mutação passou tanto no conjunto completo quanto no recorte: após a tentativa recusada e o passo 31, `T` fica dentro de 1% de **23.544 N**, `slack = false`, e a leitura DOM mostra **T: 23.54 N**.

- 2026-09-30 Attempt 1 stopped to ask: Implementação salva em `43cab05`; gate verde com 728 testes. PHY-39 ficou `blocked`: o teste novo de força/`g` falha isoladamente, mesmo sem mutação. /  / A [skill ticket-flow](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. Diagnóstico e evidências registrados no ticket.

- 2026-09-30 Proxy decided: retomar de `refs/foreman/phy-39-attempt1` (`1acc7fa` vermelho, `43cab05` produção, gate verde com 728 testes), sem recomeçar; um commit só de teste corrige o `step()` do bloco PHY-39 para esperar o boot do motor real, depois refazer a M3 (inverter `canEditDoc`) e trocar a linha "prova pendente" da tabela pela saída vermelha, gate em primeiro plano, `to-review` — a falha isolada é timing do harness: `settleSimImport()` não espera `ensureInit()`, o clique de passo cai depois das edições e dá dois passos pós-edição (0,2 em vez de 0,1); a asserção física e a guarda estão certas. Contrato inalterado, só a linha do teste de força/`g` ganhou a nota do boot.

#### Etapa 2 retomada e concluída (2026-09-30)

Retomada autorizada pelo proxy: commits originais recuperados sobre `sweatshop/2026-09-24-1853`, mantendo a separação teste/produção (`d347cc4`, vermelho; `eb0da83`, produção). O commit só de teste `153c86a` corrige `step()` para esperar o overlay de boot desaparecer, avançando o relógio falso em intervalos de 5 ms e verificando a prontidão antes dos cliques. Nenhum código de produção precisou mudar nesta retomada.

O bloqueio anterior está resolvido. Sem mutação, o teste real de força/g passou isoladamente: `npx vitest run src/App.test.ts -t 'força, direção, ponto' --reporter=verbose --no-color`: **1 passed | 78 skipped (79)**. A M3 foi refeita com `npx vitest run src/App.test.ts -t PHY-39 --no-color`: **12 failed | 2 passed | 65 skipped (79)**; o teste ao vivo falhou na âncora recusada (`x: 0`, esperado `0.5`), conforme a tabela. Produção restaurada em `finally`; essa falha agora é prova válida, substituindo a falha de timing da primeira tentativa.

Após restaurar a produção, `npx vitest run src/App.test.ts --no-color`: **79 passed (79)**. Gate completo executado em primeiro plano, com interrupção em qualquer erro: **30 test files passed; 733 tests passed**, lint, typecheck e build verdes. Permanece apenas o aviso já existente sobre o tamanho do chunk do simulador. Critério 8 concluído; entregue para revisão em `Stage: to-review`.

#### Resolution (2026-09-30)
Verdict: Approve

Revisão contra `f002867` (base da sessão), HEAD `186a37b`; commits `d347cc4`, `eb0da83`, `153c86a` e `186a37b`. Arquivos revisados: `src/App.tsx`, `src/App.test.ts`, os dois catálogos i18n e este ticket. Rebase sobre `sweatshop/2026-09-24-1853` já atualizado; merge sem squash em `e601f91`. `Review: human` acompanha a revisão na sessão, conforme o fluxo.

##### Standards

Um achado documental corrigido: o comentário original de abertura estava depois dos registros da etapa 2, contrariando `docs/agents/issue-tracker.md` (histórico acrescentado ao final). Ele foi movido para o início de `## Comments`, preservando seu conteúdo e todas as evidências. Nenhuma violação de produção ou smell encontrada. Os arquivos respeitam o escopo; `d347cc4` contém os testes vermelhos, `eb0da83` contém produção sem testes e `153c86a` contém somente a correção autorizada do harness e seu registro.

##### Spec

Zero falhas nos critérios numerados, no escopo ou no protocolo. A guarda reaproveita `routeDocChange` e recusa antes de alterar documento, histórico e seleção; todos os setters, gestos, ferramentas, Delete e undo/redo passam por ela (critérios 1 e 4). Força, direção, âncora e `g` chegam ao mundo real; undo/redo ao vivo continuam disponíveis (2). Boot, reset e troca de cena liberam a edição; seleção e leituras continuam ativas (3 e 5). Atwood preserva o documento após 30 passos e a tensão no passo 31 fica dentro de 1% de 23.544 N, sem folga, com leitura DOM `T: 23.54 N` (6).

O teste antigo de undo foi reescrito no commit vermelho. Os adaptadores em `integration.test.ts` e `rebuild-retry.test.ts` não montam o App e permanecem fora do recorte do critério 7. As provas por teste da tabela acima foram reproduzidas, e o gate passou (8 e 9).

`Proxy decided` revisado: autorizou recuperar os commits, corrigir apenas a espera do boot em commit de teste, repetir M3 e concluir o gate. `153c86a` implementa essa decisão sem mudar as asserções físicas ou o contrato; a exceção à parada do harness foi expressamente autorizada.

##### Red-green e gate reproduzidos na revisão

Comando das três mutações registradas: `npx vitest run src/App.test.ts -t PHY-39 --reporter=verbose --no-color`. Cada execução terminou vermelha, com `src/App.tsx` restaurado byte a byte em `finally`.

| Mutação registrada | Resultado reproduzido | Falha observada |
| --- | --- | --- |
| M1 — atravessar a guarda | 11 failed / 3 passed / 65 skipped (79) | mesmas recusas estruturais da tabela: pose, alpha, ferramentas, massa, undo/redo, Delete em inglês e Atwood |
| M2 — `structuralLocked = false` | 7 failed / 7 passed / 65 skipped (79) | `expected false to be true` nos controles de ferramentas, corpo, vínculos/polias e redo |
| M3 — aceitar estrutural e recusar live após passos | 12 failed / 2 passed / 65 skipped (79) | teste ao vivo, `src/App.test.ts:1905`: âncora `{ x: 0, y: 0 }`, esperado `{ x: 0.5, y: 0 }` |

M1/M2 têm uma falha a menos que na primeira tentativa porque o teste ao vivo agora passa sem mutação. Produção restaurada: `npx vitest run src/App.test.ts -t PHY-39 --no-color`: **14 passed / 65 skipped (79)**. Gate executado novamente após o rebase: **30 test files passed; 733 tests passed**, lint, typecheck e build verdes (exit 0). Apenas o aviso já existente do chunk tardio do simulador. Fechado na sessão com esta resolução e a linha do ledger no mesmo commit.
