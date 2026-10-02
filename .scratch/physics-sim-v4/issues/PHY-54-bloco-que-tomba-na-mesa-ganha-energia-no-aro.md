# PHY-54: A corda se solta da polia ideal quando o bloco passa por ela, sem ganho de energia
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: hard

- Primary files:
  - src/scene/ropePath.ts (`ropePath`, `RopeArc`)
  - src/scene/ropePath.test.ts (bloco `ropePath, kept wrap direction (PHY-45)`)
  - src/sim/simulator.ts (`RopeBinding`, `ropeFrame`, a montagem do `RopeBinding` em `buildWorld`)
  - src/sim/acceptance.test.ts (bloco `rope over a fixed pulley (PHY-23)`)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (seção `The rim and the kept wrap direction (PHY-45)`)

#### What to build

Quando um bloco puxado pela corda passa por cima de uma polia ideal e segue além dela, a corda sai da polia e fica reta entre as pontas, como uma corda de verdade. Hoje ela dá quase uma volta inteira no disco, e o sistema ganha centenas de joules.

O caso é o que o PHY-45 deixou fora do escopo: "a corda que se solta da polia (a corda reta passa livre do disco, as duas pontas além da tangente, do lado do enrolamento)". Com `keep`, a direção do enrolamento nunca muda. Quando a varredura do arco chega a 0 e passa, ela cruza a costura 0/2π, e o comprimento salta perto de 2πR. O pull-back de 20% e o warm start viram um puxão de centenas de newtons.

Medido com um probe descartável no `Simulator` público, sobre `0ab2f57`, cena da mesa do PHY-23 com polia ideal (mesa 8 × 1 com o topo em y = 0, bloco `a` 0,4 × 0,4 em (−2; 0,2) com a corda no meio da face direita, bloco `b` 0,3 × 0,3 em (4,4; −1,5), polia r = 0,2 em (4,2; 0)), 600 passos:

- 1/2 com μ = 3: o bloco tomba (correto, T > m₁·g), rola pela mesa e bate no aro. No passo 129 ele passa por cima da polia: a varredura vai de 0,17 para 5,90 rad, o comprimento do caminho pula 0,69 m, `T` vai a 556 N e a energia dos blocos sobe 440 J num passo. Os outros picos (passos 176, 288, 399, 428) são o mesmo salto. Máximo: +733 J no passo 400.
- Não depende do tombo. Toda cena em que o bloco chega à polia ganha energia; a grade do critério 2 vai de +519 J a +2710 J.

**Caminho.** Cada polia guarda, além da direção (`keep`), a **varredura desenrolada** da última leitura das poses reais. A varredura nova é a anterior mais `wrapAngle(bruta − anterior)`, então ela não salta na costura:

- Varredura negativa: a corda saiu da polia. O caminho é a perna reta entre os vizinhos, como se a polia não estivesse ali; a polia não puxa nada, e não entra no comprimento. A varredura continua sendo acompanhada pela construção com a direção guardada, então ela volta a 0 e a corda reengata do mesmo lado, sem salto.
- Várias polias: as pernas e a varredura de uma polia engatada vêm da construção sobre as polias engatadas, cada varredura desenrolada contra o próprio histórico. A varredura de uma polia solta, que serve para ver o reengate, é medida na construção sobre as engatadas mais ela.
- A polia solta fica no caminho como a junção de dois segmentos colineares e opostos sobre a perna reta que passa por ela, então o número de segmentos continua sendo o de arcos mais um e o puxão dela soma 0. A junção é o ponto da perna mais perto do centro, com o parâmetro da perna limitado a [¼, ¾]: sem o limite, quando o centro se projeta além da ponta, o segmento da ponta fica com comprimento 0, `unit()` devolve 0 e a ponta deixa de ser puxada, sem que a energia mostre.
- Varredura acima de 2π: a corda dá mais de uma volta, e o comprimento segue contínuo, em vez de cair 2πR.
- As poses previstas (meio e fim do passo) leem a varredura guardada e não a atualizam, como já fazem com `keep`.
- A interface: `ropePath(a, b, pulleys, keep?, sweeps?)`, com `sweeps[i]` a varredura anterior da polia `i`; `RopeArc.sweep` passa a ser a varredura desenrolada (pode ser negativa ou passar de 2π) quando há histórico. `RopeBinding.sweeps` guarda os valores, nasce da varredura nas poses do documento e é atualizado onde `keep` é. Uma polia sem histórico (`sweeps` ausente, ou `undefined` na posição dela) faz o que faz hoje: é assim que o `scenePath` continua chamando. Uma corda com algum grip não recebe histórico em nenhuma polia, porque `pieceLengths` soma `R·sweep` de cada arco sem massa dentro da peça, e uma varredura negativa ali tiraria as peças do comprimento do caminho.

Protótipo descartável sobre `0ab2f57` (pós-processamento em `ropeFrame`, só polias ideais): os 11 cenários do critério 2 ficam todos em 0 J, e a suíte inteira fica verde (797 testes). No nível da geometria, com uma polia em (0, 0), R = 1, `keep = [−1]`, `a = (−3, h)` e `b = (3, h)`, subindo `h` de 0,9 a 1,1 e voltando em passos de 0,001: o maior salto de comprimento entre amostras é 6,7·10⁻⁵ m com o histórico, contra 2π sem ele..

Rejeitado: só desenrolar a varredura, sem trocar o caminho pela perna reta (comprimento = pernas tangentes + R·varredura negativa). 3 dos 11 cenários seguem ganhando energia: 1/4 com μ = 3 (+1749 J), 2/1 com μ = 0,2 (+24 J) e 2/1 com μ = 0,2 e `a` lançado a 6 m/s (+91 J).

**Fora do escopo:**
- Polia com massa, e qualquer corda que tenha uma. O mesmo salto acontece lá (1/2 com μ = 3 e `M = 2`, passo 156: varredura de 0,28 para 5,67 rad, `T` = 2687 N), mas a corda que sai do disco junta as duas peças numa só, e o comprimento de cada peça deixa de ser fixo. Vai para o PHY-55, depois do PHY-52. Aqui uma corda com grip mantém a aritmética de hoje em todas as polias.
- O desenho (`scenePath`) não guarda histórico. Depois que a corda se solta, o desenho continua passando pela polia, e com os blocos caindo a corda desenhada sobe até ela e volta. Vai para o PHY-56.
- Uma corda solta cujo segmento reto passa para o outro lado do disco sem tocá-lo (pela ponta do segmento) reengataria com a direção guardada. Duas polias soltas na mesma perna, com as projeções presas na mesma ponta, também ficam de fora. Nenhum cenário medido chega lá.

#### Acceptance criteria

1. `ropePath` com histórico de varredura, chamado direto, cada chamada recebendo a varredura da anterior:
   1. Polia em (0, 0), R = 1, `keep = [−1]`, `a = (−3, h)`, `b = (3, h)`, com `h = 0,9 + k·0,001` para `k` inteiro de 0 a 200 e de volta a 0. O comprimento entre amostras vizinhas nunca muda mais de 0,001 m. Com `h ≥ 1,001`, a varredura é negativa, o comprimento é `|a − b|` a 10⁻⁹, e a junção da polia fica dentro da perna `a–b`, com os dois segmentos colineares e opostos. Na volta, com `h ≤ 0,999`, a direção é −1 e o comprimento é o de `ropePath` sem histórico para o mesmo `h`, a 10⁻⁹.
   2. Polia em (0, 0), R = 1, `keep = [−1]`, `a = (−3; 0,5)`, `b = 2·(cos θ, sin θ)`, com θ de 0 a −(2π + 1) em passos de 0,001: a varredura passa de 2π, e entre amostras vizinhas `|ΔL| ≤ |Δb| + 10⁻⁹`. Medido no protótipo: a varredura vai de 0,69 a 7,98 rad.
   3. Uma corda sobre duas polias cuja ponta passa por cima da primeira: o comprimento entre amostras vizinhas nunca muda mais de 0,001 m, e depois de soltar ele é o de `ropePath` sem a primeira polia, a 10⁻⁹.
   4. Uma polia solta cujo centro se projeta além de uma ponta da perna reta: os dois segmentos das pontas têm comprimento positivo, e os dois segmentos da polia são colineares e opostos.
   5. `ropePath(a, b, pulleys, keep, [undefined])` é `toStrictEqual` a `ropePath(a, b, pulleys, keep)`, e os testes existentes de `ropePath.test.ts` ficam como estão.
2. Cena da mesa do PHY-23 com polia ideal, 600 passos, nos 11 cenários (m₁/m₂, μs = μk = μ, `vx` inicial de `a`): 1/2, 1/3, 1/4, 2/3 e 1/1,5 com μ = 3; 1/2 com μ = 1 e com μ = 0,5; 2/1 com μ = 0,2; 2/1 com μ = 0,2 e `vx = 6`; 1/2 com μ = 3 e `vx = 4`; 1/1 com μ = 0,1 e `vx = 8`. Em cada um, a energia dos blocos, `Σ (½m·v² + ½I·ω² + m·g·y)` com `I = m·(w² + h²)/12`, nunca passa de `E₀ + 0,5 J`. Hoje: de +519 J a +2710 J.
3. Os testes existentes ficam verdes sem mudar tolerância, incluindo os 24 cenários do PHY-45, as cenas da mesa do PHY-23, o PHY-24, o PHY-25 e o PHY-41.
4. O ADR-0004, na seção do PHY-45, diz que cada polia ideal guarda a varredura desenrolada; que varredura negativa é corda solta (perna reta, sem puxão na polia), com a regra das várias polias; que acima de 2π o comprimento segue contínuo; e que uma corda com polia com massa fica de fora (PHY-55). O comentário de `RopeArc.sweep`, que hoje diz `[0, 2π)`, diz o mesmo. Conferido por grep na Verification.
5. Mutate-verify conforme o `AGENTS.md`, com o registro no ticket:
   - tirar o histórico (varredura bruta, como hoje): o critério 2 fica vermelho (medido: os 11);
   - desenrolar sem trocar pela perna reta: o critério 2 fica vermelho em pelo menos um cenário (medido: 1/4 com μ = 3 e os dois 2/1 com μ = 0,2);
   - junção sem o limite [¼, ¾]: o item 4 do critério 1 fica vermelho.

#### Verification

    npx vitest run src/scene/ropePath.test.ts
    npx vitest run src/sim/acceptance.test.ts -t PHY-54
    grep -n "PHY-55" docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/ropePath.test.ts`, chamando `ropePath` direto: os itens 1 a 4 do critério 1, vermelhos hoje porque o quinto argumento é ignorado e o comprimento salta perto de 2π na costura. O item 5 é guarda e fica registrado como tal.
- `src/sim/acceptance.test.ts`, pelo motor público (`createSimulator(parse(scene))`), sem mocks: os 11 cenários do critério 2 num `it.each` no bloco do PHY-23, vermelhos hoje pela energia.

## Comments

- 2026-10-01 Aberto na triagem do PHY-52. A investigação do PHY-52 achou a divergência com `M = 2`, e o proxy conferiu com polia ideal num probe descartável. Nada foi commitado.
- 2026-10-01 Stage 1. Probes e protótipo descartáveis sobre `0ab2f57`; nada commitado. Causa (a varredura cruza a costura 0/2π com a direção guardada), caminho e critérios acima.
- 2026-10-01 Proxy decided: corte em dois, este ticket só para cordas sem polia com massa; a corda com grip, inclusive a mista, vai para o PHY-55 — `pieceLengths` somaria a varredura negativa de uma polia ideal dentro da peça, e nenhum critério mede corda mista.
- 2026-10-01 Proxy decided: o histórico mora em `ropePath` (quinto parâmetro `sweeps?`), não num pós-processamento em `ropeFrame` — é o módulo de geometria pura, o critério 1 o chama direto, e o PHY-56 pode reaproveitá-lo.
- 2026-10-01 Proxy decided: regra das várias polias e junção limitada a [¼, ¾], com os itens 3 e 4 do critério 1 — o protótipo misturava pernas de uma construção com varreduras de outra, e a junção na ponta da perna zera o puxão nela sem que a energia mostre.
- 2026-10-01 Proxy decided: a varredura acima de 2π entra aqui (item 2 do critério 1) — sai da mesma linha de desenrolar, e deixá-la de fora pediria código a mais para recriar a queda de 2πR.
- 2026-10-01 Proxy decided: o desenho fica para um ticket à parte, o PHY-56 — não é gosto (desenhar o que a física faz), mas é outra costura, do simulador até o `scenePath`.
- 2026-10-01 Proxy decided: `Difficulty: hard`, `Review: agent` — critérios que interagem, lógica numérica numa função com muitos chamadores, nada de gosto.
