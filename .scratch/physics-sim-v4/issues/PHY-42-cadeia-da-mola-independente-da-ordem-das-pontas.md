# PHY-42: A mola com massa não depende de qual ponta é `a`
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`pushChain`: o rebase de `chain.p` depois do passo)
  - `src/sim/acceptance.test.ts` (bloco `with mass (PHY-30)`)

#### What to build

Os nós da cadeia de uma mola com massa são guardados como distâncias medidas a partir da ponta `a`. Depois de cada passo, `pushChain` rebaseia essas distâncias subtraindo `Δt·v_a`. Só que a ponta `a` também se move pela aceleração que o Rapier aplica durante o passo. Quando `a` é dinâmica, a origem guardada deriva, e a mesma mola física se comporta diferente conforme a ordem em que as pontas foram clicadas.

O Sol reproduziu isto, e eu confirmei com probe no motor real. O cenário é a mola horizontal do bloco PHY-30 (`m = 1`, `k = 40`, `mₛ = 0,1`, `c = 0`, bloco 0,1 m fora do equilíbrio), comparada com a mesma cena com `a` e `b` trocadas. As trajetórias do bloco se separam até **8,98 mm** em 600 passos. O Sol relata ainda que o simulador do PHY-30 (`41ec7b8`) dava trajetórias idênticas, e que rebasear pelo deslocamento real de `a` depois do `world.step()` resolve. Nenhuma das duas afirmações foi re-verificada.

A correção rebaseia os nós pelo deslocamento real da origem ao longo do eixo, antes do próximo passo da cadeia.

#### Acceptance criteria

1. Na mola horizontal acima, a cena com `a`/`b` trocadas dá uma trajetória do bloco a menos de 0,1 mm da original ao longo de 600 passos
2. Os testes de aceitação existentes do bloco PHY-30 (período com massa, CLEAN-09, CLEAN-12) continuam verdes sem mudar tolerância
3. Os testes de regressão são mutate-verified conforme o `AGENTS.md`
4. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-30
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-30: o cenário do critério 1. Vermelho porque hoje as trajetórias se separam 9 mm. Os testes existentes põem sempre a parede fixa como `a`, e é isso que esconde o erro.

## Comments

- 2026-09-30 Stage 2: regressão escrita na interface pública `createSimulator` → `step` → `readStates`, comparando as duas ordens das pontas por 600 passos. Red antes da correção: `npx vitest run src/sim/acceptance.test.ts -t PHY-42` → 1 failed, 53 skipped (54); `AssertionError: expected 0.008981645107269287 to be less than 0.0001`.

- 2026-09-30 Aberto a partir do F3 do Sol no review de benchmark do PR 9. A divergência de 8,98 mm foi reproduzida por probe descartável no motor real.
