# CLEAN-09: Cadeia da mola com massa re-assentada quando uma ponta muda no carry; nós como escalares no eixo
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`Chain`, `chainAxis`, `pushChain`, `placeChain`, `readSpring`, o laço de cadeias em `replaceScene`)
  - `src/sim/acceptance.test.ts` (`with mass (PHY-30)`)

#### What to build

O review do PHY-30 (2026-09-24) mediu um defeito fora dos critérios daquele ticket: num rebuild com carry em que o corpo de uma ponta não está no carry (o aluno arrastou o bloco durante a reprodução; `carryOver` o descarta), `replaceScene` retoma a cadeia pelo id da mola com os nós nas posições antigas, projetados no eixo novo. Com o bloco movido 0,5 m: Δv do primeiro passo −1,85 m/s contra −0,40 da mola ideal na mesma manobra, e a leitura de `F_el` no bloco marca 110,7, −38,7, −9,1, 10,7 … N numa resposta de 24 N, com a ponta da parede entre −39,5 e 68,6 N. A cadeia deve ser re-assentada (`placeChain`) quando o corpo de uma ponta não veio no carry, ou quando `bodyId`/âncora de uma ponta difere da ligação viva; a retomada por id continua nos demais casos (o teste de carry do PHY-30 fica intacto).

No mesmo toque, dois itens do mesmo review: os nós ficam como distâncias ao longo do eixo em vez de pontos do mundo (`chainAxis` deixa de projetar e `pushChain` de desprojetar a cada passo), e um teste committed para a cadeia com amortecimento, que hoje só a sonda do reviewer cobriu (`c = 0,5` e `c = 2` com `mₛ = 0,1` seguem o envelope de picos da mola ideal com o mesmo `c` dentro de 1% em 10 picos).

#### Acceptance criteria

1. Após `replaceScene` com um carry sem o corpo de uma ponta (bloco movido 0,5 m no documento), o Δv do bloco no primeiro passo fica dentro de 10% do da mola ideal na mesma manobra, e nos 8 passos seguintes `|F_el|` em cada ponta não passa de 2× `k·Δx`
2. O teste de carry do PHY-30 (`replaceScene with carry keeps the chain`) continua verde sem mudar tolerância: um carry com as duas pontas presentes retoma a cadeia
3. `Chain` guarda os nós como escalares no eixo; nenhum número dos testes do PHY-30 muda
4. Teste novo: cadeia com `c = 0,5` e `mₛ = 0,1`, decremento pico a pico (pico i+1 / pico i) dentro de 2% do da mola ideal com o mesmo `c`, em cada um de 10 picos; vermelho ao zerar o termo de `c` em `chainTensions`
5. Gate verde

#### Verification

    npx vitest run src/sim
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`: carry sem o bloco (1), vermelho porque a cadeia retoma os nós velhos; cadeia amortecida (4), verde na base e vermelho só sob a mutação do critério.

## Comments

- 2026-09-24 Aberto pelo review do PHY-30 (stage 3). Nenhum item é critério daquele ticket, então o PHY-30 fechou como está. Sem critério, para quem tocar nisto: `readSpring` calcula `chainAxis` e as tensões e as descarta assim que `chain.force` existe (inicializar `force` em `placeChain` elimina o fallback e o parâmetro `lag`); `pushChain` recalcula `before` que `chainStep` já tem como `T`; a leitura do painel rotula as pontas pelo nome do corpo (`F_el em bloco`) enquanto as setas dizem `F_el,1`/`F_el,2` (a corda espelha as setas com `T₁`/`T₂`).
- 2026-09-24 Stage 2: o critério 4 como escrito ("envelope de picos dentro de 2%") tinha três leituras, e só uma fica verde na base. Medido (m = 1, k = 40, A = 0,1, c = 0,5, mₛ = 0,1 contra a ideal com o mesmo c, 10 picos): amplitude do pico i contra o pico i da ideal deriva até 2,81% no 10º; taxa de decaimento ajustada −2,6% (0,2443 contra 0,2510); decremento pico a pico, pior 0,49% na base e 26,8% sob a mutação do critério. As duas primeiras medem a massa efetiva m + mₛ/3 que a cadeia deve somar, não o amortecimento.
- Proxy decided: decremento pico a pico (pico i+1 / pico i) dentro de 2% do da ideal em cada um de 10 picos, c = 0,5, mₛ = 0,1, mutação inalterada — é a leitura que isola o termo de c; as outras falham por física correta. Critério 4 reescrito nesse sentido.
- 2026-09-24 Stage 2: o teste do critério 1 cobre também a outra metade de "What to build" (âncora de uma ponta diferente da ligação viva, os dois corpos no carry): parede re-ancorada 0,5 m no eixo, mesmos limites. Vermelho na base: Δv 0,061 contra 0,379 da ideal.
