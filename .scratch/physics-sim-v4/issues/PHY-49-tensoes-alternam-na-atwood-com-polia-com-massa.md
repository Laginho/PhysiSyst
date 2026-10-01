# PHY-49: O disco da polia com massa gira o quanto a previsão assume, e as tensões param de alternar
Stage: done
Status: ready-for-agent
Blocked by: PHY-45
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`Grip`, `gripShares`, o `spin` em `pullPieces`, `correctPieces`, a criação dos grips em `buildWorld`)
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)` e o `atwoodScene` que ele já usa)

#### What to build

Uma Atwood sobre polia com massa lê T₁ e T₂ constantes e acelera certo enquanto o disco gira rápido. Hoje as duas tensões alternam a cada passo, a oscilação cresce com a velocidade do disco, e o movimento oscila junto.

Medido com probes descartáveis no motor público, sobre `ace3e09`, na Atwood 1/3 do repouso (`atwoodScene(1, 3, 2)`). A forma fechada dá a = 3,924 m/s², T₁ = 13,734 N e T₂ = 17,658 N:

| Passo | T₁ / T₂ (N) | Aceleração de `a` (m/s²) |
| --- | --- | --- |
| 50 | 14,028 / 17,885 | 4,218 |
| 73 | 12,767 / 16,947 | 2,957 |
| 74 | 14,727 / 18,418 | 4,917 |

**A causa.** O Rapier gira o disco menos do que ω·Δt. Em cada substep ele avança o ângulo por `atan(ω·h)`, e não por `ω·h`. Com ω = 16 rad/s faltam 0,0004 rad por passo; o ω ele integra certo. O `gripShares` mede as peças pelo ângulo do Rapier (`disk.rotation()`), mas a previsão de `pullPieces` assume que o disco gira `Δt·ω`. A cada passo, as duas peças ganham erros de posição de sinais opostos: uma fica do lado frouxo do `ropeAllowance` e a outra do lado esticado. Com inclinações diferentes nos dois lados e o `K` mal condicionado do disco, o laço do warm start (`residual`) passa a ter ganho de cerca de −1,05 por passo.

Para medir esse ganho, somei uma perturbação de 1 N ao residual de uma peça, com 2/2 e `M = 2`. Com o disco parado ela morre em 6 passos. Com ω = 16 ela alterna sem decair. Um disco mais leve (`M = 0,2`) amplifica o primeiro passo em 5,5 vezes. Sem o warm start das peças a alternância some, mas isso tiraria o warm start dos contatos e do atrito em toda cena com polia com massa.

**A decisão.** Cada grip integra o próprio giro do passo, `Δt·(ω₀ + φ·(ω₁ − ω₀))`, e para de ler `disk.rotation()`. `ω₀` é o ω do disco em `pullPieces`, antes do passo. `ω₁` é o ω depois do `world.step()`, antes da correção, quando `correctPieces` atualiza os shares. É a mesma conta que o `spin` da previsão já faz, então previsão e correção passam a ver o mesmo disco. O Rapier continua dono do ω do disco. O ângulo dele não é lido em mais nenhum lugar.

Um protótipo descartável de 7 linhas deu T₁ = 13,734 e T₂ = 17,658 em todo passo até o bloco chegar ao disco. Os 741 testes da suíte, o typecheck e o lint ficaram verdes, sem mudar tolerância.

**Fora do escopo:**
- O Rapier limita o ω de qualquer corpo a 15π ≈ 47,12 rad/s (Δt = 1/60, 4 substeps). Acima disso o disco para de responder ao torque, e a Atwood diverge. Fica para o PHY-50.
- O bloco que chega ao disco é o PHY-45.

#### Acceptance criteria

1. Atwood com `atwoodScene(1, 3, 2)` e o teto em `y = 40`, solta do repouso, ao longo de 160 passos (ω chega a 42 rad/s):
   - em todo passo, T₁ e T₂ (`segments`) ficam a menos de 1% de `m₁(g + a)` e `m₂(g − a)`, com `a = (m₂ − m₁)g/(m₁ + m₂ + M/2)`;
   - no passo 160, a velocidade de `a` fica a menos de 1% de `a·t`.
2. O mesmo para `atwoodScene(3, 2, 2)` com o teto em `y = 40`, ao longo de 300 passos (ω chega a 33 rad/s).
3. Os testes existentes de `acceptance.test.ts` e `simulator.test.ts` continuam verdes sem mudar tolerância, incluindo os da polia com massa (PHY-25), o PHY-43, a polia com massa no suporte em movimento (CLEAN-17) e a polia móvel com massa.
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`. A mutação é voltar a medir o giro do disco por `wrapAngle(disk.rotation() − rotation)`. Com ela, o critério 1 fica vermelho por volta do passo 41.
5. Gate verde.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-49
    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `pulley with mass (PHY-25)`, pelo motor público (`createSimulator(parse(scene))`, `step()`, `readStates()`, `readConstraints()`), sem mocks. O teto sobe mudando a `position.y` do corpo `teto` na cena, como o PHY-43 já muda o `vy` de `a`. Os dois cenários dos critérios 1 e 2 ficam vermelhos hoje porque as tensões alternam: o 1/3 sai de 1% no passo 41 e o 3/2 chega a 37% de erro.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-45, a partir de um achado lateral do diagnóstico descartável sobre `b29d75a`.
- 2026-10-01 Stage 1. Probes descartáveis sobre `ace3e09` acharam a causa (o Rapier gira o disco por `atan(ω·h)` a cada substep) e prototiparam a integração própria do giro. O Bruno aprovou método, critérios e o PHY-50 para o limite de ω. Os números da primeira versão deste ticket estavam errados: o par "T₁ / T₂" eram leituras de T₁ em passos seguidos. Nada do protótipo foi commitado.
- 2026-10-01 Bloqueado pelo PHY-45 no stage 1 de revisão dele: o sweatshop roda os dois em sequência, e o critério 3 daqui precisa manter verdes os 24 cenários novos do PHY-45. Medido com os protótipos empilhados sobre `9d81e26`: continuam verdes, e os 741 testes também.
- 2026-10-01 Stage 2. `Grip.rotation` virou `Grip.w0` (ω antes do passo, gravado em `pullPieces`); `gripShares` recebe o giro do passo em vez de ler `disk.rotation()`; `correctPieces` integra `Δt·(w0 + φ·(ω₁ − w0))`, a mesma conta do `spin` da previsão. Nenhum arquivo de teste tocado fora do commit vermelho.
  - Vermelho antes da mudança (`ddb72bb`): 1/3 kg `T₁ at step 41: expected 0.1536 to be <= 0.1373`; 3/2 kg `T₂ at step 92: expected 0.2326 to be <= 0.2289`.
  - Mutação (voltar a `wrapAngle(disk.rotation() − rot0)` em `correctPieces`, com `rot0` iniciado em `pullPieces`): os dois testes ficam vermelhos nos mesmos passos, 41 e 92. Código restaurado depois.
  - Gate: 793 testes, lint, typecheck e build verdes, sem mudar tolerância.

#### Resolution (2026-10-01)

Verdict: Approve

Revisão em sub-agentes independentes nos eixos Standards e Spec, sobre `git diff 8b1a0dea6469a4d0e908238c96812c9796a7cd80...01d279a999b1c6541c792d2d1b42b6daa318b86c`, base `sweatshop/2026-10-01-1211`. Dependência PHY-45 concluída. Nenhuma correção persistente de produção ou testes feita pela etapa 3; nenhuma linha `Proxy decided` neste ticket.

**Standards:** 0 violações de código/testes e 0 smells que justifiquem mudança; 1 pendência de documentação, registrada no CLEAN-21. O ADR-0004 ainda diz que o giro do disco passa por `wrapAngle` e precisa ficar abaixo de π por passo, contrariando a integração entregue aqui. O ADR está fora dos Primary files e a atualização não é critério deste ticket. Primary files e separação entre testes e produção respeitados: `ddb72bb` acrescenta os dois testes e muda o Stage para `implementing`; `01d279a` altera produção e evidência do ticket, sem tocar testes.

**Spec:** 0 achados; critérios 1–5 atendidos. Os testes usam `createSimulator(parse(scene))`, `step`, `readStates` e `readConstraints`, com formas fechadas independentes, teto em `y = 40`, tensões verificadas em todos os 160/300 passos e velocidade final de `a` dentro de 1%. `w0` é capturado antes de aplicar as tensões; todos os shares integram `Δt·(w0 + φ·(ω₁ − w0))` antes de qualquer impulso de correção. Rapier continua dono de ω, sem leitura do ângulo do disco. Inicialização, grupos com disco compartilhado, grupos sem grips, suporte móvel e peças frouxas conferidos; warm start, testes existentes e tolerâncias preservados.

**Mutate-verify repetido pelo reviewer:** acrescentar `rot0` a cada grip, inicializá-lo e capturar `disk.rotation()` em `pullPieces`; substituir somente o giro integrado de `correctPieces` por `wrapAngle(disk.rotation() − rot0)`. Comando: `npx vitest run src/sim/acceptance.test.ts -t PHY-49`.

| Teste novo | Saída vermelha reproduzida |
| --- | --- |
| Atwood 1/3 kg, 160 passos | `T₁ at step 41: expected 0.15355083678567283 to be less than or equal to 0.13734000000000002` |
| Atwood 3/2 kg, 300 passos | `T₂ at step 92: expected 0.23261273546197003 to be less than or equal to 0.22890000000000002` |

Resultado da mutação: **1 file failed, 2 tests failed, 118 skipped (120)**, exit 1. Produção restaurada byte a byte, SHA-256 idêntico ao anterior e `git diff --exit-code -- src/sim/simulator.ts` limpo. Mesmo comando após restauração: **1 file passed, 2 tests passed, 118 skipped (120)**, exit 0.

**Gate padrão após restauração e rebase:** `npm test && npm run lint && npm run typecheck && npm run build` → **30 files passed, 793 tests passed**, suíte em 33,02 s; lint, typecheck e build exit 0. O gate anterior à mutação também passou 793/793. Apenas o aviso existente do chunk tardio do simulador acima de 500 kB; sem flags de workers, mudança de timeout ou de tolerância.

Rebase sobre a sessão já atualizado, sem conflitos. Branch `phy/PHY-49-tensoes-alternam-atwood-polia-massa` integrada com `--no-ff`, sem squash, em `af6badd`. Resolução, linha do ledger e `Stage: done` registrados juntos no commit de fechamento sobre a sessão. O limite de ω continua no PHY-50; atualização do ADR no CLEAN-21.

Totais: Standards 0 achados bloqueantes e 1 pendência no CLEAN-21; Spec 0 achados.
