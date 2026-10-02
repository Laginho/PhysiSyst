# PHY-54: A corda se solta da polia ideal quando o bloco passa por ela, sem ganho de energia
Stage: to-implement
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
- 2026-10-02 Stage 2. Commit vermelho `3709798` (só testes, `Stage: implementing`): 4 dos 5 testes de `ropePath.test.ts` e os 12 de `acceptance.test.ts -t PHY-54` vermelhos contra `f2f6d62`; o item 5 do critério 1 é guarda e passa antes. Os 11 cenários dão de +519,10 J (1/1,5 com μ = 3) a +2709,64 J (1/4 com μ = 3); 1/2 com μ = 3 dá +732,86 J, o número do ticket. O typecheck não passa nesse commit (o quinto argumento de `ropePath` não existe ainda): é o vermelho. Gate verde no commit de código `0ab658e` e neste: 831 testes.
- 2026-10-02 Mutate-verify (critério 5), cada mutação aplicada ao código de produção e desfeita com `git checkout -- <arquivo>`:
  1. Tirar o histórico (`ropeFrame` passa `undefined` como quinto argumento de `ropePath`): `acceptance.test.ts -t PHY-54`, 12 vermelhos, todos os 11 cenários (de `expected 519.10… to be less than or equal to 0.5` a `expected 2709.63…`) e o teste da corda em grupo (`expected 7.704… to be less than or equal to 7.674…`).
  2. Desenrolar sem trocar pela perna reta (em `release`, `on` começa todo verdadeiro e nenhuma polia sai): `acceptance.test.ts -t PHY-54`, 4 vermelhos: 1/4 com μ = 3 (`expected 1748.83… to be less than or equal to 0.5`), 2/1 com μ = 0,2 (`24.17…`), 2/1 com μ = 0,2 e `vx = 6` (`90.85…`) e o da corda em grupo (`7.782… to be less than or equal to 7.674…`); `ropePath.test.ts`, 3 vermelhos (itens 1, 3 e 4 do critério 1: `expected 6.00000033… to be close to 6`, `expected 12.3331392… to be close to 12.3331391…`, `expected 3.586… to be close to 2`). São os mesmos três cenários que o ticket mediu.
  3. Junção sem o limite [¼, ¾]: sem limite nenhum (`t` solto), `ropePath.test.ts` 1 vermelho, o item 4 (`expected 4 to be close to 2`); limitada a [0, 1], 1 vermelho, o mesmo item (`expected 0 to be greater than 0.1`, o segmento da ponta some).
  4. Tirar o `Math.max(0, …)` de `pieceLengths`: `acceptance.test.ts -t PHY-54`, 1 vermelho, o da corda em grupo (`expected 8.295… to be less than or equal to 7.674…`); os 11 cenários seguem verdes, porque a energia não mostra (a correção só drena).
- 2026-10-02 Um teste a mais do que o ticket listava, pela leitura em volta da mudança: `PHY-54: a rope solved in a group with a tether…` no bloco do PHY-23. `pieceLengths` soma `R·varredura` de cada arco sem massa dentro da peça, e uma corda sem grip dentro de um grupo (PHY-41) passa por ele; com a varredura negativa de uma polia solta, a peça parecia mais curta e a corda esticava 0,63 m além de L. Um bloco `c` preso a `a` por uma corda curta forma o grupo; o critério é a distância entre as pontas, `≤ L + 0,01`, que não vem do código. A correção é o `Math.max(0, …)` em `simulator.ts`.
- 2026-10-02 Candidato a `CLEAN-*`: `wrapAngle` existe duas vezes, privada em `ropePath.ts` e em `simulator.ts` (linha 442); exportar a de `ropePath.ts` e usar nos dois.

#### Review stage 3 (2026-10-02)

Verdict: Reopen — duas violações da fronteira de Primary files

Revisão do diff inteiro `git diff f2f6d62e3e9726f091f77073e62ee5691c533f9e...497fc6f`, com Standards e Spec em agentes independentes. Commits conferidos: `3709798` (testes), `0ab658e` (produção/ADR) e `497fc6f` (handoff). Os critérios numerados passam; a reabertura é pela regra de fronteira do `ticket-flow`, não por um critério novo. O texto dos critérios e a lista de Primary files permanecem como aprovados.

##### Standards

- ❌ **Fronteira de produção:** `src/sim/simulator.ts:470` altera `pieceLengths` com `Math.max(0, …)`, mas o Primary desse arquivo autoriza somente `RopeBinding`, `ropeFrame` e a montagem em `buildWorld`. A mutação abaixo prova que a guarda evita uma falha real de corda ideal em grupo; o comentário do stage 2 não amplia o contrato. É preciso alinhar a fronteira aprovada com essa correção necessária antes de aceitar o diff. Remover a guarda sem resolver o alongamento não atende à preservação de comportamento.
- ❌ **Fronteira dos testes:** os cinco testes novos estão no `describe('ropePath, unwound sweep (PHY-54)')`, em `src/scene/ropePath.test.ts:247`, fora do bloco nomeado em Primary files, `ropePath, kept wrap direction (PHY-45)`. A costura e os casos estão aprovados; alinhar sua localização ao bloco autorizado, ou obter a alteração da fronteira pelo stage 1.
- **Possível Duplicated Code, sem bloquear:** `wrapAngle` em `ropePath.ts:78` repete a fórmula de `simulator.ts:442`. Continua como candidato de cleanup já registrado, sem refatoração neste stage.

O test-first foi respeitado: `3709798` contém somente testes e a transição de estágio; `0ab658e` não toca testes. Os testes antigos e as tolerâncias não mudaram. Sem logs acidentais, segredos ou artefatos gerados no diff. A evidência individual dos cenários de integração, antes registrada como conjunto e faixa, foi completada nas tabelas abaixo.

##### Spec

**0 achados bloqueantes; 1 limitação nova para triagem; 0 regressões anteriores demonstradas.** Critério 1: saída/reengate, volta acima de 2π, duas polias, junção interior e ausência de histórico passam. Critério 2: os 11 cenários do motor público passam com limite de 0,5 J. Critério 3: os testes existentes passam sem alteração de tolerância. Critério 4: comentário de `RopeArc.sweep` e ADR descrevem a varredura desenrolada, a perna reta, a regra múltipla, a continuidade acima de 2π e a exclusão das cordas com grip. Critério 5: todas as mutações registradas foram repetidas e ficaram vermelhas pelos motivos esperados.

Conferidas as seis decisões `Proxy decided`: corte ideal/mista (qualquer grip desativa o histórico da corda inteira); histórico no módulo puro `ropePath`; regra de várias polias e junção limitada a [¼, ¾]; varredura acima de 2π; desenho adiado para PHY-56; `Difficulty: hard` e `Review: agent`. O histórico nasce das poses do documento e somente as leituras reais o atualizam; as previsões apenas o leem. A guarda de `pieceLengths` é necessária para a corda ideal em grupo e não muda a aritmética das cordas com grip, cujo sweep permanece bruto e não negativo.

Achado adicional do eixo Spec, reproduzido pelo revisor principal com o código de produção em memória: duas polias soltas com projeções interiores em ordem inversa à sequência `via` geram segmentos que voltam. Com as pontas em (−3, 2)/(8, 2), R = 1, `keep = [−1, −1]` e polias finais em (5, 0)/(0, −3), as varreduras continuam negativas, mas as junções ficam em x = 5 e x = 0; o comprimento é 21 m e os puxões por unidade de tensão são (−2, 0)/(2, 0), em vez da perna reta de 11 m e puxões nulos. Não é o caso excluído de projeções presas na mesma ponta. Não falha os cenários numerados nem prova um comportamento anterior correto perdido; registrado separadamente no **CLEAN-25**, sem ampliar este contrato.

##### Prova red-green repetida pelo stage 3

Worktree temporário separado, com dependências por junction. No commit vermelho `3709798`, `node node_modules/vitest/vitest.mjs run src/scene/ropePath.test.ts src/sim/acceptance.test.ts -t PHY-54 --reporter=json --outputFile=phy54-red.json` deu **exit 1; 16 failed | 1 passed | 142 skipped (159)**: os quatro testes de geometria, os 11 cenários de energia e a corda em grupo falham; a guarda sem histórico já passa.

Sobre `497fc6f`, as cinco execuções abaixo mutaram a produção e deram **exit 1**. Arquivos restaurados byte a byte no `finally` de cada execução. Comandos usam `node node_modules/vitest/vitest.mjs run <arquivos> -t PHY-54 --reporter=json --outputFile=<relatório>.json`:

| Mutação de produção | Arquivos de teste | Resultado |
| --- | --- | --- |
| `ropeFrame` passa `undefined` no quinto argumento de `ropePath` | `src/sim/acceptance.test.ts` | 12 failed, 127 skipped (139); saídas por teste abaixo |
| Em `release`, `on` começa todo verdadeiro e `out` nunca encontra uma polia | `src/scene/ropePath.test.ts src/sim/acceptance.test.ts` | 7 failed, 10 passed, 142 skipped (159): 3 geometria e 4 integração |
| Em `along`, projeção sem limite | `src/scene/ropePath.test.ts` | 1 failed, 4 passed, 15 skipped (20); item 1.4: `expected 4 to be close to 2` |
| Em `along`, limite [0, 1] | `src/scene/ropePath.test.ts` | 1 failed, 4 passed, 15 skipped (20); item 1.4: `expected 0 to be greater than 0.1` |
| `pieceLengths` soma o sweep sem `Math.max(0, …)` | `src/sim/acceptance.test.ts` | 1 failed, 11 passed, 127 skipped (139); corda em grupo: `expected 8.295840125582401 to be less than or equal to 7.674159265358979` |

Saída individual de cada teste de integração na mutação **sem histórico**; os mesmos valores aparecem no commit vermelho. Cada cenário da mesa falha com `expected <ganho abaixo> to be less than or equal to 0.5`:

| m₁/m₂ | μ | vx inicial de a | Ganho de energia observado (J) |
| --- | --- | --- | --- |
| 1/2 | 3 | 0 | 732.8572494634037 |
| 1/3 | 3 | 0 | 1293.1060846818677 |
| 1/4 | 3 | 0 | 2709.6365629573615 |
| 2/3 | 3 | 0 | 1038.2062218946267 |
| 1/1,5 | 3 | 0 | 519.1031109473133 |
| 1/2 | 1 | 0 | 1172.72043731615 |
| 1/2 | 0,5 | 0 | 1038.6513094041184 |
| 2/1 | 0,2 | 0 | 648.5481489295688 |
| 2/1 | 0,2 | 6 | 1753.126787290827 |
| 1/2 | 3 | 4 | 997.2863499734576 |
| 1/1 | 0,1 | 8 | 700.7566764999923 |

A corda em grupo, na mesma mutação, falha com `expected 7.704104462546497 to be less than or equal to 7.674159265358979`.

Na mutação **sem perna reta**, as três falhas de energia são: 1/4, μ = 3, vx = 0 → `expected 1748.8394551589074 to be less than or equal to 0.5`; 2/1, μ = 0,2, vx = 0 → `expected 24.17939364019537 to be less than or equal to 0.5`; 2/1, μ = 0,2, vx = 6 → `expected 90.85200367569963 to be less than or equal to 0.5`. A corda em grupo falha com `expected 7.782551394915897 to be less than or equal to 7.674159265358979`. As falhas de geometria são 1.1 (`expected 6.00000033332098 to be close to 6`), 1.3 (`expected 12.333139286848626 to be close to 12.33313918268781`) e 1.4 (`expected 3.5863375862981046 to be close to 2`).

Produção restaurada: o mesmo comando dos dois arquivos com `-t PHY-54` deu **exit 0; 17 passed | 142 skipped (159)**. `git diff --exit-code` confirmou a restauração. O worktree, os relatórios temporários e a junction desta revisão foram removidos.

##### Gate e handoff

Gate executado pelo stage 3 sobre `497fc6f`: `npm test && npm run lint && npm run typecheck && npm run build`, por `cmd /d /c` no PowerShell → **exit 0; 30 arquivos e 831 testes passaram (831)**, suíte em **49,29 s**, sem skips. ESLint e TypeScript sem erros; build Vite concluído com 49 módulos. Persiste o aviso conhecido do chunk tardio `sim` acima de 500 kB (2.134,40 kB). `rg` confirmou PHY-55 no ADR e `git diff --check` passou.

Sem alteração de produção ou testes pelo revisor. `Stage: to-implement` e este registro no mesmo commit de reabertura, na branch existente `phy/PHY-54-corda-solta-da-polia-ideal`. Sem merge, push ou linha de ledger. A próxima etapa trata somente os dois ❌ acima; mudanças da fronteira aprovadas pertencem ao stage 1. PHY-55/PHY-56 continuam fora do escopo, e CLEAN-25 precisa de triagem/especificação própria.

Totais: Standards 2 violações de fronteira, 1 smell de julgamento não bloqueante e 1 nota de evidência corrigida; Spec 0 bloqueadores, 1 limitação nova em CLEAN-25. Pior achado de Standards: alteração de produção fora da fronteira; pior achado de Spec: comprimento/puxões falsos com duas polias soltas de projeções invertidas, fora dos cenários contratados.
