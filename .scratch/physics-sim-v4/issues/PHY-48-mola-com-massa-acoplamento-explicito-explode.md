# PHY-48: Mola com massa acoplada implicitamente aos corpos, no solve em grupo das molas
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`chainStep`, `pushChain`, `pushSpring`, o laço das molas em `step()`, `chainLag`)
  - `src/sim/acceptance.test.ts` (bloco `with mass (PHY-30)` e os helpers de cena que ele já usa)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (seção Springs)

#### What to build

Uma mola com massa (PHY-30) não explode mais com amortecimento alto nem quando é rígida contra um corpo leve. Ela também fica equilibrada quando divide um corpo com outras molas.

Hoje as pontas entram no `chainStep` como pontos prescritos, que seguem com a velocidade de agora. As forças `fa`/`fb` que saem do passo vão para os corpos como força externa explícita (`addForceAtPoint` em `pushChain`). Cada elo da cadeia carrega `(N + 1)·k` e `(N + 1)·c`, com `N = CHAIN_NODES = 8`. Com `c` alto, ou com `k` alto contra uma massa pequena, o elo da ponta fica mais duro do que um passo explícito aguenta, e a mola injeta energia. O interior da cadeia já é implícito (θ-método); o que falta é a ponta.

Medido no motor real (`parse` → `createSimulator` → `step` → `readStates`), na cena horizontal do bloco PHY-26 (`horizontalScene`): `m = 1`, `k = 40`, `x₀ = 1`, `mₛ = 0,1`, bloco solto parado em `Δx = 0,1`, `E₀ = 0,2 J`, 600 passos. `E = ½m·v² + ½k·Δx²` do bloco.

| `c` | `max E` hoje | Protótipo G |
| --- | --- | --- |
| 0 | 0,2006 J | 0,2006 J |
| 20, 30, 50, 80 | 0,1995 J | 0,1992 J |
| 100 | 8,0·10⁴ J (±270 m/s) | 0,1992 J |
| 150, 200, 2000 | 8,3·10⁴ J | 0,1993 a 0,1999 J |

O caso rígido e leve (`m = 0,01`, `k = 400`, `mₛ = 0,001`, `c = 0`, `E₀ = 2 J`) chega a 15 200 J hoje, mesmo sem amortecimento.

**A decisão: método G.** Cada ponta dinâmica de uma mola com massa vira uma linha do solve em grupo que `pushSpring` já monta para as molas ideais (PHY-47). O grupo passa a juntar toda mola, ideal ou com massa, que divide um corpo dinâmico com outra. Para uma cadeia:

1. A cadeia é resolvida com as velocidades das pontas prescritas como `W` no fim do passo. A posição da ponta é `at + Δt·((1 − θ)·v + θ·W)`, e `W` parte de `freePointVelocity` ao longo do eixo (gravidade e forças já somadas no passo).
2. O passo da cadeia é linear em `W`. Três execuções (base, `W_a + 1`, `W_b + 1`) dão `f₀` e `∂f/∂W` exatos para as duas pontas.
3. Cada ponta dinâmica entra na matriz como `F − (∂f/∂W)·Δt·Σ K·F = f₀`, com `K` de `ropeInvMass` entre as linhas, como as molas ideais já entram. Ponta fixa não vira linha.
4. Depois do solve, a cadeia roda uma última vez com os `W` que as forças resolvidas dão. Essa execução grava `chain.p`/`chain.w`, e `chain.force` recebe a força aplicada em cada ponta. O rebase de depois do `world.step()` (PHY-42) continua.

`CHAIN_THETA = 0,55` e o atraso `(θ − 1 + φ)·Δt` ficam como estão. O stage 2 pode recalibrar os dois se precisar, desde que os testes do PHY-30 e do PHY-42 fiquem verdes sem mudar tolerância e o ADR registre o motivo. Cordas que dividem o corpo com uma mola continuam fora do grupo.

**Por que não as outras formas** (protótipo descartável, sobre `7eb1a94`; nada commitado):

- **A, cadeia sozinha com as pontas no solve θ** (massa `1/K`): resolve a explosão, mas cada cadeia lê a velocidade livre do corpo depois das molas já empurradas. Com duas molas no mesmo corpo, a ordem importa: 30 mm de deriva, e os dois casos de `PHY-47: chain and ideal spring stay balanced with disconnected ideal first=…` ficam vermelhos. Tirar uma foto das velocidades livres antes de todas as molas remove a deriva, mas explode quando o corpo é solto (8·10⁴ J), porque cada mola age como dona do corpo. Com a velocidade de agora em vez da livre, o equilíbrio pendurado erra 167%.
- **B, denominador implícito no elo da ponta** (como o PHY-47): enxerga o `9c` do elo em vez do `c` da mola. Superamortece (−3,7% no passo 600 com `c = 200`), quebra `F_b − F_a ≈ mₛ·a/2` do PHY-30 e deriva 56 mm com duas molas.

O G passou em todas as medições abaixo e nos 100 testes de `acceptance.test.ts` e `simulator.test.ts`, sem mudar tolerância.

| Medição | Hoje | G |
| --- | --- | --- |
| Superamortecido, `mₛ = 0,001`, `c = 200`: erro nos passos 60 / 600 | diverge | −0,03% / −0,30% |
| Idem, `c = 2000` | diverge | −0,01% / −0,08% |
| Rígida e leve, `max E` | 15 200 J | 2,471 J (1,24·E₀) |
| Pendurada, `c = 200`, `mₛ = 0,2`, 6000 passos: erro do equilíbrio | −469% | −0,11% |
| Duas molas com massa opostas no mesmo corpo, `c = 200`: deriva | 0 | 0 |
| Idem, corpo solto em `x = 0,1`: `max E` (`E₀ = 0,4`) | 8·10⁴ J | 0,398 J |
| Barra livre, `g = 0`, `c = 200`: `max E` (`E₀ = 0,2`) | 8,7·10⁴ J | 0,1988 J |

As duas pontas no mesmo corpo ficam cobertas pela estrutura do solve (o termo cruzado de `K`), mas sem critério: uma mola presa ao próprio corpo só faz força interna.

#### Acceptance criteria

1. Cena horizontal, `m = 1`, `k = 40`, `mₛ = 0,1`, bloco solto parado em `Δx = 0,1`, para cada `c` ∈ {0, 20, 30, 50, 80, 100, 150, 200, 2000}: `E = ½m·v² + ½k·Δx²` nunca passa de `1,02·E₀` em 600 passos, e para `c > 0` o `E` do passo 600 fica abaixo de `E₀`
2. Mesma cena com `mₛ = 0,001`: com `c = 200` e com `c = 2000`, o `Δx` nos passos 60 e 600 fica a menos de 1% do oscilador ideal amortecido (0,081939 / 0,013520 e 0,098021 / 0,081874, os valores do PHY-47)
3. Mesma cena com `m = 0,01`, `k = 400`, `mₛ = 0,001`, `c = 0`, solta em `Δx = 0,1` (`E₀ = 2 J`): `max E ≤ 1,3·E₀` em 600 passos
4. Mola com massa pendurada do teto (como o teste PHY-30 que já existe), com `c = 200` e `mₛ = 0,2`: depois de 6000 passos, o equilíbrio fica a menos de 2% de `(m + mₛ/2)·g/k` abaixo do comprimento natural
5. Duas molas com massa iguais (`k = 40`, `x₀ = 1`, `mₛ = 0,1`, `c = 200`), de âncoras fixas opostas até o mesmo bloco de 1 kg, com `g = 0`: em repouso, o bloco não se afasta mais de 0,1 mm do centro em 300 passos, nas duas ordens das molas no documento. Solto em `x = 0,1`, `½m·v² + ½(2k)·x²` nunca passa de `1,02·E₀`
6. Barra livre (1 m × 0,1 m, 1 kg, `g = 0`) com uma mola com massa (`k = 40`, `x₀ = 1`, `mₛ = 0,1`, `c = 200`) da ponta da barra, perpendicular a ela, até uma âncora fixa, solta esticada: a energia `½m·v² + ½I·ω² + ½k·Δx²` nunca passa de `1,02·E₀` em 600 passos
7. Os testes existentes de `acceptance.test.ts` e `simulator.test.ts` continuam verdes sem mudar tolerância, incluindo o bloco PHY-30, o PHY-42 e os `PHY-47: chain and ideal spring stay balanced…`
8. O ADR-0004 descreve a mola com massa no solve em grupo e por que a cadeia sozinha (A) e o denominador no elo (B) não bastaram. Também registra que as duas pontas no mesmo corpo ficam cobertas pelo termo cruzado de `K`
9. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, incluindo a mutação que volta ao acoplamento explícito (`chainStep` com pontas prescritas na velocidade de agora e `fa`/`fb` aplicadas com `addForceAtPoint`, como hoje)
10. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-48
    npx vitest run src/sim/acceptance.test.ts -t PHY-30
    npx vitest run src/sim/acceptance.test.ts -t PHY-47
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `with mass (PHY-30)`, pelo motor público (`createSimulator(parse(scene))`, `step()`, `readStates()`, `readConstraints()`), sem mocks: os casos dos critérios 1 a 6. Vermelhos hoje porque a energia explode: 8·10⁴ J a partir de `c = 100` (critério 1), divergência no superamortecido (2), 15 200 J no rígido (3), equilíbrio errado em 469% (4), 8·10⁴ J com o par solto (5) e 8,7·10⁴ J na barra (6). O caso em repouso do critério 5 já passa hoje e serve de guarda contra a dependência de ordem do método A.

## Comments

- 2026-09-30 Aberto a partir do review de benchmark do PR 9. O defeito veio do gpt-6-astra (high), o limiar foi medido por mim com probes descartáveis no motor real, sobre `0ff2047`. Nada foi commitado e nenhum protótipo foi feito para este caminho.
- 2026-10-01 Stage 1, com grilling. Um protótipo descartável sobre `7eb1a94` mediu três métodos (A, B, G), e o Bruno escolheu G. Decisões: só molas entram no grupo (cordas ficam fora); θ continua 0,55, e o limite do critério 3 passou de 1,2 para 1,3·E₀ em vez de recalibrar θ, porque com θ = 0,6 o pico cai para 1,11·E₀, mas a energia no passo 600 com `c = 0` cai de 0,1962 para 0,1922 J; um ticket só, porque o A sozinho deixa um teste existente vermelho. Nada do protótipo foi commitado.
