# PHY-50: O Rapier limita o ω do disco da polia com massa a 15π rad/s, e a Atwood diverge acima disso
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

O Rapier limita o ω de qualquer corpo a 15π ≈ 47,12 rad/s com Δt = 1/60 e 4 substeps. Medi isso num disco que gira livre: com `setAngvel(50)` ou `setAngvel(100)`, um `world.step()` devolve ω = 47,1239 e gira 0,7755 rad. Acima desse limite, o disco da polia com massa para de responder ao torque da corda. As peças esticam e a correção explode.

Na Atwood 1/3 com `M = 2` e o teto em `y = 40`, com o protótipo do PHY-49 aplicado, T fica exato até o passo 180 (ω = 47,09). No passo 181 o disco bate no limite: o ω ganha −0,036 rad/s em vez de −0,262. A partir daí T₂ vai a 37 N em 5 passos. Com R = 0,25, o limite é uma velocidade de aro de 11,8 m/s, que uma Atwood comum alcança em 3 s de queda.

O limite vale para qualquer corpo do Rapier, não só para o disco. Ninguém mediu ainda se um bloco girando rápido sofre o mesmo, nem como contornar: integrar o ω do disco por conta própria, mudar parâmetros do Rapier, ou avisar quando uma cena passa do limite.

**Por que está bloqueado:** falta decidir se vale a pena cobrir isso, achar o caminho e fixar critérios. É trabalho de stage 1.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-49, a partir de probes descartáveis sobre `ace3e09`. Nada foi commitado.
