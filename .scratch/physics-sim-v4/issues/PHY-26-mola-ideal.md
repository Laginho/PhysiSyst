# PHY-26: Mola ideal — k, x₀, amortecimento
Stage: to-review
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

### Stage 2 (2026-09-24)

**Implementation choice: the fallback, a force of our own.** Rapier's spring joint (`JointData.spring(x0, k, c, …)`) was tried first and missed the tolerances: horizontal m=1 k=40 lost 0.0297 m of amplitude out of 0.1 m in 5 periods (0.002 allowed), the vertical equilibrium was off by 2.05%, and the damped cases lost their peaks early (4 and 2 peaks found instead of 5). The spring is now `pushSpring` in the step hook, applied before the ropes so their prediction sees it. The force is taken `(1 − φ)Δt` ahead (φ = Rapier's substep factor from ADR-0004). Without that lead, a constant force over the substeps pumps energy in: mutation 6 below makes all six oscillation tests fail. The readout `F_el = k·Δx + c·ẋ` is the instantaneous value at the current state.

**Readout shape.** `{ id, kind: 'spring', dx, force: { a, b } }`. `dx` is signed (+ stretched); `force` is + when the spring pulls its ends together. `a` and `b` are equal while the spring is massless (PHY-30 splits them). `readConstraints` lists ropes and springs in document order.

**Test commits after the red one** (each test-only, no code commit touches a test):
- `7dbea2c`: the t = 0 readout check had 9 digits, but Rapier's f32 poses read 0.1 back as 0.100000012. Now 6 digits on `dx`, 5 on `F_el`.
- `8280aaa`: `Constraint` became `Rope | Spring`, so rope-only tests cast to `Rope`. One file is **outside Primary files**: `src/scene/ropePath.test.ts`, 4 type-only casts, no runtime change (PHY-23 precedent for a type-only test line outside the list).
- `606ce13`: mutate-verify found two hollow spots (mutations 9 and 10 below passed). The order test now lists the spring first. A new two-free-bodies test (g = 0, reduced-mass period `2π√(μ/k)` within 2%, center of mass still to 1e-4 m) covers a spring with no fixed end.

**Mutate-verify** (each mutation applied alone to production code, then the listed suite run; all reverted):

| # | Mutation | Result |
|---|---|---|
| 1 | `routing.ts`: constraints diff never structural | 9 red (6 spring cases, 3 rope) |
| 2 | `doc.ts`: spring ends ignored on removal | 4 red (all spring removal cases) |
| 3 | `codec.ts`: same-body spring allowed | 1 red (`both ends on one body`) |
| 4 | `codec.ts`: `c < 0` accepted | 1 red (`c negative`) |
| 5 | `codec.ts`: `c` not stored | 3 red (round-trips with c, spring+rope) |
| 6 | `simulator.ts`: no `(1 − φ)Δt` lead | 6 red (horizontal ×2, vertical ×2, damped ×2) |
| 7 | `simulator.ts`: damping term not applied | 2 red (damped ×2) |
| 8 | `simulator.ts`: readout without the `c` term | 1 red (readout test) |
| 9 | `simulator.ts`: readout not sorted | 1 red (document order), after `606ce13`; passed before |
| 10 | `simulator.ts`: no force on end `a` | 1 red (two free bodies), after `606ce13`; passed before |
| 11 | `simulator.ts`: half-strength force on `b` | 8 red |

Routing (criterion 6) was green from the red commit on: routing has treated any `constraints` change as structural since PHY-23. Mutation 1 is its proof.

**Live browser check** (criterion 8). A throwaway vitest file (not committed) ran headless Chromium on the real Vite app at 1280 px through `src/test/browser.ts`. It imported a mass-spring JSON through the real "importar" file input (floor, fixed wall, 1 kg block, k = 20, x0 = 2.3, released 1 m stretched), with no import error. At t = 0 the spring was drawn as a zigzag from the wall's face to the block. After "▶ reproduzir" the block moved in to about 0.8 m of compression (left face ~2.7 m, natural 3.5 m), with the zigs packed tight, then headed back out.

**Gate:** `npm test` 29 files, 585 passed; lint clean; typecheck clean; build OK (the >500 kB warning names only the late `sim` chunk, as PHY-32 documents).
