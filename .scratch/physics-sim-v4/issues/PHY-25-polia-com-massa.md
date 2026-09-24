# PHY-25: Polia com massa (Realism option)
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-24
Review: agent

- Primary files:
  - `src/scene/codec.ts`, `src/scene/codec.test.ts` (`mass ≥ 0` na polia)
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`

#### What to build

Uma polia pode ter massa `M` (disco, `I = ½MR²`). A corda não desliza nela, então a polia gira e a tração difere em cada segmento. Montada num Corpo dinâmico (polia móvel), `M` também entra na translação desse corpo, e o peso dela aparece na dinâmica. `mass` ausente ou 0 mantém o comportamento ideal, bit a bit igual ao do PHY-24. A leitura dos vínculos passa a devolver `T` por segmento.

#### Acceptance criteria

1. O codec aceita `mass ≥ 0` na polia e rejeita negativa; ausente = 0
2. Atwood com polia fixa de massa M: `a = (m₁−m₂)g/(m₁+m₂+M/2)` dentro de 3%; `T₁ = m₁(g − a)` e `T₂ = m₂(g + a)` dentro de 3%, lidos por segmento
3. Polia móvel de massa M montada num corpo de massa m, corda do teto contornando-a e subindo por uma polia fixa sem massa até um contrapeso m₂: `a = g(m + M − 2m₂)/(m + 3M/2 + 4m₂)` dentro de 3%
4. Com `mass = 0`, as trajetórias das famílias do PHY-23/24 não mudam (mesmos números dos testes existentes)
5. `replaceScene` com carry preserva a velocidade angular das polias com massa
6. Testes de regressão mutate-verified
7. Gate verde

#### Verification

    npx vitest run src/scene/codec.test.ts src/sim
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: `mass` da polia (1).
- `src/sim/acceptance.test.ts`: Atwood com polia de massa, polia móvel com massa, carry angular (2, 3, 5). Vermelho porque o simulador ignora `mass` da polia.

## Comments
