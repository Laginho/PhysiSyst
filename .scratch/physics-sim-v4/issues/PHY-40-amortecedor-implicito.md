# PHY-40: Amortecedor da mola ideal implícito, estável para todo `c ≥ 0`
Stage: done
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

#### Stage 2 — implementação e verificação (2026-09-30)

- Commit de testes vermelhos: `b2f453b`. Branch: `phy/PHY-40-amortecedor-implicito`, baseada em `sweatshop/2026-09-24-1853`.
- `springAt` expõe a velocidade relativa axial; `pushSpring` aplica `k·Δx + c·ẋ/(1 + c·Δt·K)`. Reutiliza `ropeInvMass` para as duas pontas, incluindo inércia no ponto de ancoragem e rotações bloqueadas, e `applyPulls` para forças opostas. O termo elástico conserva o lead anterior. O readout continua `k·Δx + c·ẋ` no estado atual; a cadeia PHY-30 permanece igual. ADR-0004 documenta a correção.
- Mutate-verify no seam de integração: após obter verde, substituí em `pushSpring` a força aplicada por `s.k * dx + s.c * rate`, removendo o denominador implícito. Comando: `npx vitest run src/sim/acceptance.test.ts -t PHY-40` → **4 failed, 49 skipped**. Evidência por caso (saída vermelha, passo 2):

| Novo teste | Mutação aplicada | Saída vermelha |
|---|---|---|
| c=200, fixed end=true | Amortecimento explícito em `pushSpring` | `expected 0.2033074565777944 to be less than or equal to 0.19945391284389985` |
| c=2000, fixed end=true | Amortecimento explícito em `pushSpring` | `expected 2.4744349266360928 to be less than or equal to 0.19945391284389985` |
| c=200, fixed end=false | Amortecimento explícito em `pushSpring` | `expected 0.3152428856797645 to be less than or equal to 0.19892729419457963` |
| c=2000, fixed end=false | Amortecimento explícito em `pushSpring` | `expected 19.30252177534476 to be less than or equal to 0.19892729419457963` |

- Restaurado o denominador: `npx vitest run src/sim/acceptance.test.ts -t PHY-40` → **4 passed, 49 skipped**, cobrindo energia não crescente em todos os 600 passos e momento linear conservado nas duas pontas livres, ambos com tolerância 1e-9.
- `npx vitest run src/sim/acceptance.test.ts -t PHY-26` → **26 passed, 27 skipped**, sem alterar tolerâncias existentes.
- Gate completo: `npm test && npm run lint && npm run typecheck && npm run build` → **30 test files passed, 719 tests passed**; lint, typecheck e build com exit 0. Vite emite apenas o aviso de chunks acima de 500 kB.
- Handoff: etapa 2 concluída; revisão e merge ficam para a etapa 3.

#### Resolution (2026-09-30)

Verdict: Approve

##### Standards

Nenhuma violação documentada ou smell relevante. A alteração respeita os Primary files e o vocabulário do domínio, reutiliza `ropeInvMass` e `applyPulls` e registra a mutação e a saída vermelha por teste conforme o `AGENTS.md`.

##### Spec

Nenhum achado. Critérios 1 e 2: os quatro casos verificam energia não crescente durante 600 passos e momento conservado nas pontas livres, com tolerância 1e-9. Critério 3: as asserções e tolerâncias existentes permanecem iguais. Critério 4: o ADR explica o amortecimento implícito e sua motivação. Critérios 5 e 6: mutação repetida e gate verde. A massa efetiva inclui rotação e exclui pontas fixas; o lead elástico, a leitura instantânea e a cadeia PHY-30 preservam seu comportamento contratado.

Standards: 0 achados; Spec: 0 achados.

##### Verificação e encerramento

- Arquivos revisados: `src/sim/simulator.ts`, `src/sim/acceptance.test.ts`, ADR-0004 e este ticket. Histórico conferido: `b2f453b` contém testes vermelhos antes da produção; `9e674be` altera produção e documentação sem tocar testes.
- Mutate-verify repetido na etapa 3: removido apenas o denominador de `pushSpring`, aplicando `s.k * dx + s.c * rate`; `npx vitest run src/sim/acceptance.test.ts -t PHY-40` → **4 failed, 49 skipped**, todos no passo 2, com as quatro saídas idênticas às registradas na tabela da etapa 2. Fonte restaurada byte a byte.
- Verde após restaurar: PHY-40 → **4 passed, 49 skipped**; PHY-26 → **26 passed, 27 skipped**.
- Rebase na sessão já atualizado; gate executado novamente: **30 test files passed, 719 tests passed**; lint, typecheck e build com exit 0. Permanece o aviso já documentado do chunk tardio do Rapier acima de 500 kB.
- Merge sem squash: `166294a`, em `sweatshop/2026-09-24-1853`. `Stage: done` e ledger registrados juntos no commit de encerramento.
