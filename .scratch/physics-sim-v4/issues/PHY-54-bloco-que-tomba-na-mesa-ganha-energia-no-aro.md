# PHY-54: Um bloco que tomba na mesa e bate no aro da polia ganha energia
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir)

#### What to build

Na cena da mesa do PHY-23, com o bloco da mesa m₁ = 1, o pendurado m₂ = 2 e μs = μk = 3, o sistema ganha energia, com a polia ideal e com a polia com massa.

O tombo em si é física certa: a corda puxa na altura do centro de um bloco quadrado, então ele tomba quando T > m₁·g. Aqui T ≈ m₂·g = 2g, e μ = 3 impede o deslizamento. Os critérios não podem exigir que o bloco fique em pé. O que falha é a energia que entra no impacto do bloco com o aro e nos trancos de corda que fica frouxa e estica de novo.

Medido com um probe descartável no `Simulator` público, sobre `28b04b7`, 600 passos:

| Corrida | `T` máximo | Ganho máximo de energia dos blocos | Deriva máxima de `a` |
| --- | --- | --- | --- |
| Polia ideal | 1518 N (passo 399) | +733 J (passo 400) | 12,8 m |
| `M = 2` | 4,2 MN (passo 589) | +1,94 MJ | 15,1 m |
| Controle: 2/1, μ = 3, as duas polias | `T` fica em 9,81 N | — | o bloco não se move |

- Polia ideal: o bloco tomba, rola uns 6 m pela mesa e bate no aro por volta do passo 125–130 (x ≈ 4,1–4,6). `T` pula de 306 para 935 N, e a energia dos blocos vai de −80 J para +370 J; no passo 135 está em +502 J. Depois o bloco cai da borda, e os trancos de frouxa-e-esticada somam mais.
- `M = 2`: impacto no aro no passo 156 (`T` = 2687 N, +1006 J). Entre os passos 168 e 187 dispara: `T` = 74 kN no passo 180 e `a` em x ≈ 11 no passo 171.

O caso ideal passa pelo caminho escalar (`correctRope`), que o PHY-52 deixa de fora de propósito, então o PHY-52 não deve resolver este. Os números com `M = 2` misturam os dois mecanismos e precisam ser medidos de novo depois do PHY-52.

**Por que está bloqueado:** falta achar o caminho e fixar os critérios. É trabalho de stage 1.

## Comments

- 2026-10-01 Aberto na triagem do PHY-52. A investigação do PHY-52 achou a divergência com `M = 2`, e o proxy conferiu com polia ideal num probe descartável. Nada foi commitado.
