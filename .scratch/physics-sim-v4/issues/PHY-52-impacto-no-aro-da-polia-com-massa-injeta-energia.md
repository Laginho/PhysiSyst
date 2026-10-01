# PHY-52: Um bloco que bate no aro da polia com massa ganha energia no impacto
Stage: blocked
Status: needs-triage
Blocked by: PHY-45
Review: agent

- Primary files:
  - (a definir)

#### What to build

Um bloco que bate no aro de uma polia com massa (PHY-45) para ali sem que o sistema ganhe energia. Hoje o impacto dá um pico: a energia dos blocos sobe e depois cai, sem divergir.

Medido com probes descartáveis no motor público, sobre `9d81e26` com os protótipos do PHY-45 revisado (aro, guarda e direção guardada), `atwoodScene` com o teto em `y = 6`, 600 passos:

| Cenário, `M = 2` | `max ΔE` dos blocos | Passo |
| --- | --- | --- |
| 3/1 do repouso | +54 J | 89 |
| 1/2 do repouso | +3,1 J | 96 |

Com os protótipos do PHY-49 e do PHY-50 por cima, os números ficam os mesmos. Com polia ideal, os dois cenários não ganham energia.

O que se viu no 3/1:
- Antes do impacto, a energia total, contando o disco (cerca de 15 J), está conservada. No passo 89 os blocos estão +54 J acima de E₀, então o sistema ganhou pelo menos 40 J.
- `b` bate no aro a 5,5 m/s. A correção da corda não enxerga o contato: ela calcula um impulso que moveria `b`, o contato o cancela, e o warm start (`residual`) acumula tensão passo a passo. As peças ficam esticadas de 5 a 15 cm.
- A corda puxa `b` contra o aro sem atrito, e `b` escorrega por cima dele: sobe 0,6 m em 4 passos, até acima do centro da polia. Enquanto isso, `a` (3 kg) é parado e jogado para cima a 1,66 m/s.
- A peça entre o disco e `b` fica com poucos centímetros, e a perna gira rápido dentro do passo. A diagonal de `K` na previsão cai para 0,074, contra cerca de 2 antes do impacto, sem ficar negativa, e a tensão vai a 674 N.
- Uma guarda com limiar relativo (`ropeInvMass(pulls, along) ≤ f·ropeInvMass(pulls, pulls)`, com f = 0,25, 0,5 e 0,75) não ajudou: o 3/1 ficou em +27 J, e o 1/3 e o 1/4 passaram a falhar.

**Por que está bloqueado:** depende do aro do PHY-45, e falta achar o caminho e fixar os critérios. É trabalho de stage 1.

## Comments

- 2026-10-01 Aberto no stage 1 de revisão do PHY-45, a partir de probes descartáveis sobre `9d81e26`. Nada foi commitado.
