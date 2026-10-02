# CLEAN-25: Junções de polias soltas em ordem invertida alongam o caminho e puxam as polias
Stage: implementing
Status: ready-for-agent
Blocked by: CLEAN-26
Review: agent
Difficulty: normal

- Primary files:
  - src/scene/ropePath.ts (`release`: o posicionamento das junções das polias soltas em cada perna; `along`, com o comentário `ponytail:` acima dela; os comentários de `release`/`ropePath` que descrevem a junção)
  - src/scene/ropePath.test.ts (bloco `ropePath, unwound sweep (PHY-54)`, dentro de `ropePath, kept wrap direction (PHY-45)`)
  - src/sim/acceptance.test.ts (bloco `rope over a fixed pulley (PHY-23)`, ao lado dos testes do PHY-54: o teste novo e a função nova `twoPulleyTableScene`)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (o parágrafo `The unwound sweep (PHY-54)`, só a frase da junção)

#### What to build

Uma corda que se soltou de várias polias ideais fica reta entre os vizinhos, com comprimento igual à perna reta e sem puxar nenhuma polia solta, qualquer que seja a posição das polias ao longo da perna. Hoje isso só vale enquanto as projeções dos centros na perna seguem a ordem de `via` e são distintas. Quando a ordem se inverte, as junções vão e voltam sobre a perna: na reprodução abaixo, 21 m em vez de 11 m, e as polias soltas puxadas com (−2, 0)/(2, 0) por unidade de tensão. Quando duas projeções coincidem, ou as duas ficam presas na mesma ponta pelo limite [¼, ¾] (o caso do `ponytail:` acima de `along`, que o PHY-54 deixou de fora), as junções caem no mesmo ponto, o segmento do meio tem comprimento 0, `unit()` devolve 0 e cada polia leva um puxão de ±1 por unidade de tensão.

**É um bug de física, não só de geometria.** Na main, uma corda sobre duas polias ideais na cena da mesa já ganha energia quando o bloco passa pelas duas e a corda sai delas: as duas junções caem na mesma perna. Medido em 600 passos com a cena do critério 6: 1/3 com μ = 3 ganha +186,13 J (passo 479) e 2/1 com μ = 0,2 ganha +291,36 J (passo 398). O id segue CLEAN-25.

**A regra.** Numa perna com `n` polias soltas, a junção da `k`-ésima delas, na ordem de `via` (k = 1…n), fica no parâmetro `t = k/(n + 1)` da perna, sem olhar o centro. A regra vale em toda perna, inclusive numa perna entre duas polias engatadas. A junção não tem papel físico: a polia solta não puxa nada, e o comprimento e os puxões das pontas só pedem que os segmentos sejam colineares, no mesmo sentido e de comprimento positivo. Espaçar por `via` garante isso sempre, e mantém a associação que `ropeFrame` lê: `arcs[i]` é a polia `i` de `via`, `segments[i]` chega nela e `segments[i + 1]` sai. A varredura de cada polia não muda: continua medida pela construção, sem passar pelas junções. Com uma polia solta só, a junção vai para o meio da perna, em vez do ponto mais perto do centro limitado a [¼, ¾]; `along` e o `ponytail:` saem.

Rejeitado: ordenar as junções pela projeção. Resolve a reprodução no fim, mas não as projeções iguais nem as presas na mesma ponta, e falha no meio da própria reprodução, quando as polias se cruzam (medido abaixo).

`arcs[i].start` de uma polia solta continua sendo o ângulo do centro até a junção dela; nenhum chamador lê o `start` de uma polia solta hoje (corda com grip não tem histórico, e o desenho, `scenePath`, também não).

**Fora do escopo:** o desenho da corda solta (PHY-56) e a corda que sai de uma polia com massa (PHY-55). A ordem de reengate quando as polias voltam a tocar a corda em ordem invertida à de `via` não muda aqui.

#### Acceptance criteria

1. `ropePath` com histórico, chamado direto, cada leitura recebendo as varreduras da anterior (a primeira, nenhuma), na reprodução dos Comments: R = 1 nas duas polias, `keep = [−1, −1]`; (a) polias em (0, 0) e (5, 0), pontas `a = (−3, h)` e `b = (8, h)` com `h = −2 + k/1000`, k inteiro de 0 a 4000; (b) pontas em (−3, 2)/(8, 2), a segunda polia em `(5, −j/1000)`, j inteiro de 1 a 3000; (c) a primeira polia em `(j/1000, 0)` e a segunda em `(5 − j/1000, −3)`, j inteiro de 1 a 5000 (as duas ficam em x = 2,5 na mesma leitura, j = 2500). As posições são calculadas a partir do índice, nunca acumulando 0,001. A partir de k = 3001 de (a), e em toda leitura de (b) e (c):
   1. as duas varreduras são negativas;
   2. o comprimento é `|a − b|` = 11 a 10⁻⁹;
   3. há 3 segmentos, cada um com comprimento maior que 0,1 m e direção unitária (1, 0) a 10⁻⁹;
   4. o puxão de cada polia, somado como `ropeFrame` soma (direção unitária de `segments[i]` invertida mais a de `segments[i + 1]`), é (0, 0) a 10⁻⁹;
   5. `arcs[i].center` é o centro da polia `i` de `via`, e `arcs[i].sweep` é igual, a 10⁻⁹, a `ropePath(a, b, [polia i], [−1], [varredura anterior da polia i]).arcs[0].sweep`. Na última leitura as varreduras são `[−0,4303793433006895; −1,3104262520688144]` a 10⁻⁹.
2. `ropePath(a, b, polias, [−1, −1], [−0,5, −0,5])` com `a = (−3, 2)`, `b = (8, 2)`, R = 1, em três disposições: centros (2, 0)/(2, −3) (projeções iguais); (9, 0)/(10, 0) (as duas além de `b`); (0, 0)/(5, −3) (na ordem de `via`). Em cada uma valem os itens 1.1 a 1.4.
3. Os testes existentes ficam verdes sem mudar tolerância nem texto, incluindo os cinco do bloco `ropePath, unwound sweep (PHY-54)` (uma polia solta: junção dentro da perna, segmentos das pontas maiores que 0,1 m) e os do PHY-54 em `acceptance.test.ts`.
4. O ADR-0004, no parágrafo do PHY-54, descreve a regra das junções (espaçadas em `t = k/(n + 1)` na ordem de `via`) e não diz mais "nearest the center" nem [¼, ¾]; o comentário `ponytail:` sobre duas polias soltas presas na mesma ponta não existe mais em `ropePath.ts`. Conferido por grep na Verification.
5. Os testes novos ficam vermelhos contra dois mutantes de `release`, e o stage 2 registra a saída em Comments:
   - junções na projeção, na ordem de `via` (o código de hoje): critério 1 vermelho (medido: 21 m, puxões (∓2, 0)) e critério 2 vermelho nas duas primeiras disposições (medido: segmento do meio com comprimento 0, puxões (∓1, 0));
   - junções na projeção limitada a [¼, ¾], ordenadas por parâmetro: critério 1 vermelho em torno do cruzamento (item 1.3: segmento do meio < 0,1 m; na leitura exata do cruzamento, puxão de módulo 1 e segmento nulo) e critério 2 vermelho nas duas primeiras disposições. Medido: item 1.3 vermelho em 101 leituras de (c), j de 2450 a 2550; item 1.4 vermelho só em j = 2500.
   - Mutação de integração (`AGENTS.md`): com as junções na projeção, na ordem de `via` (o código de hoje), o critério 6 fica vermelho nos dois cenários (medido: +186,13 J e +291,36 J). O stage 2 aplica a mutação à produção, roda `npx vitest run src/sim/acceptance.test.ts -t CLEAN-25` e registra em Comments a saída vermelha de cada cenário.
6. Corda sobre duas polias ideais na mesa, pelo motor público (`createSimulator(parse(scene))`), 600 passos. A cena é `twoPulleyTableScene(m1, m2, mu, vx?)`, com a mesma assinatura e os mesmos corpos de `tableScene` do PHY-54, mais: uma segunda polia `q` (r = 0,2) montada na `mesa` na âncora (4,6; −0,1), isto é, em (4,6; −0,6) no mundo; `b` em (4,8; −1,8), com a corda na mesma âncora (0; 0,15); `via: ['p', 'q']`; as duas polias sem `mass`. A corda passa por cima de `p`, desce tangente pelo lado direito de `q` e cai vertical até `b`. Nos cenários 1/3 com μ = 3 e 2/1 com μ = 0,2 (μs = μk = μ, sem `vx`), a energia dos blocos medida como no PHY-54 (`maxEnergyGain`) nunca passa de `E₀ + 0,5 J`. Hoje: +186,13 J e +291,36 J. Com a regra: +0,0042 J e −0,0042 J. (Dos 11 cenários da grade do PHY-54, só esses dois ficam vermelhos na main; os outros nove dão o mesmo número com e sem a regra.)

#### Verification

    npx vitest run src/scene/ropePath.test.ts -t CLEAN-25
    npx vitest run src/sim/acceptance.test.ts -t CLEAN-25
    npx vitest run src/scene/ropePath.test.ts src/sim/acceptance.test.ts
    git grep -n -e "nearest the center" -e "¼" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md src/scene/ropePath.ts
    git grep -n "ponytail: two loose" -- src/scene/ropePath.ts
    git grep -n "k/(n + 1)" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

Os dois primeiros `git grep` não devem achar nada; o terceiro deve achar a linha do ADR com a regra.

## Tests stage 2 writes (own commit, red)

- `src/scene/ropePath.test.ts`, no bloco `ropePath, unwound sweep (PHY-54)`, chamando `ropePath` direto, com `CLEAN-25` no nome: um teste para o critério 1 (a caminhada inteira, num laço local que leva as varreduras pelas três fases; o `walk` do bloco recebe polias fixas e fica intocado, como o critério 3 pede) e um para o critério 2 (as três disposições num `it.each`). Vermelhos hoje porque as junções seguem a projeção na ordem de `via`: 21 m e puxões (∓2, 0) no fim da caminhada; segmento do meio nulo e puxões (∓1, 0) com projeções iguais ou presas em `b`. O item 1.5 e a terceira disposição do critério 2 são guarda e passam antes. Como os testes chamam a função mudada direto, o `AGENTS.md` não pede registro de mutação; o critério 5 pede o dos dois mutantes porque o segundo é a alternativa rejeitada e só uma janela em torno do cruzamento a separa.
- `src/sim/acceptance.test.ts`, no bloco `rope over a fixed pulley (PHY-23)`, ao lado dos testes do PHY-54, pelo motor público, sem mocks, com `CLEAN-25` no nome: a função `twoPulleyTableScene(m1: number, m2: number, mu: number, vx?: number): Scene` (o PHY-55 reaproveita esse nome; ela pode montar a cena a partir de `tableScene`, sem mudar `tableScene`) e o critério 6 num `it.each` com os dois cenários, reaproveitando `maxEnergyGain`. Vermelho hoje pela energia (+186,13 J e +291,36 J). É costura de integração: o registro da mutação do critério 5 é obrigatório.

## Comments

- 2026-10-02 Aberto no stage 3 do PHY-54. O eixo Spec encontrou uma limitação nova em `ropePath.release`; o revisor principal a reproduziu com o código de produção de `497fc6f` transpileado e importado em memória, sem editar a produção. Não falha um cenário numerado do PHY-54 nem demonstra comportamento anterior correto perdido; não é motivo de reabertura daquele contrato.
- Reprodução: R = 1 em ambas as polias, `keep = [-1, -1]`. Pontas iniciais `a = (-3, -2)` e `b = (8, -2)`; polias, na ordem `via`, em `(0, 0)` e `(5, 0)`. A primeira leitura não recebe histórico; cada leitura seguinte recebe os sweeps da anterior. Subir as duas pontas de h = -2 até h = 2 em passos de 0,001. Ambas se soltam: `length = 11`, sweeps `[-0.4303793433006886, -0.4303793433006895]`. Manter as pontas e baixar a segunda polia até y = -3 em passos de 0,001; depois mover a primeira de x = 0 até 5 e a segunda de x = 5 até 0 simultaneamente, também em passos de 0,001.
- Resultado final: pontas `(-3, 2)/(8, 2)`, polias `(5, 0)/(0, -3)`, sweeps `[-0.4303793433006895, -1.3104262520688144]`. As duas polias seguem soltas, com projeções distintas no interior da perna, mas as junções seguem `via`: `(5, 2)` e `(0, 2)`. Os segmentos percorrem 8 + 5 + 8 = **21 m**, em vez da perna reta de **11 m**. Somar as direções unitárias adjacentes como `ropeFrame` faz resulta em puxões por unidade de tensão **(-2, 0)/(2, 0)**, em vez de zero.
- Localização no commit inspecionado: `src/scene/ropePath.ts:141` monta as junções na ordem de `via`; `src/sim/simulator.ts:244` lê os puxões dos segmentos. O caso não é a exclusão explícita do PHY-54 de duas projeções presas na mesma ponta. Antes de implementar, o stage 1 precisa fixar como preservar o caminho e a associação de cada polia quando a ordem das projeções muda, definir a fronteira e publicar critérios e testes. Nenhuma decisão de arquitetura foi tomada nesta revisão.
- 2026-10-02 Stage 1. Probes descartáveis sobre `506b021`, nada commitado. Reprodução confirmada com a produção: 21 m e puxões (−2, 0)/(2, 0) no fim; ao longo da caminhada, desvio máximo de 10 m do comprimento da perna. Achados a mais: projeções iguais ((2, 0)/(2, −3)) e as duas além de `b` ((9, 0)/(10, 0)) dão o comprimento certo (11 m) mas um segmento de 0 m e puxões (∓1, 0). Três regras testadas numa cópia de `ropePath.ts`: (1) a de hoje; (2) projeções limitadas e ordenadas: 11 m no fim, mas puxão de módulo 1 e segmento nulo na leitura do cruzamento (x = 2,5) e nas duas disposições acima; (3) `t = k/(n + 1)` na ordem de `via`: em todas as leituras a partir de h = 1,001, comprimento 11 a menos de 10⁻⁹, segmento mínimo 3,667 m, direções (1, 0) e puxões nulos, varreduras idênticas às de hoje e iguais às da construção da polia sozinha (item 1.5). Com a regra 3 ligada no lugar do módulo por `vi.mock`, `ropePath.test.ts` + `acceptance.test.ts` deram 159 de 159 verdes, e `simulator.test.ts`, `contacts.test.ts`, `presets.test.ts` e `playback/integration.test.ts`, 68 de 68; o mock foi conferido com um mutante (junção em `t = 0`), que deixou 9 vermelhos, entre eles os itens 1.1 e 1.4 do PHY-54 (`expected -3 to be greater than -3`, `expected 0 to be greater than 0.1`). O gate inteiro não rodou no stage 1.
- 2026-10-02 Stage 1, após o proxy: posições da caminhada calculadas a partir do índice inteiro (`k/1000`, `j/1000`); medido, em j = 2500 as duas polias ficam exatamente em x = 2,5, e as varreduras finais não mudam. Com o mutante (b), o item 1.3 fica vermelho em 101 leituras (j de 2450 a 2550) e o 1.4 só em j = 2500; com a regra (d), nenhuma leitura falha. Probes apagados.
- 2026-10-02 Proxy decided: junções em `t = k/(n + 1)` na ordem de `via`, sem projeção — a junção não faz trabalho físico, e (d) mantém todo segmento ≥ |perna|/(n + 1), o motivo original do PHY-54 para o limite.
- 2026-10-02 Proxy decided: o caso do `ponytail:` (duas projeções presas na mesma ponta) entra neste ticket, na segunda disposição do critério 2 — a mesma regra o cobre sem código a mais.
- 2026-10-02 Proxy decided: substituir a decisão do PHY-54 (ponto mais perto do centro, limitado a [¼, ¾]) e corrigir o ADR — a junção não faz trabalho físico, e (d) mantém todo segmento ≥ |perna|/(n + 1), o motivo original do limite.
- 2026-10-02 Proxy decided: `arcs[i].start` de uma polia solta fica o ângulo até a junção, sem mudança — só o código de grip (sem histórico) e o `scenePath` (sem histórico) leem `start`.
- 2026-10-02 Proxy decided: testes só na geometria, chamando `ropePath` direto, sem cena no `acceptance.test.ts` — `ropeFrame` só soma as direções dos segmentos, e a cena seria artificial.
- 2026-10-02 Proxy decided: o critério 5 pede o registro do mutante (b) — só uma janela em torno do cruzamento separa (b) de (d).
- 2026-10-02 Proxy decided: `Blocked by: CLEAN-26`, `Difficulty: normal`, `Review: agent`, um ticket só — mesmo arquivo do CLEAN-26, função privada, critérios independentes.
- 2026-10-02 Stage 1, com a evidência do PHY-55: a cena da mesa com duas polias ideais (critério 6) medida na main e com a regra `t = k/(n + 1)` por `vi.mock` (conferido: o mock muda os dois cenários vermelhos), na grade de 11 do PHY-54. Main: 1/3 com μ = 3 +186,1342 J (passo 479) e 2/1 com μ = 0,2 +291,3637 J (passo 398); os outros nove, de −4,69 J a −0,0049 J. Com a regra: +0,0042 J e −0,0042 J nesses dois, e os nove iguais à main. Probes apagados.
- 2026-10-02 Proxy decided: "testes só na geometria" revisto pela evidência nova (a cena simples da mesa com duas polias ideais já ganha energia na main): o critério de energia, com `twoPulleyTableScene` em `acceptance.test.ts` e o registro de mutação, fica neste ticket — um ticket posterior nunca conseguiria ficar vermelho primeiro.
