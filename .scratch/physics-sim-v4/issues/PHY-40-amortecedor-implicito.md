# PHY-40: Amortecedor da mola ideal implícito, estável para todo `c ≥ 0`
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`springAt` / `pushSpring`: o termo `c·ẋ` da mola ideal)
  - `src/sim/acceptance.test.ts` (bloco da mola ideal, PHY-26)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (parágrafo da mola)

#### What to build

A mola ideal aplica `F_el = k·Δx + c·ẋ` como força constante durante o passo inteiro de 1/60 s, calculada com a velocidade relativa do início do passo. Para o amortecedor, isso é Euler explícito: fica instável quando `c·Δt/m_ef > 2`, o que para 1 kg já acontece com `c > 120`. A partir daí o amortecedor **injeta** energia. O modelo físico do livro, `F = −c·v`, nunca ganha energia: com `c` enorme o bloco só rasteja de volta ao equilíbrio. O problema é o integrador, não o modelo, e é por isso que ele se corrige no código e não vira um limite do modelo mostrado ao aluno (decisão do grilling de 2026-09-30).

O Sol reproduziu isto, e eu confirmei com probe no motor real. O cenário é um pivô fixo em (0, 0), um bloco de 1 kg parado em (1,1; 0), `k = 40`, `x₀ = 1`, `c = 200` e `g = 0`. A energia mecânica começa em 0,200 J; depois de 10 passos vale **4885,196 J**, com `x = 1,6328 m` e `vx = 98,764 m/s`.

A correção resolve o termo de amortecimento de forma implícita, contra a massa efetiva das duas pontas ao longo do eixo, incluindo a inércia de rotação no ponto de ancoragem; uma ponta fixa conta como massa infinita. Na forma escalar isso vira `c·ẋ / (1 + c·Δt/m_ef)`. O termo elástico continua como está. A mola com massa (PHY-30) já é implícita no `chainStep` (θ-método, `κ = k′ + c′/θΔt`) e fica fora deste ticket.

#### Acceptance criteria

1. No cenário acima, com `c = 200` e com `c = 2000`, a energia mecânica (½mv² + ½kΔx²) nunca cresce de um passo para o outro ao longo de 600 passos (tolerância 1e-9 J)
2. O mesmo vale com as duas pontas dinâmicas (dois blocos de 1 kg, sem pivô, `g = 0`). O momento linear total fica conservado dentro de 1e-9 kg·m/s
3. Os testes de aceitação existentes da mola ideal (período, subamortecido, crítico, vertical) continuam verdes sem mudar tolerância
4. O ADR-0004 descreve o termo de amortecimento implícito e por que ele existe
5. Os testes de regressão são mutate-verified conforme o `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-26
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-26: os cenários dos critérios 1 e 2. Vermelhos porque o amortecedor explícito leva a energia de 0,2 J a 4885 J em 10 passos.

## Comments

- 2026-09-30 Aberto a partir do F1 do Sol no review de benchmark do PR 9. Números reproduzidos por probe descartável no motor real (`parse` → `createSimulator`).

- 2026-09-30 Stage 2, red: `npx vitest run src/sim/acceptance.test.ts -t PHY-40` → 4 failed, 49 skipped. Os quatro casos exercitam `parse` → `createSimulator` → `step` → `readStates`, com energia calculada das posições e velocidades, por 600 passos. Todos falham no passo 2 por crescimento de energia (J): ponta fixa, c=200: 0.199453911844 → 0.203307456578; ponta fixa, c=2000: 0.199453911844 → 2.474434926636; duas pontas livres, c=200: 0.198927293195 → 0.315242885680; duas pontas livres, c=2000: 0.198927293195 → 19.302521775345. O código de produção ainda não foi alterado.
