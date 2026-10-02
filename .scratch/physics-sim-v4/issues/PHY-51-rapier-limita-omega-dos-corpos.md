# PHY-51: O Rapier limita o ω de qualquer corpo a 15π rad/s, e uma bola pequena não rola acima de 4,7 m/s
Stage: to-review
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

- 2026-10-02 Stage 2: base `sweatshop/2026-10-01-2342`, branch `phy/PHY-51-rapier-limita-omega-dos-corpos`. Leitura dos callers: `App.tsx` chama `step()` no playback e `replaceScene()` nas edições estruturais; nenhum caller externo lê `warnings`. Preservar avisos de construção e rebuild transacional. Corpos fixos/particle mode têm ω = 0; discos de polia ficam fora de `bodies` e já contornam o teto pelo PHY-50. Testes cobrem ambos os sinais, dois corpos, deduplicação e reutilização do id após rebuild.
- 2026-10-02 Probe pelo `Simulator` público antes da implementação: r = 0,1, g = 9,81, chão de 200 m, muS = muK = 0,5. vx = 6: máximo |ω| = 40,655708 rad/s em 240 passos (0,862741 do teto). vx = ±15: |ω| = 45,548443 em 120 passos (0,966568), máximo 46,456573 em 240 (0,985839). Limiar escolhido: |ω|·TIMESTEP ≥ 0,95·π/4.
- 2026-10-02 Red antes de código: `npx vitest run src/sim/simulator.test.ts -t 'angular speed limit warnings'`: **4 failed | 1 passed | 29 skipped (34)**. Os dois sentidos e o rebuild falham com `expected [] to have a length of 1 but got +0`; dois corpos falham com `expected [] to have a length of 2 but got +0`. O caso abaixo do teto passa.
- 2026-10-02 Mutate-verify no código de produção, com restauração após cada execução. Todos os comandos usam `npx vitest run src/sim/simulator.test.ts -t '<nome abaixo>'`:
  - `warns once with the body id` (vx = 15 e -15): trocar `0.95 * angularLimit` por `Infinity` → **2 failed | 32 skipped**, `expected [] to have a length of 1 but got +0`. Retirar a guarda por id (`!this.angularLimitWarnedBodies.has(id)` → `true`) → **2 failed | 32 skipped**, `expected [ …(92) ] to have a length of 1 but got 92`.
  - `keeps construction warnings unchanged`: trocar o limiar de 0,95 por 0,80 → **1 failed | 33 skipped**, `expected [ Array(1) ] to deeply equal []`, contendo o aviso indevido para `ball`.
  - `replaceScene clears ceiling warnings`: retirar `this._warnings.length = 0` → **1 failed | 33 skipped**, `expected [ Array(1) ] to deeply equal []` logo após rebuild. Retirar `this.angularLimitWarnedBodies.clear()` → **1 failed | 33 skipped**, `expected [] to have a length of 1 but got +0` ao reutilizar `ball` na nova corrida rápida.
  - `reports each body independently`: trocar a guarda por id por `this.angularLimitWarnedBodies.size === 0` → **1 failed | 33 skipped**, `expected [ Array(1) ] to have a length of 2 but got 1`.
- 2026-10-02 Green inicial: `npx vitest run src/sim/simulator.test.ts` → **34 passed (34)**. Documentação conferida com `rg -n 'π/4' docs/adr/0001-rapier2d-physics-engine.md`, incluindo teto, rolamento e `warnings`.
- 2026-10-02 Gate final após restaurar as mutações: `npm test && npm run lint && npm run typecheck && npm run build` → **exit 0**, **30 test files passed; 805 tests passed (805)**, ESLint e TypeScript sem erros, Vite build concluído (49 módulos). Vite avisa sobre chunk maior que 500 kB (`sim` ≈ 2,13 MB); não bloqueia o build. `git diff --check` passou. Diff revisado: somente os três Primary files e este registro; testes no commit red `d910f16`, commit de produção sem alterações nos testes. Critérios 1–4 implementados; aviso continua na API, com apresentação na UI reservada ao PHY-53.

- 2026-10-01 Aberto no stage 1 do PHY-50, a partir de um probe descartável sobre `0c75336`. Nada foi commitado.
- 2026-10-01 Triagem (stage 1). Proxy decided: avisar em `warnings` e documentar no ADR-0001; não reduzir o Δt — (b) recalibra todas as cordas e molas e o teto continua lá; um aviso é reversível e segue o ADR-0002 (desvio do livro não fica calado). O proxy também achou que `Simulator.warnings` não chega à UI; isso virou o PHY-53.
