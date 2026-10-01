# PHY-51: O Rapier limita o ω de qualquer corpo a 15π rad/s, e uma bola pequena não rola acima de 4,7 m/s
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/sim/simulator.ts (a detecção do teto no `step()`; o reset de `_warnings` no construtor e no `replaceScene`)
  - src/sim/simulator.test.ts
  - docs/adr/0001-rapier2d-physics-engine.md (nova seção `## Consequences`)

#### What to build

O Rapier limita |ω|·Δt a π/4 por passo, em qualquer corpo: 15π ≈ 47,12 rad/s com Δt = 1/60. O limite não depende dos substeps e não tem parâmetro na API JS 0.20. Para um corpo que rola, isso põe um teto na velocidade de rolamento: 4,7 m/s com r = 0,1 e 11,8 m/s com r = 0,25. Acima dele, o corpo escorrega, e o atrito cinético o freia até o teto.

Medido com probes descartáveis no motor público, sobre `0c75336`: um círculo de 1 kg num chão comprido, `muS = muK = 0,5`, lançado com `vx` e sem giro, lido depois de 2 s. O esperado, para um disco 2D (I = ½mr²), é rolar a ⅔·v₀.

| r | v₀ | `vx` | −ω·r | Teto do Rapier |
| --- | --- | --- | --- | --- |
| 0,1 | 6 | 3,945 | 4,066 | 4,712 |
| 0,1 | 15 | 5,251 | 4,555 | 4,712 (deveria rolar a 10) |
| 0,25 | 15 | 9,918 | 10,083 | 11,781 |

O contorno do PHY-50 (zerar o ω durante o `world.step()`) não serve aqui, porque o Rapier precisa girar o corpo para os contatos.

**Caminho:** avisar e documentar. Quando um corpo chega ao teto, o simulador põe uma linha em `warnings`, e o ADR-0001 registra o limite como consequência da escolha do Rapier. O Δt fica em 1/60. Com 1/120, o teto continua existindo (9,4 m/s com r = 0,1) e o custo é recalibrar todas as cordas e molas.

Hoje o `warnings` do simulador só é preenchido na construção e no `replaceScene`, nunca no `step()`, e nada fora de `src/sim/` o lê. Levar o aviso para a tela é o PHY-53.

O limiar sai do `TIMESTEP`, nunca de 47,12 escrito à mão. No probe, |ω| estabiliza em cerca de 45,55 rad/s (0,967 do teto) com v₀ = 15 e chega a no máximo cerca de 40,66 rad/s (0,863) com v₀ = 6. O gatilho fica entre os dois, por exemplo em |ω|·Δt ≥ 0,95·π/4, e o stage 2 mede antes de fixar.

#### Acceptance criteria

Cena de todos: um círculo dinâmico de 1 kg num chão fixo comprido, `Contact` com `muS = muK = 0,5`, lançado com v₀ = (vx, 0) e sem giro, avançado pelo `Simulator` público.

1. Com r = 0,1 e vx = 15, depois de 120 `step()`, `warnings` tem exatamente uma linha que cita o id do círculo e o teto de ω. Depois de mais 120 passos, ainda tem exatamente uma: uma linha por corpo, não uma por passo.
2. Com r = 0,1 e vx = 6, depois de 240 `step()`, `warnings` é igual ao que era logo após a construção, sem linha de teto.
3. Depois de `replaceScene` de uma corrida que produziu a linha do critério 1 para a cena com vx = 6, `warnings` não tem linha de teto.
4. O ADR-0001 diz que o limite é |ω|·Δt ≤ π/4, que isso dá 15π rad/s no `TIMESTEP` atual, que o rolamento fica limitado a v = 15π·r (4,7 m/s com r = 0,1) e que `warnings` o reporta. Conferido por grep na Verification, não por teste.

#### Verification

    grep -n "π/4" docs/adr/0001-rapier2d-physics-engine.md
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/simulator.test.ts`, no `Simulator` público: os critérios 1 a 3. O 1 é vermelho hoje porque o `step()` nunca escreve em `warnings`. O 2 e o 3 passam hoje e vão junto para fixar que o aviso não aparece abaixo do teto nem sobrevive ao `replaceScene`.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-50, a partir de um probe descartável sobre `0c75336`. Nada foi commitado.
- 2026-10-01 Triagem (stage 1). Proxy decided: avisar em `warnings` e documentar no ADR-0001; não reduzir o Δt — (b) recalibra todas as cordas e molas e o teto continua lá; um aviso é reversível e segue o ADR-0002 (desvio do livro não fica calado). O proxy também achou que `Simulator.warnings` não chega à UI; isso virou o PHY-53.
