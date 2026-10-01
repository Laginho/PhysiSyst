# PHY-46: Uma corda acoplada que saiu do active set volta quando as outras a esticam
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`tautTensions`)
  - `src/sim/acceptance.test.ts` (bloco `general rope (PHY-24)`, junto dos testes PHY-41)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (a frase do active set em "Tensions solve together")

#### What to build

O `tautTensions` resolve `K(T − base) = b` como active set, mas a remoção é definitiva. Ele tira a peça de menor tensão, resolve as outras de novo e não volta a olhar a peça que saiu. As peças estão acopladas (`K` não é diagonal: cordas no mesmo corpo, PHY-41, ou peças de uma polia com massa, PHY-25). Por isso as tensões das peças que ficaram podem esticar uma peça já removida, e ela continua com `T = 0`. Uma corda inextensível estica, o corpo cai e todas as leituras mostram zero.

Reproduzido no motor real (`parse` → `createSimulator` → `step` → `readStates`/`readConstraints`), com `particleMode`, `g = 9,81` e uma partícula de 1 kg parada na origem. Cada corda vai de uma âncora fixa a `L·(cos θ, sin θ)` até a partícula e começa esticada no comprimento exato:

| Cena | Esperado | Medido hoje (300 passos) |
| --- | --- | --- |
| `L = 1`, θ = 90°, 240°, 300° | `T₉₀ = m·g = 9,81 N`, as outras 0, partícula parada | todas `T = 0`; a partícula cai 0,14 m e fica pendurada por nada |
| `L = 10`, θ = 200°, 110°, 300°, 250° | `T₁₁₀ = 28,247 N`, `T₃₀₀ = 19,322 N` (equilíbrio de forças), as outras 0 | todas `T = 0`; cai 1,24 m em 30 passos e 8,5 m em 300 |
| `L = 5`, θ = 10°, 20°, 30° (sem equilíbrio, a partícula balança) | nenhuma corda passa de `L` | uma corda estica 0,588 m a partir do passo 70 |

Com θ = 90° e 270°, ou 90°, 200°, 270° e 340°, o resultado já sai certo hoje. O bug depende da ordem em que as peças saem.

A correção é a condição de complementaridade que o active set deixa de lado. Quando as tensões das peças que ficaram saem todas positivas, uma peça fora do conjunto cujo resíduo `rhs_k − Σₗ K_kl·T_l` seja positivo (ela seria esticada) volta ao conjunto, e o sistema é resolvido de novo. Repete até não sobrar peça negativa dentro nem peça violada fora. Um contador limita as iterações (`K` da previsão não é simétrico, então ciclar não está descartado em teoria). O protótipo descartável, com umas 15 linhas dentro do `tautTensions`, zerou os três casos da tabela e deixou verdes os 190 testes de `src/sim` e `src/playback`.

**Fora do escopo:** a divergência da polia com massa perto da polia (PHY-45). O mesmo probe deu números idênticos nos cenários do PHY-45 com e sem o protótipo, então este ticket não a corrige.

#### Acceptance criteria

1. Cena `L = 1`, θ = 90°, 240°, 300°: durante 300 passos a partícula fica a menos de 1 mm da origem; do passo 10 em diante, `T₉₀` fica a menos de 1% de 9,81 N, `T₂₄₀` e `T₃₀₀` são 0, e a corda de 90° nunca aparece como `slack`
2. Cena `L = 10`, θ = 200°, 110°, 300°, 250°: durante 300 passos a partícula fica a menos de 1 mm da origem; do passo 10 em diante, `T₁₁₀` fica a menos de 1% de 28,247 N, `T₃₀₀` a menos de 1% de 19,322 N, e `T₂₀₀` e `T₂₅₀` são 0
3. Cena `L = 5`, θ = 10°, 20°, 30°: durante 300 passos a distância da partícula a cada âncora nunca passa de `L + 1 mm`
4. Os testes de aceitação de corda existentes (PHY-23, PHY-24, PHY-25, PHY-41, PHY-43 e CLEAN-17) continuam verdes sem mudar tolerância
5. O ADR-0004 descreve o active set com a volta da peça violada
6. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, incluindo a mutação que retorna `T` assim que nenhuma tensão é negativa, sem conferir as peças que saíram (o comportamento de hoje)
7. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-46
    npx vitest run src/sim/acceptance.test.ts -t "general rope"
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `general rope (PHY-24)`, ao lado dos testes PHY-41: as três cenas dos critérios 1–3, pelo motor público. Vermelhas hoje: no critério 1, `T₉₀ = 0` e a partícula cai 0,14 m; no critério 2, todas `T = 0` e a queda é de 1,24 m em 30 passos; no critério 3, a corda estica 0,588 m.

## Comments

- 2026-09-30 Stage 2: seam aprovada `parse → createSimulator → step → readStates/readConstraints`, com as três cenas dos critérios 1–3. Callers de `tautTensions`: a previsão de leitura sem contato e a previsão de forças em `pullPieces`, mais a correção em `correctPieces`; todos usam a mesma função, tanto para cordas agrupadas quanto para peças de polias com massa. Casos degenerados: conjunto ativo vazio (ainda precisa conferir resíduos), tensões zero e sistemas singulares/cordas colineares; já cobertos pelos testes de folga, PHY-43 e PHY-41 R1, cujas tolerâncias serão preservadas.
- Red antes de produção: `npx vitest run src/sim/acceptance.test.ts -t PHY-46` deu **3 failed, 51 skipped (54)**. As duas cenas de equilíbrio falham em `maxDisplacement < 0.001`: **0.5956457853317261 m** (90°, 240°, 300°; máximo ao longo da trajetória, não só o deslocamento final) e **8.541037003819246 m** (200°, 110°, 300°, 250°). A cena de balanço falha em `maxDistance <= 5.001`: **5.587874430011237 m**. Nenhum arquivo de produção alterado no commit red.
- Implementação: preservado `solveLinear` e a remoção de uma peça por vez; depois de resolver tensões positivas, reinserida a peça fora do conjunto com maior resíduo positivo, inclusive se nenhuma peça ficou ativa. Tolerância relativa `1e-9 * max(1, max |rhs|)` evita reentradas por ruído; limite de `10n²` iterações evita laço infinito com a matriz assimétrica, devolvendo tensões não negativas. ADR-0004 atualizado só no parágrafo "Tensions solve together".

#### Mutate-verify (2026-09-30)

Mutações aplicadas à produção corrigida e removidas depois da execução. Para cada teste novo, inserido `return T` depois da remoção de tensões não positivas e antes do cálculo dos resíduos: o solver termina assim que nenhuma tensão ativa é negativa, sem conferir as peças que saíram (comportamento anterior). Comando: `npx vitest run src/sim/acceptance.test.ts -t PHY-46`.

| Teste novo (motor público) | Saída red com a mutação |
| --- | --- |
| Equilíbrio, L = 1, 90°/240°/300° | `AssertionError: expected 0.5956457853317261 to be less than 0.001` |
| Equilíbrio, L = 10, 200°/110°/300°/250° | `AssertionError: expected 8.541037003819246 to be less than 0.001` |
| Balanço, L = 5, 10°/20°/30° | `AssertionError: expected 5.587874430011237 to be less than or equal to 5.001` |

Resultado mutante: **3 failed, 51 skipped (54)**. Produção corrigida: **3 passed, 51 skipped (54)**; depois da retirada da mutação, bloco `general rope`: **11 passed, 43 skipped (54)**, incluindo as três regressões. Testes e tolerâncias anteriores intactos.

#### Handoff stage 2 (2026-09-30)

- Branch: `phy/PHY-46-tauttensions-reentry`, criada sobre `sweatshop/2026-09-24-1853` (`bf3030b`). Commit red: `d8dca86`; o commit de implementação não altera testes.
- Critérios 1–3: três regressões verdes pelo motor público em 300 passos, com deslocamento/comprimento, tensões e folga verificados conforme o contrato. Critério 4: testes anteriores preservados e verdes no gate. Critérios 5–6: ADR e evidências de mutação acima.
- Critério 7: `npm test && npm run lint && npm run typecheck && npm run build` terminou com **exit 0**; **30 test files passed, 724 tests passed**, ESLint e TypeScript sem erros, Vite compilado (aviso de tamanho de chunk do simulador). Handoff em `to-review`; stage 3 fica para a próxima sessão.

- 2026-09-30 Aberto a partir do review de benchmark do PR 9. O gpt-6.1-sol (max) e o gpt-6-astra (high) acharam o defeito de forma independente, o Opus 5.5 (xhigh) não. As medições da tabela e o protótipo são probes descartáveis no motor real, sobre `0ff2047`; nada foi commitado. O protótipo foi a forma "devolve a peça mais violada e resolve de novo"; resolver por força bruta todos os subconjuntos também funcionaria com poucas peças. A escolha fica com o stage 2, desde que os critérios valham.

#### Resolution (2026-09-30)

Verdict: Approve

Revisão completa de `git diff bf3030bd77729d17f00c49df464f9f3d40fad917...7e00ac7`, base `sweatshop/2026-09-24-1853`. Standards e Spec por sub-agentes independentes; gate e repetição da mutação pelo agente principal. Commit `d8dca86`: testes e metadados, sem produção. Commit `7e00ac7`: produção, ADR e metadados, sem alterar testes.

##### Standards

**0 violações documentadas; 0 smells.** Primary files respeitados: produção restrita a `tautTensions`, testes no bloco autorizado e ADR somente no parágrafo "Tensions solve together". Os commits preservam test-first e o ticket registra a mutação e a falha de cada regressão na seam pública. Conferidos os três callers de `tautTensions`: previsão de leitura, previsão de forças e correção. A remoção individual, a regularização de `solveLinear` e o caminho escalar isolado foram preservados; o limite de iterações tem comentário `ponytail:` com teto e alternativa.

##### Spec

**0 achados.** Critérios 1–3 observados pelos três testes no motor público por 300 passos: deslocamento, tensões desde o passo 10, folga e comprimento conforme o contrato. Critério 4: testes e tolerâncias anteriores intactos e verdes no gate. Critério 5: ADR descreve reentrada, tolerância e limite. Critérios 6–7: mutação e gate reproduzidos abaixo. Conjunto ativo vazio ainda confere resíduos; tensões zero são removidas; entrada vazia retorna `[]`; sistemas singulares mantêm a regularização existente. Nenhuma regressão ou aumento material de escopo identificado. Nenhuma linha **Proxy decided** no ticket.

Prova independente: inserido `return T` antes do cálculo dos resíduos, depois da remoção de tensões não positivas, exatamente como registrado no stage 2. `npx vitest run src/sim/acceptance.test.ts -t PHY-46` produziu **3 failed, 51 skipped (54)**:

| Teste novo | Saída red reproduzida |
| --- | --- |
| Equilíbrio, L = 1, 90°/240°/300° | `expected 0.5956457853317261 to be less than 0.001` |
| Equilíbrio, L = 10, 200°/110°/300°/250° | `expected 8.541037003819246 to be less than 0.001` |
| Balanço, L = 5, 10°/20°/30° | `expected 5.587874430011237 to be less than or equal to 5.001` |

Produção restaurada byte a byte, diff vazio; o mesmo comando deu **3 passed, 51 skipped (54)**. Gate independente `npm test && npm run lint && npm run typecheck && npm run build`: **30 test files passed (30), 724 tests passed (724)**; lint, typecheck e build exit 0. Permanece o aviso existente do chunk tardio do simulador acima de 500 kB.

Sem correção de produção nesta revisão. Rebase sobre a sessão já atualizado, sem conflitos e mantendo `7e00ac7`, o commit validado pelo gate. Merge `--no-ff` na sessão: `ac092ce`. Arquivos entregues: `src/sim/simulator.ts`, `src/sim/acceptance.test.ts` e `docs/adr/0004-rope-as-own-constraint-around-world-step.md`; fechamento neste ticket e em `.scratch/physics-sim-v4/ledger.md`. `Stage: done` e ledger no mesmo commit de fechamento. Totais: Standards **0 achados**; Spec **0 achados**.
