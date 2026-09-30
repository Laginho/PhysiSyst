# PHY-42: A mola com massa não depende de qual ponta é `a`
Stage: done
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

- 2026-09-30 Stage 2 concluído: `pushChain` mantém os nós na origem anterior e retorna o rebase executado por `step` imediatamente depois de `world.step()`. O deslocamento real da âncora `a` é projetado no eixo usado pelo passo da cadeia, incluindo aceleração e rotação da âncora. Teste separado no commit `9304327`; o commit de produção não altera testes.
- Mutate-verify do teste `PHY-42: swapping the spring ends keeps the block trajectory within 0.1 mm over 600 steps`: na produção corrigida, trocar temporariamente `chain.p = chain.p.map((p) => p - moved)` por `chain.p = chain.p.map((p) => p - TIMESTEP * v[0]!)`, restaurando o rebase antigo. `npx vitest run src/sim/acceptance.test.ts -t PHY-42` → 1 failed, 53 skipped (54); `AssertionError: expected 0.008981645107269287 to be less than 0.0001`. Mutação removida, mesmo comando → 1 passed, 53 skipped (54).
- Aceitação PHY-30: `npx vitest run src/sim/acceptance.test.ts -t PHY-30` → 13 passed, 41 skipped (54), incluindo CLEAN-09 e CLEAN-12 sem alteração de tolerâncias.
- Gate final: `npm test && npm run lint && npm run typecheck && npm run build` → exit 0; 30 arquivos, 720 testes verdes; lint, typecheck e build verdes. Na primeira execução, PHY-18 no navegador falhou com `canvas geometry did not settle` (719 passed, 1 failed); seu arquivo isolado passou com 10 testes e a repetição do gate completo passou. Build mantém o aviso de chunks acima de 500 kB.

- 2026-09-30 Aberto a partir do F3 do Sol no review de benchmark do PR 9. A divergência de 8,98 mm foi reproduzida por probe descartável no motor real.

#### Resolution (2026-09-30)

Verdict: Approve

##### Standards

Nenhuma violação documentada ou smell relevante. `simulator.ts` preserva a dinâmica do Rapier (ADR-0001), a massa como opção da mola (ADR-0002) e as forças das molas antes da predição das cordas (ADR-0004). Os callbacks locais capturam a posição anterior da âncora e o eixo necessários ao rebase após o passo. A regressão reutiliza o cenário existente e a interface do simulador; a evidência de mutação atende ao `AGENTS.md`.

##### Spec

Nenhum achado. Critério 1: o teste compara duas cenas independentes por 600 passos, com `m = 1`, `k = 40`, `mₛ = 0,1`, `c = 0` e deslocamento inicial de 0,1 m; `parse` recria as constraints antes da troca das pontas. O único caller de `pushChain`, `step`, executa o rebase imediatamente após `world.step()`, projetando o deslocamento real de `worldPoint(a)` no eixo da integração. Critério 2: os 13 testes PHY-30 passam com as tolerâncias existentes, incluindo CLEAN-09 e CLEAN-12. Critérios 3 e 4: mutação repetida e gate verde. Primary files e separação dos commits respeitados.

Standards: 0 achados; Spec: 0 achados.

##### Verificação e encerramento

- Arquivos revisados: `src/sim/simulator.ts`, `src/sim/acceptance.test.ts` e este ticket. `9304327` adiciona a regressão antes da correção; `2a5e445` altera produção e documentação sem tocar testes.
- Mutate-verify repetido na etapa 3 para `PHY-42: swapping the spring ends keeps the block trajectory within 0.1 mm over 600 steps`: substituído temporariamente `chain.p = chain.p.map((p) => p - moved)` por `chain.p = chain.p.map((p) => p - TIMESTEP * v[0]!)`. `npx vitest run src/sim/acceptance.test.ts -t PHY-42` → **1 failed, 53 skipped (54)**; saída: `AssertionError: expected 0.008981645107269287 to be less than 0.0001`.
- Mutação removida e fonte conferida sem diff: `npx vitest run src/sim/acceptance.test.ts -t PHY-30` → **13 passed, 41 skipped (54)**, incluindo a regressão PHY-42.
- Rebase na sessão já atualizado; gate `npm test && npm run lint && npm run typecheck && npm run build` → **30 test files passed, 720 tests passed**, exit 0; lint, typecheck e build verdes. Vite mantém o aviso existente de chunks acima de 500 kB.
- Merge sem squash: `50df434`, em `sweatshop/2026-09-24-1853`. `Stage: done` e ledger registrados juntos no commit de encerramento.
