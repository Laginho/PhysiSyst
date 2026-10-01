# PHY-46: Uma corda acoplada que saiu do active set volta quando as outras a esticam
Stage: to-implement
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

- 2026-09-30 Aberto a partir do review de benchmark do PR 9. O gpt-6.1-sol (max) e o gpt-6-astra (high) acharam o defeito de forma independente, o Opus 5.5 (xhigh) não. As medições da tabela e o protótipo são probes descartáveis no motor real, sobre `0ff2047`; nada foi commitado. O protótipo foi a forma "devolve a peça mais violada e resolve de novo"; resolver por força bruta todos os subconjuntos também funcionaria com poucas peças. A escolha fica com o stage 2, desde que os critérios valham.
