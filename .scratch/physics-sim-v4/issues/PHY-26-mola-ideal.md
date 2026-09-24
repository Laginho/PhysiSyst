# PHY-26: Mola ideal — k, x₀, amortecimento
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-23
Review: agent

- Primary files:
  - `src/scene/types.ts` (ramo `spring` de `Constraint`)
  - `src/scene/codec.ts`, `src/scene/codec.test.ts`
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`
  - `src/playback/routing.test.ts`
  - `src/editor/doc.ts` (`removeBodyAndDependents`), `src/editor/doc.test.ts`
  - `src/render/draw.ts` (mola em zigue-zague)

#### What to build

Dois corpos (um pode ser fixo) ligados por uma mola sem massa oscilam como no livro. A mola guarda `k`, `x₀` (comprimento natural) e `c ≥ 0` (amortecimento, padrão 0); `Δx = x − x₀`, com `x` a distância atual entre as âncoras. A leitura dos vínculos devolve `F_el` em cada ponta e `Δx`. A mola não colide com nada e é desenhada em zigue-zague entre as âncoras.

Implementação preferida: a junta de mola do Rapier (`rest_length = x₀`, `stiffness = k`, `damping = c`), com `F_el` calculada por nós. Se ela não bater na tolerância, a força é aplicada pelo gancho de forças que já existe (`k·Δx` + termo de `c` na velocidade relativa ao longo do eixo); registrar a escolha em `## Comments`.

#### Acceptance criteria

1. Round-trip de `{ kind: 'spring', a, b, k, x0, c? }`; rejeita `k ≤ 0`, `x0 ≤ 0`, `c < 0`, ponta em corpo inexistente, as duas pontas no mesmo corpo
2. Massa-mola horizontal sem atrito, deslocada de A: período `2π√(m/k)` dentro de 2%; amplitude dentro de 2% após 5 períodos
3. Massa-mola vertical presa ao teto: equilíbrio a `mg/k` abaixo do natural dentro de 2%; período `2π√(m/k)` dentro de 2%
4. Amortecida (`c > 0`, subcrítica): picos sucessivos seguem `A·e^(−ct/2m)` dentro de 5%
5. A leitura devolve `F_el = k·Δx` (mais o termo de `c`) em cada ponta e `Δx` com sinal (+ distendida)
6. Mudança em mola roteia como estrutural
7. `removeBodyAndDependents` remove as molas presas ao corpo
8. Verificação live em browser: cena de massa-mola importada por JSON oscila, mola desenhada estica e comprime
9. Testes de regressão mutate-verified
10. Gate verde

#### Verification

    npx vitest run src/scene src/sim src/playback/routing.test.ts src/editor/doc.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: round-trip e rejeições da mola (1).
- `src/sim/acceptance.test.ts`: horizontal, vertical, amortecida, leitura (2–5). Vermelho porque o codec não conhece `spring`.
- `src/playback/routing.test.ts`: mola → estrutural (6).
- `src/editor/doc.test.ts`: dependentes (7).

## Comments
