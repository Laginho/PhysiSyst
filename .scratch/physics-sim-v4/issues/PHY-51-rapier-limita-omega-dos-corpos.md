# PHY-51: O Rapier limita o ω de qualquer corpo a 15π rad/s, e uma bola pequena não rola acima de 4,7 m/s
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir)

#### What to build

O Rapier limita |ω|·Δt a π/4 por passo, em qualquer corpo: 15π ≈ 47,12 rad/s com Δt = 1/60. O limite não depende dos substeps e não tem parâmetro na API JS 0.20. Para um corpo que rola, isso põe um teto na velocidade de rolamento: 4,7 m/s com r = 0,1 e 11,8 m/s com r = 0,25. Acima dele, o corpo escorrega, e o atrito cinético o freia até o teto.

Medido com probes descartáveis no motor público, sobre `0c75336`: um círculo de 1 kg num chão comprido, `muS = muK = 0,5`, lançado com `vx` e sem giro, lido depois de 2 s. O esperado, para um disco 2D (I = ½mr²), é rolar a ⅔·v₀.

| r | v₀ | `vx` | −ω·r | Teto do Rapier |
| --- | --- | --- | --- | --- |
| 0,1 | 6 | 3,945 | 4,066 | 4,712 |
| 0,1 | 15 | 5,251 | 4,555 | 4,712 (deveria rolar a 10) |
| 0,25 | 15 | 9,918 | 10,083 | 11,781 |

O contorno do PHY-50 (zerar o ω durante o `world.step()`) não serve aqui, porque o Rapier precisa girar o corpo para os contatos.

**Por que está bloqueado:** falta decidir o caminho. As opções são avisar em `warnings` quando um corpo chega ao teto, diminuir o Δt do mundo (o teto sobe, mas muda o custo e todas as calibrações das cordas e molas), ou aceitar o limite e documentá-lo.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-50, a partir de um probe descartável sobre `0c75336`. Nada foi commitado.
