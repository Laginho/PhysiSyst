# PHY-41: Cordas ligadas por um corpo dinâmico resolvidas juntas
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (o laço de cordas do `step`: `pullRope`/`pullPieces`, `correctRope`/`correctPieces`, `tautTensions`)
  - `src/sim/acceptance.test.ts` (bloco da corda geral, PHY-24)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (a consequência "ropes on shared bodies are solved one after another")

#### What to build

Cordas diferentes que puxam o mesmo corpo são resolvidas uma depois da outra, com uma passada por passo (Gauss–Seidel de uma iteração). A corda seguinte muda o movimento que a anterior tinha assumido, e as duas tensões nunca são resolvidas juntas. O ADR-0004 aceitou isso e deixou um plano B: iterar a correção antes de mudar o mecanismo. O Sol mostrou que 20 iterações da correção ainda erram 33,6 mm, então o plano B não basta.

O caso é clássico de livro-texto, um corpo pendurado por dois fios. O Sol reproduziu, e eu confirmei com probe no motor real. O cenário é uma partícula de 1 kg parada em (0, 0), duas cordas retas até âncoras fixas em (−1; 0,1) e (1; 0,1), e `g = 9,81`. O equilíbrio exige 49,29 N em cada corda. Ao longo de 300 passos a partícula se afasta até **32,99 mm**. As tensões oscilam, e no passo 300 elas mostram 0,00 e 0,29 N.

As cordas que compartilham um corpo dinâmico formam um grupo, e cada grupo resolve suas tensões num único sistema, na predição e na correção. Cada corda sem polia com massa entra como uma peça; as peças de uma corda com polias com massa entram como já entram hoje. É o `K` matricial com active set que o `tautTensions` já usa para as peças de uma corda (PHY-25), estendido ao grupo. Uma corda sozinha, ou cordas ligadas só por corpos fixos, resolvem exatamente como hoje.

#### Acceptance criteria

1. No cenário acima, ao longo de 300 passos, a partícula fica a menos de 1 mm de (0, 0). Do passo 10 em diante, cada corda mostra `T` a menos de 1% de 49,29 N, e nenhuma aparece como `slack`
2. Os testes de aceitação existentes de corda e polia (PHY-23, PHY-24, PHY-25) continuam verdes sem mudar tolerância
3. O ADR-0004 descreve o solve por grupo e retira o plano B de iterar a correção
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`
5. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-24: o cenário do critério 1. Vermelho porque o solve sequencial deixa a partícula oscilar 33 mm.

## Comments

- 2026-09-30 Etapa 2: regressão escrita na interface pública `createSimulator` → `step` → `readStates`/`readConstraints`, no bloco PHY-24. Antes de alterar produção, `npx vitest run src/sim/acceptance.test.ts -t PHY-41` → **1 failed, 53 skipped**: `expected 0.03299476053301212 to be less than 0.001` (32,99 mm ao longo de 300 passos).

- 2026-09-30 Aberto a partir do F2 do Sol no review de benchmark do PR 9. Números reproduzidos por probe descartável no motor real. A decisão de juntar as cordas num solve e emendar o ADR, em vez de documentar como limitação, é do grilling de 2026-09-30.

- 2026-09-30 Attempt 1 stopped to ask: Implementação salva em `9b76293`; gate verde com 720 testes. PHY-41 ficou `blocked`: o teste não detecta a volta da correção sequencial. /  / A [skill ticket-flow](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. Evidências registradas no ticket; sem merge.

- 2026-09-30 Proxy decided: manter o teste PHY-41 como está e retomar de `refs/foreman/phy-41-attempt1` (`43724f9` vermelho, `9b76293` verde) até `to-review`, sem novo teste vermelho — a mutação "correção sequencial, predição por grupo" é equivalente frente aos critérios (partícula totalmente restrita: a correção faz trabalho ~0 e nenhuma tolerância mais apertada que a atual a separa do solve conjunto); o teste mata a regressão que mira (solve sequencial, 33 mm), e o mutate-verify da tentativa, com o sobrevivente registrado como equivalente, cumpre o critério de mutate-verify. Contrato inalterado.
#### Etapa 2 — implementação salva, prova incompleta (2026-09-30)

- Branch: `phy/PHY-41-cordas-acopladas`, a partir da sessão `sweatshop/2026-09-24-1853`. Commit vermelho: `43724f9`, apenas teste e metadados do ticket. Produção e ADR são salvos no commit deste bloqueio, sem alterar testes.
- Implementação: grupos conexos por corpos dinâmicos (incluindo montagens de polias e discos compartilhados), com todas as peças no mesmo `K` em predição e correção. Cordas sem polias com massa contribuem uma peça; cordas isoladas conservam seus caminhos anteriores. Reutilizados `ropeInvMass`, `solveLinear` e `tautTensions`, sem dependências novas. ADR-0004 atualizado para retirar a solução sequencial e o plano B de iterar a correção.
- Verde: `npx vitest run src/sim/acceptance.test.ts` → **54 passed**, sem mudar tolerâncias existentes. Probe descartável via Vite SSR, no motor real: deslocamento máximo **0,06181285425554961 mm**, erro máximo de tensão desde o passo 10 **0,8747548731790921%**, nenhuma corda slack; passo 300: **48,85883543038126 N** e **48,85883543038103 N**.

Mutate-verify do novo teste de equilíbrio PHY-41, na interface pública do simulador:

| Mutação em produção | Resultado do teste PHY-41 | Evidência |
|---|---|---|
| Predição volta a chamar `pullRope` separadamente para cada corda; correção permanece por grupo | **1 failed, 53 skipped** | `expected 0.05660960959768512 to be less than 0.001` |
| Correção volta a chamar `correctRope` separadamente para cada corda; predição permanece por grupo | **1 passed, 53 skipped** — mutação sobrevivente | O cenário de equilíbrio não distingue a correção conjunta da sequencial. |
| `correctPieces` substitui todas as tensões resolvidas por zero | **1 failed, 53 skipped** | `expected 0.009705823846161366 to be less than 0.001` |

- Todas as mutações foram restauradas byte a byte. Gate completo executado após a restauração: `npm test && npm run lint && npm run typecheck && npm run build` → **30 test files passed, 720 tests passed**; lint, typecheck e build com exit 0. Permanece o aviso existente de chunks acima de 500 kB.
- **Bloqueio:** embora o novo teste detecte a predição sequencial e a remoção das tensões na correção, ele sobrevive à regressão que desfaz especificamente o solve por grupo na correção. A prova de regressão desse comportamento é insuficiente. O `AGENTS.md` exige corrigir testes que sobrevivem à mutação; como o teste já foi comprometido, a skill `ticket-flow` exige parar quando um teste se prova errado depois do commit. Não houve alteração posterior no teste, revisão ou merge. É necessário corrigir a prova de correção conjunta antes de retomar a etapa 2; o gate verde não substitui essa evidência.

#### Etapa 2 — retomada concluída (2026-09-30)

- Retomada conforme a decisão do proxy acima, que supera o bloqueio da tentativa 1: teste preservado, sem novo teste vermelho. Branch `phy/PHY-41-cordas-acopladas`, a partir da sessão atual `abca2bf`. Recuperados `43724f9` como `94a352e` (teste e metadados apenas) e a implementação de `9b76293` no commit desta entrega, sem alterar testes. Conflitos resolvidos preservando o rebase da cadeia após `world.step()` (PHY-42), a remoção do carry (CLEAN-16), o ADR atual e os comentários do proxy.
- Vermelho reproduzido antes de recuperar produção: `npx vitest run src/sim/acceptance.test.ts -t PHY-41` → **1 failed, 48 skipped (49)**; `expected 0.03299476053301212 to be less than 0.001`.
- Verde após recuperar produção: `npx vitest run src/sim/acceptance.test.ts` → **49 passed**, incluindo PHY-23, PHY-24 e PHY-25 sem mudar tolerâncias.

Mutate-verify repetido no código recuperado, pelo mesmo teste PHY-41 na interface pública:

| Mutação em produção | Resultado | Evidência |
|---|---|---|
| Predição sequencial por corda, correção por grupo | **1 failed, 48 skipped (49)** | `expected 0.05660960959768512 to be less than 0.001` |
| Correção sequencial por corda, predição por grupo | **1 passed, 48 skipped (49)** | Sobrevivente equivalente frente aos critérios, conforme a decisão registrada do proxy; contrato e teste preservados. |
| Tensões de `correctPieces` substituídas por zero | **1 failed, 48 skipped (49)** | `expected 0.009705823846161366 to be less than 0.001` |

- Mutações restauradas byte a byte antes do gate. Primeira execução: **716 passed, 1 failed**, em PHY-20 (`src/App.browser.test.ts`, viewport 600 px), por `SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.` Arquivo isolado → **10 passed**; nenhuma alteração no harness.
- Gate completo repetido: `npm test && npm run lint && npm run typecheck && npm run build` → **30 test files passed, 717 tests passed**, exit 0; lint, typecheck e build verdes. Mantém-se o aviso existente de chunk acima de 500 kB.
- `Stage: to-review` nesta entrega; revisão e merge ficam para a etapa 3.

#### Review (2026-09-30)

Verdict: Reopen (regressão R1)

Comparação fixada em `git diff abca2bf6d4b79971e31f30f9d85899047c3ecf78...8ec15b1`, base `sweatshop/2026-09-24-1853`. Revisão completa nos eixos Standards e Spec em sub-agentes; reprodução e gate pelo agente principal. Commits examinados: `94a352e` (teste e metadados) e `8ec15b1` (produção, ADR e metadados, sem alterar testes).

**Standards:** nenhuma violação obrigatória. Arquivos dentro dos Primary files, separação teste/código preservada, teste na interface pública e mutações com saídas registradas. Juízo sem ação: possível Duplicated Code na enumeração dos corpos/discos em `step` (`simulator.ts:862` e `:908`); concentrá-la só se voltar a mudar. A duplicação escalar/matricial é autorizada pelo ADR-0004.

**Spec:** os cinco critérios numerados estão atendidos no cenário escrito; um achado P1 de regressão introduzida, R1, impede o merge. Sem outros achados ou ampliação de escopo. A decisão `Proxy decided` de preservar o teste e aceitar "correção sequencial, predição por grupo" como mutação equivalente foi conferida: essa sobrevivência não reprova o critério 4.

| Critério | Resultado da revisão |
| --- | --- |
| 1 | ✅ O teste percorre todos os 300 passos, mede deslocamento máximo, ambas as tensões desde o passo 10 e ausência de slack. Verde no motor real. |
| 2 | ✅ `src/sim/acceptance.test.ts`: 49 passed; tolerâncias de PHY-23, PHY-24 e PHY-25 inalteradas no diff. |
| 3 | ✅ ADR-0004 descreve o solve conjunto na predição e correção e retira a consequência sequencial/plano B. |
| 4 | ✅ As três mutações registradas foram repetidas; resultados abaixo, incluindo a equivalente aceita pelo proxy. |
| 5 | ✅ Gate independente antes da revisão e novamente após restaurar todas as alterações temporárias: 30 arquivos, 717 testes; lint, typecheck e build exit 0. |

**❌ R1 — cordas colineares deixam uma massa sustentada em queda livre.** O novo agrupamento (`src/sim/simulator.ts:1110–1119`, também `:1143–1153`) entrega um `K` singular a `tautTensions`; `solveLinear` devolve `null` e todas as tensões do grupo viram zero. O retorno já existia no solver, mas esta mudança passa a acioná-lo para cordas independentes que antes sustentavam o corpo. É regressão comprovada contra a base, não exigência de distribuir a tração de forma única entre fios redundantes. A spec já exige corda inextensível por padrão (User Stories, Corda, item 2).

Reprodução descartável via Vite SSR, passando por `parse(scene)` → `createSimulator(scene)` → 300 chamadas de `step()` → `readStates()`/`readConstraints()`:

- Scene version 1, `g = 9.81`, `particleMode = true`, sem forças, contatos ou polias.
- Dois corpos fixos circulares (`radius = 0.02`, `mass = 0`, `rotation = 0`) em `(0, 1)` e `(0, 2)`; uma partícula circular (`radius = 0.05`, `mass = 1`, `fixed = false`, `rotation = 0`) parada em `(0, 0)`.
- Duas cordas retas com IDs distintos, cada uma de um corpo fixo à partícula, todas as âncoras locais em `(0, 0)`, `via = []`.
- Invariante observado: deslocamento máximo da partícula menor que 1 mm. Não exigir como cada corda reparte os 9,81 N de sustentação.

| Produção usada pelo mesmo probe | Resultado |
| --- | --- |
| `8ec15b1` (agrupamento novo) | `K = [[1, 1], [1, 1]]`; ambas as cordas com `T = 0` e `slack` em todos os 300 passos. `y` no passo 1: `-0.0017031251918524504`; no passo 10: `-0.13965627551078796`; no passo 300: `-122.72676849365234`. Deslocamento máximo `122.72676849365234 m`; `AssertionError: collinear ropes must keep the supported particle within 1 mm`, exit 1. |
| `abca2bf` (solve sequencial anterior) | Deslocamento máximo `0`; no passo 300, `T = [9.809999999856116, 0]`, uma corda sustenta a massa e nenhuma passagem tem ambas slack. A mesma asserção passa, exit 0. |

Restante para a etapa 2: provar R1 com uma regressão na mesma costura pública e no bloco PHY-24 já autorizado de `src/sim/acceptance.test.ts`; corrigir o solve de grupos com restrições redundantes preservando a sustentação e o cenário original de PHY-41. A correção precisa desse teste novo, portanto não é um pequeno fix da etapa 3. Critérios existentes e o teste original permanecem inalterados.

Mutate-verify repetido pelo reviewer, `npx vitest run src/sim/acceptance.test.ts -t PHY-41`:

| Mutação registrada | Resultado reproduzido |
| --- | --- |
| Predição sequencial, correção por grupo | **1 failed, 48 skipped (49)**; `expected 0.05660960959768512 to be less than 0.001`. |
| Correção sequencial, predição por grupo | **1 passed, 48 skipped (49)**; equivalente conforme a decisão do proxy. |
| Tensões de `correctPieces` substituídas por zero | **1 failed, 48 skipped (49)**; `expected 0.009705823846161366 to be less than 0.001`. |

Todas as mutações e a troca temporária de produção para comparar com a base foram restauradas byte a byte; probe removido. Após as mutações, aceitação completa: **49 passed (49)**. Após a comparação de R1, gate completo: `npm test && npm run lint && npm run typecheck && npm run build` → **30 test files passed (30), 717 tests passed (717)**; demais comandos exit 0. Aviso existente do chunk tardio acima de 500 kB mantido.

`Stage: to-implement` neste commit de reabertura. Sem alteração de produção ou testes na revisão, sem merge e sem linha no ledger. Totais: Standards 0 violações / 1 juízo sem ação; Spec 1 regressão P1 (R1).
