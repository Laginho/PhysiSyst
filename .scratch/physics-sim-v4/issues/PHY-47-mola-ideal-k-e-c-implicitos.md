# PHY-47: Mola ideal com `k` e `c` implícitos, certa no superamortecido e estável quando rígida
Stage: implementing
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

- Stage 2 retomado (2026-09-30), somente R1: `pushSpring` continua tendo um único chamador em `step()`, depois das forças aplicadas e antes das cordas. `springAt` também serve `readSpring`, `chainAxis` e `placeChain`; esses caminhos não serão alterados. `freePointVelocity` já prevê gravidade, forças aplicadas, torque e inércia efetiva para as cordas; será reutilizado sem alterar seus chamadores. Pontas fixas, eixo nulo e pulls no mesmo corpo continuam com denominador ≥ 1; `c = 0` permanece coberto pelos testes rígidos existentes.
- Variante registrada antes da implementação: manter `springAt(s, lead)` e seu eixo; calcular `δẋ = ẋ_free − ẋ` com `freePointVelocity` nas duas âncoras e `lengtheningRate` nos pulls. Usar `F = [k·Δx_lead + c·ẋ + (k·lead + c)·δẋ] / [1 + (k·lead + c)·Δt·K]`. Assim `ẋ′ = ẋ_free − K·F·Δt` inclui a aceleração livre nos dois termos e preserva o equilíbrio `carga/k`. Sem aceleração projetada, a fórmula é a já aprovada. A seam permanece `createSimulator(parse(scene))`, `step()` e `readStates()`, no bloco autorizado PHY-26, sem mocks.
- Red permanente de R1, antes do código: `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: overdamped vertical'` → exit 1, `2 failed | 61 skipped (63)`. Para gravidade e para força aplicada constante de 9,81 N com `g = 0`, ambos com `m = 1`, `k = 40`, `c = 200`, 6000 passos: `stretch 1.0634875297546387: expected 0.8182375297546387 to be less than 0.0049050000000000005`. O esperado independente é `carga/k = 0.24525 m`, tolerância 2%, igual ao probe da revisão.
- R1 implementado com a variante registrada, reutilizando os helpers existentes apenas em `pushSpring`; ADR atualizado no item autorizado. O commit red permanente é `1764c36`, sem alteração de produção. Nenhuma tolerância existente mudou.
- Mutate-verify R1 após o green: removi temporariamente apenas `+ implicit * deltaRate` do numerador de produção (a fórmula do primeiro PHY-47), mantendo os testes intactos. `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: overdamped vertical'` → exit 1, `2 failed | 61 skipped (63)`. Evidência por teste:

  | Teste novo | Mutação | Saída red |
  | --- | --- | --- |
  | Equilíbrio sob gravidade | Numerador sem aceleração livre | `stretch 1.0634875297546387: expected 0.8182375297546387 to be less than 0.0049050000000000005` |
  | Equilíbrio sob força aplicada constante | Numerador sem aceleração livre | `stretch 1.0634875297546387: expected 0.8182375297546387 to be less than 0.0049050000000000005` |

- Mutação PHY-40 repetida após R1: `F = k·dx + c·rate / (1 + c·Δt·K)` → `npx vitest run src/sim/acceptance.test.ts -t PHY-47`, exit 1, `7 failed | 2 passed | 54 skipped (63)`. Os sete testes originais produzem exatamente as sete saídas individuais da tabela anterior (deslocamentos 0.042026531696319536 / 0.000016880035400346216 / 0.05034936666488643 / 0.00010062456130977004; energias 13932.228793286093 / 4.769236390550895 / 2.9217253962209053). Os dois testes de equilíbrio passam com PHY-40, como na prova A/B da revisão. Cada mutação foi restaurada byte a byte em `finally` antes da seguinte.
- Produção restaurada: `npx vitest run src/sim/acceptance.test.ts -t PHY-47` → exit 0, `9 passed | 54 skipped (63)`; `npx vitest run src/sim/acceptance.test.ts src/sim/simulator.test.ts` → `2 passed`, `92 passed (92)`, incluindo os testes PHY-26/30/40 intactos.
- Gate final de R1 (`npm test && npm run lint && npm run typecheck && npm run build`, executado sequencialmente com parada em erro no PowerShell) → exit 0; `30 test files passed (30)`, `733 tests passed (733)`; lint e typecheck sem erros, build concluído. Apenas o aviso existente de chunk > 500 kB. R1 corrigido e os critérios 1–6 preservados; `Stage: to-review` no commit de produção/ADR/metadados, sem tocar testes. Sem merge: a próxima sessão executa o stage 3.

#### Re-review (2026-10-01)

Verdict: Reopen (regressão R2)

Revisão de R1 e do delta `git diff b3721856aceca7f8d33b3e4ddf22f22f93def946...c62cf2f673af0ce423ab740eb947d43b29308c47`, commits `1764c36` e `c62cf2f`. Base do loop: `sweatshop/2026-09-24-1853`, ainda em `338bdb6`; rebase sem conflitos e sem mudar o HEAD. Standards e Spec por sub-agentes independentes; gate, repetição das mutações registradas e prova A/B de R2 pelo agente principal.

##### Standards

**0 violações documentadas; 0 smells.** Primary files respeitados; `1764c36` contém testes e metadados, sem produção; `c62cf2f` contém produção, ADR e metadados, sem alterar testes. A variante foi registrada antes da implementação. Cada um dos nove testes tem mutação e saída red individual no histórico acima. Os novos comentários estão ao fim; o achado documental anterior permanece corrigido. Reutilização dos helpers existentes, sem abstração ou dependência nova. Nenhuma decisão de proxy nesta retomada.

##### Spec

**R1 corrigido para a mola isolada.** A previsão de velocidade livre inclui gravidade, força aplicada e torque, com sinais e inércia consistentes com os pulls. Os dois testes permanentes de equilíbrio `load/k` passam; os critérios numerados 1–6 continuam atendidos, sem mudança de tolerância.

**1 achado P1: ❌ R2 — duas molas no mesmo corpo perdem o equilíbrio e passam a depender da ordem da Scene (S2-implícito).** Em `step()`, cada `pushSpring` aplica sua força antes de processar a próxima mola. A nova leitura de `freePointVelocity` inclui `rigid.userForce()`, portanto a segunda mola considera a força da primeira em `deltaRate`, enquanto a primeira não considera a segunda. A correção de R1 cria uma interação unilateral entre molas. O ADR-0004 define a força física como `F_el = k·Δx + c·ẋ`: duas molas idênticas, igualmente esticadas em sentidos opostos, devem cancelar suas forças num corpo parado. Agora o corpo acelera nessa cena sem carga externa. **Este achado foi introduzido por `c62cf2f`; não é um achado perdido pela revisão anterior.**

Prova pelo motor público, sem mocks: corpo de 1 kg em `(0, 0)`, âncoras fixas em `(−1.1, 0)` e `(1.1, 0)`, âncoras nos centros, duas molas com `k = 40`, `x0 = 1`, `c = 200`, `g = 0`, sem forças aplicadas ou contatos. Cada mola começa esticada 0,1 m. Em 300 passos, o esperado independente é manter `max |x| < 0.0001 m` (0,1 mm):

| Produção usada | Ordem das molas | Resultado do mesmo probe |
| --- | --- | --- |
| Fórmula anterior a R1, numerador sem aceleração livre | Esquerda → direita e direita → esquerda | `2 passed | 63 skipped (65)`, exit 0 |
| Produção atual `c62cf2f` | Esquerda → direita | `max drift 0.03953563794493675, final x 0.03953563794493675, reverse=false: expected 0.03953563794493675 to be less than 0.0001` |
| Produção atual `c62cf2f` | Direita → esquerda | `max drift 0.03953563794493675, final x -0.03953563794493675, reverse=true: expected 0.03953563794493675 to be less than 0.0001` |

Produção atual: `2 failed | 63 skipped (65)`, exit 1. A troca A/B removeu somente `+ implicit * deltaRate` do numerador, recuperando a força anterior a R1; os dois casos usaram exatamente o mesmo teste. Probe descartável no bloco autorizado `ideal spring (PHY-26)`, executado com `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47-review-probe R2'` (reporter JSON para capturar as saídas):

```ts
it.each([false, true])('PHY-47-review-probe R2: opposite identical springs stay balanced, reverse=%s', async (reverse) => {
  const constraints: Scene['constraints'] = [
    { id: 'left-spring', kind: 'spring', a: { bodyId: 'left', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200 },
    { id: 'right-spring', kind: 'spring', a: { bodyId: 'right', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200 },
  ]
  if (reverse) constraints.reverse()
  const sim = await load({
    version: 1,
    constants: { g: 0 },
    bodies: [
      { shape: 'rectangle', width: 0.2, height: 0.2, id: 'left', fixed: true, mass: 0, position: { x: -1.1, y: 0 }, rotation: 0 },
      { shape: 'rectangle', width: 0.2, height: 0.2, id: 'right', fixed: true, mass: 0, position: { x: 1.1, y: 0 }, rotation: 0 },
      { shape: 'rectangle', width: 0.4, height: 0.4, id: 'body', fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    constraints,
  })
  let worst = 0
  for (let i = 0; i < 300; i++) {
    sim.step()
    worst = Math.max(worst, Math.abs(sim.readStates().get('body')!.position.x))
  }
  const x = sim.readStates().get('body')!.position.x
  expect(worst, `max drift ${worst}, final x ${x}, reverse=${reverse}`).toBeLessThan(1e-4)
})
```

Produção e testes restaurados byte a byte em `finally`; `git diff --exit-code` confirmou diff vazio antes desta anotação. O probe precisa virar teste permanente em commit test-only red do stage 2. R2 é regressão comprovada contra o comportamento anterior; nenhum critério numerado foi reescrito.

Mutações registradas repetidas independentemente: retirar a aceleração livre → `2 failed | 61 skipped (63)`, exit 1, com as duas saídas de R1 idênticas às registradas; fórmula PHY-40 → `7 failed | 2 passed | 54 skipped (63)`, exit 1, com as sete saídas individuais originais idênticas às registradas. Cada mutação foi restaurada byte a byte. Produção restaurada: `acceptance.test.ts` + `simulator.test.ts` → `2 test files passed (2)`, `92 tests passed (92)`. Após remover o probe R2, bloco PHY-26 (incluindo PHY-30/40/47) → `32 passed | 31 skipped (63)`, exit 0.

Gate independente na produção intacta: `30 test files passed (30)`, `733 tests passed (733)`; lint, typecheck e build exit 0. Apenas o aviso existente do chunk tardio do simulador > 500 kB. O gate verde não cobre a cena de R2.

**Restante para o stage 2: somente ❌ R2.** Na mesma branch e seam pública, pinar o equilíbrio das duas molas opostas e ambas as ordens em commit próprio red; corrigir a interação entre molas preservando R1 e os critérios 1–6; registrar a variante antes de usá-la e atualizar o item autorizado do ADR. Respeitar os Primary files; se a solução precisar ampliar o escopo além de `pushSpring`, encaminhar a decisão pelo fluxo de proxy da skill antes de alterar esse escopo. Repetir mutate-verify e gate. A regra mecânica de `ticket-flow` exige reabertura quando a correção precisa de teste novo. `Stage: to-implement` neste commit de revisão. Totais: Standards **0 achados**; Spec **1 regressão nova pendente, R1 resolvido**.


- Stage 2 retomado (2026-10-01), somente R2: seam pública já aprovada, bloco PHY-26. `pushSpring` tem um único chamador, `step()`, que o chama por mola ideal; `springAt`, `freePointVelocity`, `lengtheningRate`, `ropeInvMass`, `solveLinear` e `applyPulls` serão reutilizados sem alterar seus demais chamadores. Nenhum arquivo/seam além dos Primary files é necessário. O novo sistema pode ter K singular (as duas molas opostas já produzem uma matriz de posto 1), mas soma a identidade; pontas fixas, eixo nulo e pulls cancelados continuam com diagonal 1 quando K = 0. Uma cena sem mola ideal não chama `pushSpring`.
- Variante de R2 registrada antes do código: a primeira chamada ideal de `pushSpring` calcula todas as linhas ideais antes de aplicar qualquer força; as chamadas seguintes não repetem o trabalho. Para cada mola i, `q_i = k_i·lead + c_i`, `b_i = k_i·Δx_lead,i + c_i·ẋ_i + q_i·δẋ_i`, com a previsão livre sem nenhuma força ideal deste passo. Resolver `Σ_j [δ_ij + q_i·Δt·K_ij] F_j = b_i`, onde `K_ij = ropeInvMass(pulls_j, pulls_i)`, usando `solveLinear`; só depois aplicar cada força. Isso é a mesma fórmula de R1 para uma mola e inclui todas as interações, não só as das molas anteriores. Molas com massa continuam no caminho existente, fora deste ticket; nenhum chamador ou helper será alterado.
- Red permanente de R2 antes do código: `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: opposite springs'` → exit 1, `4 failed | 63 skipped (67)`. Limite independente `max |x| < 0.0001 m` por 300 passos. Com `c_esquerda = 200`, os pares `(reverse, c_direita)` produziram: `(false, 200)` → `max drift 0.03953563794493675, final x 0.03953563794493675`; `(true, 200)` → `max drift 0.03953563794493675, final x -0.03953563794493675`; `(false, 2000)` → `max drift 0.007079267408698797, final x 0.007079267408698797`; `(true, 2000)` → `max drift 0.05182609334588051, final x -0.05182609334588051`. Cada assert falha com `expected <max drift> to be less than 0.0001`. Os dois casos com amortecimentos diferentes impedem uma falsa correção que apenas leia um snapshot livre comum e continue dividindo cada força isoladamente. Acentos desta anotação foram corrigidos após o commit red porque o pipe PowerShell/Python os havia substituído por `?`; o conteúdo técnico não mudou.

- R2 implementado somente em `pushSpring`, com a variante registrada e os helpers existentes; item autorizado do ADR atualizado. Commit test-only red `e874fda`; nenhum teste alterado no commit de produção. O sistema denso tem custo O(n³), documentado com `ponytail:`; separar grupos conectados fica para quando o tamanho das cenas justificar.
- Mutate-verify R2 após green: substituí temporariamente somente `pushSpring` pela versão de produção `c62cf2f` (previsão/aplicação sequenciais de R1), mantendo os testes intactos. `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: opposite springs'` → exit 1, `4 failed | 63 skipped (67)`. Evidência por teste novo:

  | Teste `(reverse, c_direita)` | Red com a mutação sequencial de R1 |
  | --- | --- |
  | `(false, 200)` | `max drift 0.03953563794493675, final x 0.03953563794493675: expected 0.03953563794493675 to be less than 0.0001` |
  | `(true, 200)` | `max drift 0.03953563794493675, final x -0.03953563794493675: expected 0.03953563794493675 to be less than 0.0001` |
  | `(false, 2000)` | `max drift 0.007079267408698797, final x 0.007079267408698797: expected 0.007079267408698797 to be less than 0.0001` |
  | `(true, 2000)` | `max drift 0.05182609334588051, final x -0.05182609334588051: expected 0.05182609334588051 to be less than 0.0001` |

- Mutação adicional de R2: zerar somente os termos fora da diagonal da matriz (snapshot comum, forças divididas isoladamente) → mesmo comando, exit 1, `2 failed | 2 passed | 63 skipped (67)`. Ambos os testes `c_direita = 2000`, em ambas as ordens, falham com `max drift 0.030418209731578827, final x -0.030418209731578827: expected 0.030418209731578827 to be less than 0.0001`; os dois com damping igual passam. Assim os testes distinguem a solução acoplada de uma correção parcial de ordem.
- Mutação de R1 repetida: retirar somente `+ implicit * (lengtheningRate(pulls, free) - rate)` do numerador → `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: overdamped vertical'`, exit 1, `2 failed | 65 skipped (67)`. Gravidade e força aplicada falham individualmente com `stretch 1.0634875297546387: expected 0.8182375297546387 to be less than 0.0049050000000000005`.
- Mutação PHY-40 repetida: substituir somente `pushSpring` pela versão do commit red original `bee7949` (`F = k·dx + c·rate / (1 + c·Δt·K)`) → `npx vitest run src/sim/acceptance.test.ts -t PHY-47`, exit 1, `7 failed | 6 passed | 54 skipped (67)`. Cada um dos sete testes originais produz exatamente a sua saída individual na tabela original acima: deslocamentos 0.042026531696319536 / 0.000016880035400346216 / 0.05034936666488643 / 0.00010062456130977004 e energias 13932.228793286093 / 4.769236390550895 / 2.9217253962209053. R1 e os quatro testes de equilíbrio R2 passam nessa fórmula, como esperado.
- Cada mutação foi restaurada byte a byte em `finally`. Produção restaurada: `npx vitest run src/sim/acceptance.test.ts -t PHY-47` → exit 0, `13 passed | 54 skipped (67)`. `acceptance.test.ts` + `simulator.test.ts` → `2 test files passed (2)`, `96 tests passed (96)`, incluindo PHY-26/30/40 sem mudar tolerâncias.
- Gate final de R2, `npm test && npm run lint && npm run typecheck && npm run build`, executado sequencialmente no PowerShell com parada em erro → exit 0; `30 test files passed (30)`, `737 tests passed (737)`; lint e typecheck sem erros, build concluído. Apenas o aviso existente de chunk > 500 kB. R2 corrigido, R1 e os critérios 1–6 preservados. `Stage: to-review` no commit de produção/ADR/metadados; a próxima sessão executa o stage 3.

#### Re-review de R2 (2026-10-01)

Verdict: Reopen (regressões R3 e R4)

Revisão do delta `git diff 83e3f10...1604254`, commits `e874fda` e `1604254`, com contexto do diff completo `git diff 338bdb699cd6b399c4130eca58d586d19223bcde...160425463e11ac99f40f26622c66c1e52b3dee7b`. Base do loop: `sweatshop/2026-09-24-1853`, ainda em `338bdb6`. Standards e Spec por sub-agentes independentes; gate, repetição das quatro mutações registradas e provas A/B pelo agente principal. Os dois achados abaixo foram introduzidos por `1604254`; não são achados perdidos pelas revisões anteriores.

##### Standards

**0 violações documentadas; 0 smells.** Produção somente em `pushSpring`, testes somente no bloco PHY-26 e ADR somente no item autorizado. `e874fda` contém testes e metadados, sem produção; `1604254` contém produção, ADR e metadados, sem alterar testes. A variante foi registrada no commit red antes da implementação. Os quatro casos R2 têm mutação e saída red individual registradas; comentários novos ao fim do histórico. Helpers existentes reutilizados, sem abstração, dependência ou refactor externo. O custo O(n³) está documentado com `ponytail:`. Nenhuma decisão de proxy nesta rodada.

##### Spec

**R1 e R2 resolvidos; critérios 1–6 preservados. Duas regressões novas pendentes.** A matriz física usa `K = J M⁻¹ Jᵀ`, incluindo a resposta angular compartilhada; a identidade mantém o sistema invertível com K singular ou zero. O codec rejeita molas entre âncoras no mesmo corpo. Os achados são mudanças observadas contra a produção anterior, não novos critérios de aceitação.

**P1: ❌ R3 — uma mola desconectada quebra o equilíbrio de uma mola com massa e uma ideal.** Em `src/sim/simulator.ts:1039`, a primeira chamada passa a processar todas as molas ideais, inclusive as posteriores a um `pushChain` no gancho de `step()`. Com isso, inserir uma mola ideal independente antes de uma cadeia antecipa outra mola ideal que antes previa a força dessa cadeia. O ticket delimita a mola com massa como fora da alteração; o ADR-0004 define `F_el = k·Δx + c·ẋ`. Duas molas igualmente esticadas em sentidos opostos devem manter o corpo parado nesta cena com `g = 0`.

Prova pública: corpo central de 1 kg em `(0, 0)`, apoios fixos em `(−1.1, 0)` e `(1.1, 0)`, âncoras nos centros, ambas as molas com `k = 40`, `x0 = 1`, `c = 200`; a esquerda tem `mass = 0.1`, a direita é ideal. Ordem original: cadeia → ideal. Acrescentar no início uma mola ideal relaxada entre dois corpos fixos em `(10, 10)` e `(11, 10)`, sem ligação com o sistema, deve preservar `max |x| < 0.0001 m` por 300 passos.

| Produção | Sem mola independente | Com mola independente no início |
| --- | --- | --- |
| `c62cf2f`, anterior a R2 | Passa | Passa |
| `1604254`, atual | Passa | `max abs(x) = 0.7950001955032349 m`, `final x = 0.794999897480011 m`; falha |

Saída red individual: `extra=true, max drift 0.7950001955032349, final x 0.794999897480011: expected 0.7950001955032349 to be less than 0.0001`. A origem é a antecipação das forças ideais no gancho; o probe não exige corrigir o integrador da cadeia do PHY-48.

**P2: ❌ R4 — o amortecimento de uma mola independente quase anula o movimento de outra.** Em `src/sim/simulator.ts:1054–1055`, todas as molas ideais, inclusive desconectadas, entram no mesmo `solveLinear`. O helper usa a maior entrada de toda a matriz como escala, considera um pivot abaixo de `1e-12·scale` singular e acrescenta `1e-9·scale` a todas as diagonais. A identidade torna o sistema físico invertível, mas não impede que esse fallback altere os blocos independentes. A spec aceita `k > 0`, `x₀ > 0`, `c ≥ 0`; o codec aceita o valor finito usado no probe.

Prova pública: cena horizontal PHY-26, `m = 1`, `k = 40`, `c = 0`, `Δx = 0.1`, com `g = 0`. Comparar um passo da cena original com a mesma cena acrescida de uma mola independente relaxada, `k = 40`, `x0 = 1`, `c = 1e16`, entre um corpo fixo em `(10, 10)` e outro dinâmico de 1 kg em `(11, 10)`. A mola adicional permanece sem força. O esperado independente é `|vx_com_mola − vx_sem_mola| < 1e-6 m/s`.

| Produção | Resultado |
| --- | --- |
| `c62cf2f`, anterior a R2 | Passa: diferença < `1e-6 m/s` |
| `1604254`, atual | `vx_sem_mola = −0.0663900300860405 m/s`, `vx_com_mola = −3.999975319857185e−7 m/s`; falha |

Saída red individual: `solo vx -0.0663900300860405, combined vx -3.999975319857185e-7: expected 0.06638963008850851 to be less than 0.000001`. Trata-se de acoplamento numérico novo entre subsistemas fisicamente independentes, causado pelo novo uso global do helper, não por alteração de `solveLinear`.

Os três probes A/B abaixo foram inseridos temporariamente no bloco autorizado `ideal spring (PHY-26)`, antes dos casos PHY-40, usando os helpers existentes. Executados com `npx vitest run src/sim/acceptance.test.ts -t PHY-47-review-probe --reporter=json` (relatório em arquivo temporário). A troca de produção substituiu somente `pushSpring` pela versão de `c62cf2f`; o mesmo arquivo de testes foi usado nas duas execuções. Anterior: exit 0, `3 passed | 67 skipped (70)`. Atual: exit 1, `2 failed | 1 passed | 67 skipped (70)`, com as duas saídas individuais acima.

```ts
it.each([false, true])('PHY-47-review-probe R3: chain and ideal equilibrium, disconnected ideal first=%s', async (extra) => {
  const constraints: Scene['constraints'] = [
    { id: 'chain', kind: 'spring', a: { bodyId: 'left', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200, mass: 0.1 },
    { id: 'ideal', kind: 'spring', a: { bodyId: 'right', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200 },
  ]
  if (extra) constraints.unshift({ id: 'unrelated', kind: 'spring', a: { bodyId: 'dummy-a', anchor: { x: 0, y: 0 } }, b: { bodyId: 'dummy-b', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 0 })
  const sim = await load({
    version: 1, constants: { g: 0 }, forces: [], contacts: [], constraints,
    bodies: [
      { id: 'left', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: -1.1, y: 0 }, rotation: 0 },
      { id: 'right', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 1.1, y: 0 }, rotation: 0 },
      { id: 'body', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
      { id: 'dummy-a', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 10, y: 10 }, rotation: 0 },
      { id: 'dummy-b', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 11, y: 10 }, rotation: 0 },
    ],
  })
  const x = run(sim, 300, () => sim.readStates().get('body')!.position.x)
  const worst = Math.max(...x.map(Math.abs))
  console.log('PROBE METRIC ' + JSON.stringify({ probe: 'chain', extra, worst, final: x.at(-1) }))
  expect(worst, 'extra=' + extra + ', max drift ' + worst + ', final x ' + x.at(-1)).toBeLessThan(1e-4)
})

it('PHY-47-review-probe R4: disconnected high-damping spring cannot alter soft spring motion', async () => {
  const scene = horizontalScene(1, 40, X_EQ + 0.1, 0)
  scene.constants.g = 0
  const solo = await load(scene)
  const combined = structuredClone(scene)
  combined.bodies.push(
    { id: 'unrelated-fixed', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 10, y: 10 }, rotation: 0 },
    { id: 'unrelated-free', shape: 'rectangle', width: 0.2, height: 0.2, fixed: false, mass: 1, position: { x: 11, y: 10 }, rotation: 0 },
  )
  combined.constraints!.push({ id: 'unrelated', kind: 'spring', a: { bodyId: 'unrelated-fixed', anchor: { x: 0, y: 0 } }, b: { bodyId: 'unrelated-free', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 1e16 })
  const together = await load(combined)
  solo.step()
  together.step()
  const soloVx = solo.readStates().get('bloco')!.linvel.x
  const combinedVx = together.readStates().get('bloco')!.linvel.x
  console.log('PROBE METRIC ' + JSON.stringify({ probe: 'scale', soloVx, combinedVx }))
  expect(Math.abs(combinedVx - soloVx), 'solo vx ' + soloVx + ', combined vx ' + combinedVx).toBeLessThan(1e-6)
})
```

Produção e testes restaurados byte a byte em `finally`; `git diff --exit-code` confirmou diff vazio antes de registrar esta revisão. Nenhum probe virou teste permanente nesta etapa.

Mutações registradas repetidas independentemente, com saída red por teste conferida contra as tabelas do stage 2: `pushSpring` sequencial de `c62cf2f` → `4 failed | 63 skipped (67)` nos casos R2; matriz somente diagonal → `2 failed | 2 passed | 63 skipped (67)`, ambas as ordens com `c_direita = 2000`; retirar aceleração livre → `2 failed | 65 skipped (67)` nos casos R1; `pushSpring` PHY-40 de `bee7949` → `7 failed | 6 passed | 54 skipped (67)`. Cada mutação restaurada byte a byte. Após remover os probes e restaurar a produção, `acceptance.test.ts` + `simulator.test.ts` → exit 0, `2 test files passed (2)`, `96 tests passed (96)`, incluindo PHY-26/30/40/47 sem mudar tolerâncias.

Gate independente na produção intacta: `npm test && npm run lint && npm run typecheck && npm run build` → exit 0, `30 test files passed (30)`, `737 tests passed (737)`; lint e typecheck sem erros; build concluído. Apenas o aviso existente de chunk tardio > 500 kB. O gate verde não cobre R3/R4.

**Restante para o stage 2: somente ❌ R3 e ❌ R4.** Na mesma branch e seam pública, pinar a preservação do sistema cadeia → ideal ao acrescentar uma mola ideal independente no início, e a independência da dinâmica de uma mola normal ao acrescentar outra desconectada com parâmetros de escala diferente, em commit próprio red. Corrigir o novo processamento conjunto em `pushSpring`, preservando R1/R2 e os critérios 1–6; registrar a variante antes de usá-la e atualizar o item autorizado do ADR. Não ampliar a alteração para o integrador da cadeia ou para os chamadores de `solveLinear` sem encaminhar a decisão pelo fluxo de proxy da skill. Repetir mutate-verify e gate. A regra mecânica de `ticket-flow` exige reabertura porque as correções precisam de novos testes. Nenhum merge ou entrada de ledger; `Stage: to-implement` neste commit de revisão. Totais: Standards **0 achados**; Spec **2 regressões novas pendentes, R1/R2 resolvidos**.

- Stage 2 retomado (2026-10-01), somente R3/R4, na mesma branch e base `sweatshop/2026-09-24-1853`. Seam aprovada: `createSimulator(parse(scene))`, `step()` e `readStates()` no bloco PHY-26, sem mocks. `pushSpring` continua com um único chamador em `step()`; o integrador `pushChain`, o gancho e todos os outros chamadores de `solveLinear` ficam intactos. O defeito comum é tratar subsistemas independentes como uma única chamada/matriz; os corpos fixos não conectam a resposta dinâmica. Casos degenerados relevantes: grupo de uma mola, grupo só com pontas fixas, corpos fixos compartilhados e grupos conectados de molas opostas. Os novos controles R3/R4 e os testes R1/R2/PHY-40 cobrem esses caminhos.
- Variante registrada antes da implementação: descobrir em `pushSpring` o componente de molas ideais conectadas transitivamente por corpos dinâmicos; manter a ordem do documento dentro dele e resolver somente na chamada de seu primeiro membro. Usar a mesma equação `[I + diag(q)·Δt·K]F = b` por componente, com snapshot das velocidades livres antes das suas forças. Isso preserva a posição do componente cadeia → ideal quando uma mola independente é inserida antes dele, e elimina a escala global entre blocos independentes sem mudar `solveLinear`, a fórmula escalar ou o integrador da cadeia. Pontas fixas não conectam componentes; com K=0 a matriz continua sendo a identidade.
- Red permanente antes do código: `npx vitest run src/sim/acceptance.test.ts -t 'PHY-47: (chain and ideal|disconnected high-damping)'` → exit 1, `3 failed | 1 passed | 67 skipped (71)`. R3 com `extra=true`: `extra=true, max drift 0.7950001955032349, final x 0.794999897480011: expected 0.7950001955032349 to be less than 0.0001`; o controle `extra=false` passa. R4, tanto `sharedFixed=false` quanto `sharedFixed=true`: `solo vx -0.0663900300860405, combined vx -3.999975319857185e-7: expected 0.06638963008850851 to be less than 0.000001`. O caso com apoio fixo compartilhado pina a exclusão dos corpos fixos do agrupamento.
