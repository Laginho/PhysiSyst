# PHY-47: Mola ideal com `k` e `c` implícitos, certa no superamortecido e estável quando rígida
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`pushSpring`)
  - `src/sim/acceptance.test.ts` (bloco `ideal spring (PHY-26)`)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (o item "Implicit damping (PHY-40)" da seção Springs)

#### What to build

O PHY-40 tornou implícito só o termo de amortecimento: `F = k·Δx_lead + c·ẋ / (1 + c·Δt·K)`, com `K = 1/m_ef` (`ropeInvMass` nas duas pontas) e `Δx_lead` lido `lead = (1 − φ)·Δt` à frente (`springAt`). O termo elástico continua explícito, e isso deixa dois defeitos.

**1. Superamortecido com o coeficiente errado.** Com `c` alto, o amortecimento implícito anula a velocidade de um passo, mas `k·Δx` age por inteiro em todo passo. O bloco volta ao equilíbrio com constante de tempo próxima de `1/(k·K·Δt)`, não de `c/k`. O PHY-40 só verifica energia (nunca cresce) e momento, e um amortecedor errado também passa nisso. O sol mostrou que limitar `c` a 20 deixa os 51 testes de aceitação verdes.

**2. Mola rígida e leve instável.** Com `√(k/m)·Δt > 2`, o termo elástico explícito diverge. Mesmo abaixo disso, ele bombeia energia. O codec aceita qualquer `k > 0`.

Medido no motor real, na cena horizontal do bloco PHY-26 (`horizontalScene`: chão sem atrito, parede, bloco de 0,4 m, `x₀ = 1`), com o bloco solto parado em `Δx = 0,1 m`. A analítica é a do oscilador amortecido com `x(0) = 0,1` e `v(0) = 0`:

| Caso | Passo | Analítico | Hoje | Protótipo |
| --- | --- | --- | --- | --- |
| `m = 1`, `k = 40`, `c = 200` | 60 | 0,081939 | 0,042027 | 0,082016 |
| | 600 | 0,013520 | 0,000017 | 0,013492 |
| `m = 1`, `k = 40`, `c = 2000` | 60 | 0,098021 | 0,050349 | 0,098033 |
| | 600 | 0,081874 | 0,000101 | 0,081881 |

| Caso (`c = 0`, `E₀ = 2 J`) | `max E` em 600 passos, hoje | Protótipo |
| --- | --- | --- |
| `m = 0,01`, `k = 400` (`ωΔt = 3,3`) | 13932 J (6966·E₀; ±400 m/s) | 2,233 J |
| `m = 0,05`, `k = 400` (`ωΔt = 1,5`) | 4,769 J | 2,190 J |
| `m = 0,1`, `k = 400` (`ωΔt = 1,05`) | 2,922 J | 2,162 J |

Aqui `E = ½m·v² + ½k·Δx²`.

**A decisão:** os dois termos passam a enxergar a velocidade relativa do fim do passo, `ẋ' = ẋ − K·F·Δt`. O elástico a lê com o mesmo `lead` de hoje, e o amortecimento com o passo inteiro:

    F = (k·Δx_lead + c·ẋ) / (1 + (k·lead + c)·Δt·K)

Com `k·lead = 0` isto volta a ser o PHY-40. Com `c = 0` e uma mola branda (`m = 1`, `k = 40`), o denominador vale cerca de 1,004 (com as 4 iterações padrão do solver do Rapier), e o período e a amplitude do PHY-26 continuam dentro da tolerância. O protótipo descartável, que trocou só essa linha, produziu as colunas "Protótipo" acima e deixou verdes os 80 testes de `acceptance.test.ts` e `simulator.test.ts`, incluindo os do PHY-26, do PHY-30 e do PHY-40. Com a mola rígida, a fase continua errada, porque um passo de 1/60 s não resolve `ω = 200 rad/s`. O que o ticket garante é que a energia fica limitada e não explode.

A mola com massa (PHY-30) não passa por `pushSpring` e fica fora; o defeito dela é o PHY-48. A leitura `F_el` (`readSpring`) não muda.

#### Acceptance criteria

1. Cena horizontal PHY-26, `m = 1`, `k = 40`, solta parada em `Δx = 0,1`: com `c = 200` e com `c = 2000`, o `Δx` do bloco nos passos 60 e 600 fica a menos de 1% do valor analítico superamortecido (tabela acima)
2. Mesma cena com `c = 0` e `k = 400`, para `m` = 0,01, 0,05 e 0,1: a energia mecânica `½m·v² + ½k·Δx²` nunca passa de `1,2·E₀` (`E₀ = 2 J`) ao longo de 600 passos
3. Os testes de aceitação existentes da mola (PHY-26, PHY-30 e os critérios do PHY-40) continuam verdes sem mudar tolerância
4. O ADR-0004 descreve a forma implícita de `k` e `c` juntos e por que só o amortecedor implícito não bastava
5. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, incluindo a mutação que volta à fórmula do PHY-40 (termo elástico fora da fração)
6. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-47
    npx vitest run src/sim/acceptance.test.ts -t PHY-26
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `ideal spring (PHY-26)`, com `horizontalScene`: os casos dos critérios 1 e 2, pelo motor público. Vermelhos hoje: com `c = 200`, o passo 60 dá `Δx = 0,0420` contra 0,0819 analítico; com `m = 0,01`, a energia chega a 13932 J.

## Comments

- 2026-09-30 Aberto a partir do review de benchmark do PR 9. O gpt-6.1-sol (max) e o gpt-6-astra (high) acharam o superamortecido errado de forma independente; a mola rígida veio só do sol. As tabelas e o protótipo são probes descartáveis no motor real, sobre `0ff2047`; nada foi commitado. A forma da fórmula é decisão deste ticket. Se o stage 2 achar uma variante equivalente (por exemplo, outro `lead` no denominador) que passe nos mesmos critérios, deve registrá-la aqui antes de usar.
