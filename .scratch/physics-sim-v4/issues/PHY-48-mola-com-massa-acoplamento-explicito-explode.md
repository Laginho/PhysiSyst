# PHY-48: Mola com massa acoplada implicitamente aos corpos, no solve em grupo das molas
Stage: done
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
- 2026-10-01 Stage 2 concluído. Commits: teste red `025c038` (13 de 20 vermelhos hoje, os 7 verdes são `c` ≤ 80 e o par em repouso, como previsto), código `80d33b9` (só `simulator.ts` e ADR-0004, nenhum teste), teste extra `dd3f566` (abaixo). Gate: 791 testes, lint, typecheck e build verdes; `acceptance.test.ts` e `simulator.test.ts` sem mudar tolerância (146 verdes), incluindo PHY-30, PHY-42 e PHY-47. `pushChain` saiu: `pushSpring` agrupa toda mola que divide corpo dinâmico, ideal ou com massa, e devolve os rebases das cadeias. `CHAIN_THETA` e o atraso ficaram como estavam.
- Mutate-verify (mutação aplicada no `simulator.ts` commitado, testes rodados, mutação revertida com `git checkout`):
  - **Acoplamento explícito (critério 9):** pontas da cadeia na velocidade de agora (`free = [v[0], v[último]]`) e derivadas `d = 0`, forças `f₀` aplicadas direto. 13 vermelhos: `PHY-48: … c = 150 / 200 / 2000` (critério 1), os 4 `overdamped` (2), o rígido e leve (3), o pendurado (4), o par solto `reverse=false/true` (5), a barra (6), e o PHY-30 `with mass the readout is the force each end got`. Os `c = 100` e os em repouso não distinguem essa mutação.
  - **Cada mola sozinha (`springs = [s]`, sem grupo):** 8 vermelhos, entre eles os dois `PHY-48: at rest … reverse=false/true` e os 6 `PHY-47: opposite springs…` / `chain and ideal spring…`. É a dependência de ordem do método A.
  - **Sem o termo da outra ponta (cada linha só vê a velocidade da própria ponta):** sobrevivia a todos os 146 testes. Não é equivalente: com as duas pontas em corpos leves a mola explode. Teste novo `PHY-48: both ends on light free blocks`, em commit só de teste (`dd3f566`), verde no código e, com a mutação, vermelho em `c = 200` (1,65·10⁴ J) e `c = 2000` (1,64·10⁴ J); `c = 0` passa nos dois.
- O teste `dd3f566` veio depois do commit de código porque a mutação sobrevivente só apareceu na verificação. Não é um critério novo: cobre o caso de duas pontas dinâmicas do critério 5 e do 6 por outro lado.

#### Stage 3 review (2026-10-01)

Fixed point: `sweatshop/2026-10-01-1211` (`0aac00c`), diff `0aac00c...81283d5`. Gate independente antes da revisão: 30 arquivos e 791 testes verdes, lint, typecheck e build verdes.

##### Standards

Duas pendências pequenas corrigidas nesta etapa: o ADR agora restringe `[I + diag(q)*dt*K]F = b` aos grupos só de molas ideais e remete os grupos mistos às derivadas; a evidência de mutate-verify passa a identificar cada novo caso, incluindo os cinco casos horizontais `c = 0 / 20 / 30 / 50 / 80` que preservam comportamento anterior e o caso de duas pontas livres com `c = 0`. Sem alteração de código de produção ou de testes no fix de revisão. Não há outro desvio documentado nem smell que demande CLEAN.

Separação de commits confirmada: `025c038` tem testes e `Stage: implementing`; `80d33b9` tem apenas `simulator.ts` e ADR; `dd3f566` tem apenas o teste que cobre a mutação sobrevivente descrita acima. Esse complemento é a correção de cobertura prevista pela regra de mutação/harness do `ticket-flow`.

##### Spec

Nenhum requisito numerado ausente, comportamento incorreto ou escopo adicional encontrado. Os sinais das derivadas e das velocidades das duas pontas, o snapshot de velocidade livre por grupo, as linhas só para pontas dinâmicas e o rebase foram conferidos. A equação ideal, `CHAIN_THETA = 0,55`, o atraso e as tolerâncias existentes foram preservados. Não há decisão de proxy neste ticket.

##### Mutate-verify reproduzido no stage 3

Todas as mutações abaixo foram aplicadas só em `src/sim/simulator.ts`, executadas no motor público e revertidas restaurando os bytes originais em `finally`; `git diff --exit-code` confirmou a restauração.

- **M-base:** substituição temporária de `simulator.ts` pelo conteúdo de `0aac00c:src/sim/simulator.ts`. Reproduz exatamente `pushChain` com pontas na velocidade atual e forças explícitas via `addForceAtPoint` (critério 9), em vez de apenas aproximar o caminho antigo. `npx vitest run src/sim/acceptance.test.ts -t PHY-48`: 15 vermelhos e 8 verdes. Nos 20 casos de `025c038`, são os 13 vermelhos e 7 verdes relatados no stage 2; os dois vermelhos adicionais são as pontas livres com `c = 200 / 2000`.
- **M-vel:** repetição da mutação registrada no stage 2: `free = [v[0], v[último]]`, ambos os `d = 0`, mantendo a execução final da cadeia. `npx vitest run src/sim/acceptance.test.ts src/sim/simulator.test.ts`: 16 vermelhos e 131 verdes. O teste adicional de pontas livres com `c = 0` fica vermelho (`0,840302 J > 0,816000 J`), embora passe com M-base e M-cross.
- **M-group:** `const springs = [s]`. Mesma execução dos dois arquivos: 8 vermelhos e 139 verdes. Ambos os casos em repouso do PHY-48 medem `0,0302681 m > 0,0001 m`, e os seis casos de equilíbrio do PHY-47 também falham.
- **M-cross:** `couple: slope('a').slice(0, 1)` e `couple: slope('b').slice(1)`, removendo a derivada da outra ponta em cada linha. Mesma execução dos dois arquivos: 2 vermelhos e 145 verdes, os casos de pontas livres com `c = 200 / 2000`.
- **M-sign:** complemento da evidência que faltava nos cinco casos horizontais de preservação: `applyPulls(row.pulls, -forces[i]!, false)`, invertendo a força aplicada pelo caminho de produção. `npx vitest run src/sim/acceptance.test.ts -t 'PHY-48: m = 1.*c = (0|20|30|50|80):'`: os 5 selecionados ficam vermelhos (113 ignorados pelo filtro). Os testes detectam energia acima do limite; não houve teste novo nem mudança de tolerância.

Correção da contagem do comentário do stage 2: os dois arquivos atuais somam **147** testes (`acceptance.test.ts`: 118; `simulator.test.ts`: 29), não 146. O gate completo soma 791.

Cada um dos 23 novos casos tem a mutação e a primeira linha da saída vermelha abaixo:

| Teste público (`PHY-48` em `acceptance.test.ts`) | Mutação | Saída vermelha |
| --- | --- | --- |
| m = 1, k = 40, mₛ = 0.1, c = 0: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-sign | `AssertionError: max E 261848141.1791719: expected 261848141.1791719 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 20: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-sign | `AssertionError: max E 294928333.5680908: expected 294928333.5680908 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 30: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-sign | `AssertionError: max E 299208130.35883427: expected 299208130.35883427 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 50: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-sign | `AssertionError: max E 303228602.3602604: expected 303228602.3602604 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 80: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-sign | `AssertionError: max E 305720403.8711289: expected 305720403.8711289 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 100: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-base | `AssertionError: max E 79950.4987652264: expected 79950.4987652264 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 150: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-base | `AssertionError: max E 82520.79202436507: expected 82520.79202436507 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 200: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-base | `AssertionError: max E 82760.81065216474: expected 82760.81065216474 to be less than or equal to 0.20399990272523114` |
| m = 1, k = 40, mₛ = 0.1, c = 2000: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0 | M-base | `AssertionError: max E 83228.84952304573: expected 83228.84952304573 to be less than or equal to 0.20399990272523114` |
| overdamped c=200, mₛ = 0.001, step 60: displacement follows the ideal damped oscillator within 1% | M-base | `AssertionError: displacement 5.259454917907715 at step 60: expected 5.177515917907715 to be less than 0.00081939` |
| overdamped c=200, mₛ = 0.001, step 600: displacement follows the ideal damped oscillator within 1% | M-base | `AssertionError: displacement -15.128660964965821 at step 600: expected 15.14218096496582 to be less than 0.0001352` |
| overdamped c=2000, mₛ = 0.001, step 60: displacement follows the ideal damped oscillator within 1% | M-base | `AssertionError: displacement 12.59172077178955 at step 60: expected 12.49369977178955 to be less than 0.00098021` |
| overdamped c=2000, mₛ = 0.001, step 600: displacement follows the ideal damped oscillator within 1% | M-base | `AssertionError: displacement 12.097655487060546 at step 600: expected 12.015781487060547 to be less than 0.0008187400000000001` |
| stiff spring against a light block (m = 0.01, k = 400, mₛ = 0.001, c = 0): energy stays below 1.3·E₀ for 600 steps | M-base | `AssertionError: max E 15176.397087353662: expected 15176.397087353662 to be less than or equal to 2.599998760223534` |
| heavily damped spring with mass (c = 200, mₛ = 0.2) hangs at (m + mₛ/2)g/k below its natural length within 2% after 6000 steps | M-base | `AssertionError: stretch -0.9950000762939455, expected 0.26977500000000004: expected 1.2647750762939456 to be less than or equal to 0.005395500000000001` |
| at rest the block stays within 0.1 mm of the center for 300 steps, reverse=false | M-group | `AssertionError: max drift 0.03026811219751835: expected 0.03026811219751835 to be less than 0.0001` |
| at rest the block stays within 0.1 mm of the center for 300 steps, reverse=true | M-group | `AssertionError: max drift 0.03026811219751835: expected 0.03026811219751835 to be less than 0.0001` |
| released at x = 0.1 the energy ½m·v² + ½(2k)·x² never passes 1.02·E₀, reverse=false | M-base | `AssertionError: max E 80025.29321188401: expected 80025.29321188401 to be less than or equal to 0.4080000121593476` |
| released at x = 0.1 the energy ½m·v² + ½(2k)·x² never passes 1.02·E₀, reverse=true | M-base | `AssertionError: max E 80025.29321188401: expected 80025.29321188401 to be less than or equal to 0.4080000121593476` |
| both ends on light free blocks (m = 0.1, k = 40, mₛ = 0.1, c = 0): energy ½m·(v₁² + v₂²) + ½k·Δx² never passes 1.02·E₀ in 600 steps | M-vel | `AssertionError: max E 0.8403020194873876: expected 0.8403020194873876 to be less than or equal to 0.8160003890991675` |
| both ends on light free blocks (m = 0.1, k = 40, mₛ = 0.1, c = 200): energy ½m·(v₁² + v₂²) + ½k·Δx² never passes 1.02·E₀ in 600 steps | M-cross | `AssertionError: max E 16497.515054249747: expected 16497.515054249747 to be less than or equal to 0.8160003890991675` |
| both ends on light free blocks (m = 0.1, k = 40, mₛ = 0.1, c = 2000): energy ½m·(v₁² + v₂²) + ½k·Δx² never passes 1.02·E₀ in 600 steps | M-cross | `AssertionError: max E 16367.934150065706: expected 16367.934150065706 to be less than or equal to 0.8160003890991675` |
| free bar held at its end by a spring with mass (c = 200) perpendicular to it: energy ½m·v² + ½I·ω² + ½k·Δx² never passes 1.02·E₀ in 600 steps | M-base | `AssertionError: max E 88856.15548541174: expected 88856.15548541174 to be less than or equal to 0.20400009727479188` |

- 2026-10-01 Review ended at reviewing (timeout); branch phy/PHY-48-mola-massa-solve-em-grupo holds the review; left for a human
- 2026-10-01 Foreman: the review timed out at 20m right before its final gate and merge, no defect found; its commit 8c11a34 stays on the ticket branch. Back to `to-review` for a fresh stage 3 (driver relaunched with -ReviewMinutes 40).

#### Resolution (2026-10-01)

Verdict: Approve

Retomada da etapa 3 após o timeout, com sub-agentes independentes nos eixos Standards e Spec. Diff original fixado em `git diff 0aac00c1193ee6142fa4044d3d78c66899631ea2...edb34e0`; re-review de `8c11a34..edb34e0`. Esse último diff apenas devolve o Stage a `to-review`. As duas correções da revisão anterior foram confirmadas, sem omissão adicional encontrada naquela revisão. Nenhuma alteração de produção, testes ou tolerâncias nesta retomada; nenhuma decisão de proxy.

##### Standards

0 achados. ADR-0004 distingue a equação dos grupos só de molas ideais daquela dos grupos mistos, e a evidência de mutação identifica os 23 casos novos individualmente. Primary files e separação entre commits respeitados: `025c038` contém testes e `Stage: implementing`; `80d33b9` contém apenas `simulator.ts` e ADR; `dd3f566` é o complemento só de testes após a mutação sobrevivente, conforme a exceção de correção de cobertura/harness do fluxo. Nenhum smell que justifique mudança.

##### Spec

0 achados; critérios 1–10 atendidos. Os testes pelo motor público cobrem os parâmetros, durações e limites dos critérios 1–6. Método G conferido: snapshot das velocidades livres por grupo, derivadas e sinais das duas pontas, linhas somente para pontas dinâmicas, execução final da cadeia e rebase depois de `world.step()`. A equação ideal, `CHAIN_THETA`, atraso e tolerâncias existentes foram preservados. O solver também recebe corretamente um grupo sem linhas dinâmicas. O ADR registra o solve em grupo, as alternativas A/B e o termo cruzado de `K` para as duas pontas no mesmo corpo.

##### Red-green e validação

Evidência red-green preservada da revisão `8c11a34`, detalhada por teste acima: M-base repõe exatamente o acoplamento explícito e produz 15 vermelhos/8 verdes no filtro PHY-48; M-group detecta ambos os casos em repouso; M-cross detecta as pontas livres amortecidas; M-vel detecta as pontas livres sem amortecimento; M-sign detecta os cinco casos horizontais de preservação. Nenhuma mutação ou teste novo foi necessário nesta retomada. O green independente no head integrado inclui todos esses testes e os existentes de PHY-30, PHY-42 e PHY-47.

Gate independente sobre `56d6104`: `npm test && npm run lint && npm run typecheck && npm run build`, com `VITEST_MAX_WORKERS=1` somente no ambiente dessa chamada, restaurado ao terminar. **30 arquivos e 793 testes verdes**, suíte em 109,82 s; lint, typecheck e build exit 0. Os dois arquivos do simulador somam agora 149 testes, após os dois casos do PHY-49 integrados à sessão. Apenas o aviso de build existente do chunk do simulador acima de 500 kB.

Limitação operacional registrada: duas execuções com a concorrência padrão terminaram com 792 testes verdes e o timeout de 5000 ms em `simulator.test.ts`, no teste existente `a body launched beyond the viewport…` (6601/6761 ms). Essa cena não contém molas; o teste passou isoladamente (1 verde, 28 ignorados, 3,68 s) e na suíte completa com um worker. Não houve aumento de timeout, mudança de tolerância nem configuração persistente de workers.

##### Integração e fechamento

A implementação já havia sido integrada com `--no-ff`, sem squash, em `80b4518` na sessão `sweatshop/2026-10-01-1211`; o timeout deixou pendente o fechamento. O rebase desta retomada eliminou `edb34e0`, cuja mudança de Stage já estava em `56d6104`. Conferidas as integrações posteriores de PHY-49/CLEAN-21: afetam polias, sem alterar o solve das molas, seus testes ou a seção Springs do ADR. `git merge --no-ff phy/PHY-48-mola-massa-solve-em-grupo` confirmou `Already up to date`. Resolução, linha do ledger apontando para `80b4518` e `Stage: done` registrados juntos no commit de fechamento sobre a sessão, sem push ou PR nesta etapa.

Totais: Standards 0 achados; Spec 0 achados.
