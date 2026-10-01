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

- Stage 2 (2026-09-30): branch `phy/PHY-47-mola-ideal-k-e-c-implicitos`, base `sweatshop/2026-09-24-1853`. Seam aprovado: `createSimulator(parse(horizontalScene(...)))`, `step()` e `readStates()`, sem mocks. `pushSpring` tem um único chamador, `step()`, no caminho sem massa; `pushChain` e `readSpring` ficam fora da alteração. O denominador continua ≥ 1 para `k > 0`, `c ≥ 0`, inclusive `c = 0` e `K = 0` (pontas fixas, pulls cancelados no mesmo corpo ou eixo de comprimento zero); os casos sem amortecimento são cobertos pelos três testes rígidos e os chamadores existentes pelos testes PHY-26/30/40.
- Red antes do código: `npx vitest run src/sim/acceptance.test.ts -t PHY-47` → `7 failed | 54 skipped (61)`. Os quatro testes superamortecidos falham com Δx = 0,042026531696 (c=200, passo 60), 0,000016880035 (c=200, passo 600), 0,050349366665 (c=2000, passo 60), 0,000100624561 (c=2000, passo 600), contra 0,081939 / 0,013520 / 0,098021 / 0,081874 (erro < 1%). Os três testes rígidos falham com `expected 13932.228793286093 / 4.769236390550895 / 2.9217253962209053 to be less than or equal to 2.3999988555909546`, para m=0,01 / 0,05 / 0,1. A precisão da checagem auxiliar de E₀ foi ajustada antes do commit de testes para acomodar a posição f32 do Rapier (E₀=1,9999990463 J); o limite de energia continua 1,2·E₀.

- Stage 2 concluído: fórmula aprovada aplicada em `pushSpring`, reutilizando `springAt`, `ropeInvMass` e `applyPulls`; ADR-0004 atualizado no item autorizado. Nenhuma mudança de tolerância nos testes existentes e nenhuma dependência nova.
- Mutate-verify após o primeiro green: substituí temporariamente a força de produção por `s.k * dx + (s.c * rate) / (1 + s.c * TIMESTEP * ropeInvMass(pulls))` (PHY-40, elástico fora da fração), mantendo os testes intactos. `npx vitest run src/sim/acceptance.test.ts -t PHY-47` → `7 failed | 54 skipped (61)`, exit 1. Evidência por teste:

  | Teste | Red produzido pela mutação PHY-40 |
  | --- | --- |
  | c=200, passo 60 | `displacement 0.042026531696319536 at step 60: expected 0.03991246830368046 to be less than 0.00081939` |
  | c=200, passo 600 | `displacement 0.000016880035400346216 at step 600: expected 0.013503119964599655 to be less than 0.0001352` |
  | c=2000, passo 60 | `displacement 0.05034936666488643 at step 60: expected 0.04767163333511357 to be less than 0.00098021` |
  | c=2000, passo 600 | `displacement 0.00010062456130977004 at step 600: expected 0.08177337543869023 to be less than 0.0008187400000000001` |
  | m=0,01, k=400, c=0 | `expected 13932.228793286093 to be less than or equal to 2.3999988555909546` |
  | m=0,05, k=400, c=0 | `expected 4.769236390550895 to be less than or equal to 2.3999988555909546` |
  | m=0,1, k=400, c=0 | `expected 2.9217253962209053 to be less than or equal to 2.3999988555909546` |

- Mutação removida: o mesmo comando → `7 passed | 54 skipped (61)`, exit 0. `npx vitest run src/sim/acceptance.test.ts src/sim/simulator.test.ts` → `2 passed`, `90 passed (90)`, incluindo PHY-26/30/40 sem alterar tolerâncias.
- Gate final `npm test && npm run lint && npm run typecheck && npm run build` → exit 0; `30 passed`, `731 passed (731)`, lint e typecheck sem erros, build concluído. Vite emitiu somente o aviso de chunks > 500 kB. Commit red separado: `bee7949`; o commit de implementação não altera testes.

#### Review (2026-09-30)

Verdict: Reopen (regressão R1)

Revisão completa de `git diff 338bdb699cd6b399c4130eca58d586d19223bcde...75099d73d3bedc0dd3f7ef2ffc40e3ae46767325`, base `sweatshop/2026-09-24-1853`. Standards e Spec por sub-agentes independentes; gate, mutação registrada e probe de regressão pelo agente principal. Esta é a primeira revisão da implementação. `bee7949` contém testes e metadados, sem produção; `75099d7` contém produção, ADR e metadados, sem alterar testes.

##### Standards

**1 achado documental menor, corrigido neste commit; 0 outros achados; 0 smells.** O stage 2 inseriu comentários antes da abertura original, contrariando `docs/agents/issue-tracker.md` (histórico deve ser acrescentado ao fim). Reordenados abertura → red → implementação/mutações/gate, preservando integralmente a evidência. Primary files e separação test-first respeitados; cada um dos sete testes novos tem mutação e saída red registradas. Nenhuma abstração ou dependência nova. Nenhuma linha `Proxy decided` no ticket.

##### Spec

**1 achado P1: ❌ R1 — o equilíbrio da mola sob gravidade regrediu (S2-implícito).** A spec já exige “Massa-mola vertical: equilíbrio deslocado `mg/k` e período” (`.scratch/physics-sim-v4/spec.md`, Testing Decisions). `pushSpring` segue a fórmula aprovada, mas `springAt` usa somente a velocidade atual. Com a mola parada, a nova força aplicada é `k·dx/D`, sendo `D = 1 + (k·lead + c)·Δt·K`, enquanto a gravidade continua integral no `world.step()`. O equilíbrio passa de `mg/k` para `D·mg/k`. A velocidade livre devida à gravidade e às forças aplicadas não entra no numerador; a mesma conta prevê desvio sob uma carga externa constante. Os testes verticais existentes usam `c = 0`, cujo desvio pequeno cabe na tolerância atual.

Prova no motor público, sem mocks: `m = 1`, `k = 40`, `c = 200`, `x0 = 1`, `g = 9.81`, teto fixo em `(0, 10)`, bloco em `(0, 8.5)`, âncoras nos centros, sem contatos/forças, 6000 passos. O esperado é `mg/k = 0.24525 m`, erro < 2%:

| Produção usada | Resultado do mesmo probe |
| --- | --- |
| Fórmula anterior PHY-40 | `1 passed | 61 skipped (62)`, exit 0 |
| Fórmula deste PHY-47 | `dx = 1.0634875297546387 m`; `expected 0.8182375297546387 to be less than 0.0049050000000000005`; `1 failed | 61 skipped (62)`, exit 1 |

Probe descartável inserido no bloco autorizado `ideal spring (PHY-26)` e executado com `npx vitest run src/sim/acceptance.test.ts -t PHY-47-review-probe`:

```ts
it('PHY-47-review-probe: vertical c=200 keeps static equilibrium mg/k', async () => {
  const m = 1
  const k = 40
  const c = 200
  const x0 = 1
  const sim = await load({
    version: 1,
    constants: { g: G },
    bodies: [
      { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 10 }, rotation: 0 },
      { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: 0, y: 8.5 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    constraints: [{ id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: 0 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0 } }, k, x0, c }],
  })
  for (let i = 0; i < 6000; i++) sim.step()
  const dx = 10 - sim.readStates().get('bloco')!.position.y - x0
  expect(Math.abs(dx - m * G / k)).toBeLessThan(0.02 * m * G / k)
})
```

A troca A/B modificou somente a linha da força para a fórmula anterior já registrada acima. Produção e arquivo de testes restaurados byte a byte em `finally`; diff vazio antes de registrar esta revisão. O probe não ficou como teste permanente: isso exige commit test-only red do stage 2.

Os seis critérios escritos continuam atendidos; R1 é uma regressão comprovada contra o comportamento anterior, não um critério novo. Mutação PHY-40 repetida independentemente: `7 failed | 54 skipped (61)`, exit 1, com exatamente as sete saídas individuais da tabela do stage 2. Produção restaurada: `7 passed | 54 skipped (61)`, exit 0. Bloco PHY-26, incluindo PHY-30/40: `30 passed | 31 skipped (61)`, exit 0, sem mudar tolerâncias. Gate independente após rebase sem conflitos, mantendo `75099d7`: `30 test files passed (30)`, `731 tests passed (731)`; lint, typecheck e build exit 0. Somente o aviso existente do chunk tardio do simulador > 500 kB.

**Restante para o stage 2: somente ❌ R1.** Na mesma branch e na mesma seam pública, pinar o equilíbrio sob gravidade com teste permanente em commit próprio red; corrigir `pushSpring` para considerar a aceleração livre sem perder os critérios 1–6; registrar a variante da fórmula antes de usá-la, como a abertura já permite, e atualizar o item autorizado do ADR. Repetir mutate-verify e gate. Nenhuma correção de produção nesta revisão; nenhum merge e nenhuma entrada de ledger a remover. `Stage: to-implement` no commit de reabertura. Totais: Standards **1 achado resolvido**; Spec **1 regressão pendente**.
