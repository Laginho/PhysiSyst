# PHY-45: Atwood com polia com massa diverge quando um corpo chega à polia
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

O proxy do PHY-43 tirou do escopo o pico de 3157 N no passo 86 depois da retomada da tensão e pediu um ticket próprio se ele persistisse depois da correção. O probe da entrega do PHY-43 só cobriu os passos 1–40. O foreman mediu em 2026-09-30, com um probe descartável no motor público (`parse` → `createSimulator` → `step` → `readConstraints`/`readStates`), no cenário do teste PHY-43 de `src/sim/acceptance.test.ts`: `atwoodScene(2, 2, 2)` com `a.vy = 6`, 240 passos.

O pico persiste, e é o começo de uma divergência:

| Passo | T₁ / T₂ (N) | v_a / v_b (m/s) | y_a (m) |
| --- | --- | --- | --- |
| 85 | 17,52 / 18,18 | 1,743 / −2,213 | 5,386 |
| 86 | 4842,74 / 3160,72 | −9,661 / 23,976 | 5,244 |
| 109 | 72756,55 / 100021,38 | −12,287 / −9,921 | 4,234 |
| 120 | 214135,59 / 0 | 295,294 / 3,710 | 5,523 |
| 239 | 2828784,94 / 0 | −49,436 / −11,683 | −0,824 |

Do passo 86 em diante, `a` oscila entre y ≈ 5,5 e y ≈ −1 com velocidades de centenas de m/s, e a corda alterna entre tensa e frouxa. A energia cresce sem limite.

**Não é regressão do PHY-43.** O mesmo probe em `8e97790^1` (antes do merge do PHY-43) e em `ba1fc7c^1` (antes do PHY-41) também diverge: corda frouxa em todos os passos medidos até o 90 (o `b` em queda livre que o PHY-43 corrigiu), depois 140 kN no passo 200 e 632 kN no 239. O PHY-43 só antecipou o começo, para quando `a` chega perto da polia (y_a ≈ 5,4; a borda da polia fica em y = 5,0, segundo o proxy do PHY-43).

Hipótese, não verificada: o trecho de corda entre `a` e a polia encolhe até perto de zero e o solve fica mal condicionado. Falta decidir o que a física deve fazer quando um corpo chega à polia (colisão, batente, recusa da cena), o que pede uma decisão do stage 1, não só cuidado.

## Comments

- 2026-09-30 Aberto pelo foreman a partir da recomendação 7 do relatório `docs/relatorios/2026-09-30-sweatshop-gpt-6.1-sol.pdf`, aceita pelo Bruno. Medições acima; o probe foi descartado.
