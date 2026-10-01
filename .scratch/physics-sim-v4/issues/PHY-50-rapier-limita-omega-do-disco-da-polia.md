# PHY-50: O disco da polia com massa passa de 15π rad/s, e a Atwood continua certa acima disso
Stage: done
Status: ready-for-agent
Blocked by: PHY-49
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`step()`, em volta do `world.step()`)
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)` e o `atwoodScene` que ele já usa)

#### What to build

Uma Atwood sobre polia com massa continua com T₁ e T₂ constantes e acelera certo quando o disco passa de 47 rad/s. Hoje o disco trava ali, as peças esticam e a correção explode.

O Rapier limita |ω|·Δt a π/4 por passo, em qualquer corpo: 15π ≈ 47,12 rad/s com Δt = 1/60. O limite não depende dos substeps (medido com 1, 2, 4, 8 e 16: sempre 47,1239). Com Δt = 1/30 cai para 23,56 rad/s, com 1/120 sobe para 94,25 rad/s. A API JS 0.20 não expõe parâmetro para mudar isso. Com R = 0,25 o limite é uma velocidade de aro de 11,8 m/s, que uma Atwood comum alcança em 3 s.

Medido com probes descartáveis no motor público, sobre `0c75336` com o protótipo do PHY-49 aplicado, `atwoodScene` com o teto em `y = 40`:

| Cenário | ω no fim | Hoje (com o PHY-49): pior erro de T, sai de 1% no passo | Com o contorno: pior erro de T / erro de v |
| --- | --- | --- | --- |
| 1/3, `M = 2`, 250 passos | 65 | 112%, passo 181 | 0,125% / 0,000% |
| 3/1, `M = 2`, 250 passos | −65 | 112%, passo 181 | 0,053% / 0,000% |
| 1/3, `M = 0,2`, 230 passos | 73 | 226%, passo 148 | 0,031% / 0,000% |
| 1/3, `M = 20`, 400 passos (abaixo do limite) | 37 | 0,11%, nunca | 0,094% / 0,000% |

**A decisão.** Em `step()`, logo antes do `world.step()`, cada disco guarda o próprio ω e fica com ω = 0. Logo depois, recebe o ω guardado mais o `angvel()` que o Rapier deixou. Durante o passo o Rapier só soma `Δt·τ/I` do torque da corda, exato e longe do limite. A previsão (`pullPieces`) e a correção (`correctPieces`) continuam lendo o ω inteiro. O ângulo do disco no Rapier deixa de significar alguma coisa, e por isso o ticket depende do PHY-49, que tira a última leitura de `disk.rotation()`. Nenhum outro código lê esse ângulo.

O sono do disco não precisa de nada: ele é acordado a cada passo, e a medição com e sem `setCanSleep(false)` deu o mesmo.

**Por que não as outras formas:**
- Tirar o disco do Rapier e integrar o ω à parte: muda `RopePull`, `ropeInvMass`, `freePointVelocity` e `applyPulls`, que esperam um `RigidBody`, para o mesmo resultado.
- Subdividir o Δt do mundo: o limite sobe, mas muda o custo e todas as calibrações das cordas e molas, e continua existindo.

**Fora do escopo:**
- Corpos comuns batem no mesmo limite (uma bola de r = 0,1 não rola acima de 4,7 m/s). O contorno não serve para eles, porque o Rapier precisa girá-los para os contatos. Fica para o PHY-51.
- O bloco que chega ao disco (o 1/3 com `M = 0,2` diverge no passo 236 por isso) é o PHY-45.

#### Acceptance criteria

1. `atwoodScene(1, 3, 2)` e `atwoodScene(3, 1, 2)`, com o teto em `y = 40`, soltas do repouso, ao longo de 250 passos (|ω| chega a 65 rad/s):
   - em todo passo, T₁ e T₂ (`segments`) ficam a menos de 1% de `m₁(g + a)` e `m₂(g − a)`, com `a = (m₂ − m₁)g/(m₁ + m₂ + M/2)`;
   - no passo 250, a velocidade de `a` fica a menos de 1% de `a·t`.
2. O mesmo para `atwoodScene(1, 3, 0.2)` com o teto em `y = 40`, ao longo de 230 passos (ω chega a 73 rad/s).
3. Os testes existentes de `acceptance.test.ts` e `simulator.test.ts` continuam verdes sem mudar tolerância, incluindo os do PHY-25, do PHY-49, a polia com massa no suporte em movimento (CLEAN-17) e a polia móvel com massa.
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`. A mutação é tirar o guarda-e-devolve do ω. Com ela, o 1/3 com `M = 2` fica vermelho no passo 181.
5. Gate verde.

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-50
    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco `pulley with mass (PHY-25)`, pelo motor público (`createSimulator(parse(scene))`, `step()`, `readStates()`, `readConstraints()`), sem mocks. O teto sobe como nos testes do PHY-49. Os três cenários dos critérios 1 e 2 ficam vermelhos hoje porque o disco trava em 47 rad/s: os dois com `M = 2` saem de 1% no passo 181, e o de `M = 0,2` no passo 148.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-49, a partir de probes descartáveis sobre `ace3e09`. Nada foi commitado.
- 2026-10-01 Stage 1. Probes descartáveis sobre `0c75336` mediram o limite (|ω|·Δt ≤ π/4, em qualquer corpo, sem depender dos substeps) e prototiparam o guarda-e-devolve do ω em volta do `world.step()`, sobre o protótipo do PHY-49. Os 741 testes ficaram verdes. O Bruno aprovou método, dependência, critérios e o PHY-51 para os corpos comuns. Nada do protótipo foi commitado.
- 2026-10-01 Stage 2. Teste vermelho em commit próprio: os três cenários saíam de 1% nos passos 181, 181 e 148, como o ticket previu. Correção em `step()`: cada disco guarda o ω e entra no `world.step()` com ω = 0, e sai com o guardado mais o `angvel()` do Rapier. Os três ficam verdes; PHY-25 e PHY-49 seguem verdes sem mudar tolerância.
- 2026-10-01 Mutate-verify (critério 4). Mutação: tirar o guarda-e-devolve do ω (deixar só `this.world.step()`). Saída vermelha: `T₁ at step 181: expected 2.1142636745780994 to be less than or equal to 0.13734` (1/3, M = 2), `T₁ at step 181: expected 1.2716671046931367 to be less than or equal to 0.17658` (3/1, M = 2), `T₁ at step 148: expected 0.5534703854770608 to be less than or equal to 0.1459536585365854` (1/3, M = 0,2). Código restaurado, verde de novo.
- 2026-10-01 Gate: `npm test` com o timeout padrão tem 1 vermelho, `simulator.test.ts` "a body launched beyond the viewport integrates indefinitely" (timeout de 5000 ms; 6,3 s com a suíte em paralelo, 3,6 s sozinho). Ele falha igual na árvore sem a minha mudança, não tem polia e está fora dos Primary files. Com `npx vitest run --testTimeout=30000`: 796/796 verdes. Lint, typecheck e build verdes. Candidato a `CLEAN-*` (o teste anda em milhares de passos, dependente da velocidade da máquina).

#### Resolution (2026-10-01)

Verdict: Approve

Revisão em sub-agentes independentes nos eixos Standards e Spec, sobre `git diff f44de5abea4339f5476f1a79ce55ced182b5fe18...54b0350a5e59a0813c769faf4c55e81b573b4b33`, base `sweatshop/2026-10-01-1211`. Dependência PHY-49 concluída. Nenhuma correção de produção ou de testes feita pela etapa 3 e nenhuma decisão de proxy neste ticket.

##### Standards

Sem achado bloqueante. Primary files e separação test-first respeitados: `c89d8f3` contém somente os três casos de regressão e `Stage: implementing`; `54b0350` contém somente a correção em `step()` e os metadados do ticket, sem tocar testes.

Duas observações não bloqueantes:

- O ADR-0004 ainda apresenta o limite de ω do Rapier como teto do disco da polia. O guarda-e-devolve entregue pelo PHY-50 supera essa limitação para os cenários aprovados. Atualização exigida pelo Quality gate §5 e por `docs/agents/domain.md` (Flag ADR conflicts); como o ADR está fora dos Primary files e dos critérios numerados, aberta CLEAN-22 para a documentação.
- Possível Duplicated Code (heurística): o runner e as asserções dos três casos repetem o padrão do PHY-49. A explicitação independente das regressões é defensável; não há quebra de padrão documentado nem benefício concreto que justifique refatoração neste review.

##### Spec

0 achados; critérios 1–5 atendidos. Os três casos pelo motor público usam o teto em y = 40, os 250/250/230 passos, os limites de 1% em cada passo para T₁/T₂ e a velocidade final a·t. O snapshot de ω ocorre depois da previsão; o Rapier recebe zero durante o passo; o ω inteiro é restaurado antes da correção. Os discos têm translação travada e colliders sem contatos, e não há leitor restante de `disk.rotation()`. Conjuntos vazios de discos, polias de massa zero, suporte móvel e discos compartilhados não apresentam regressão na leitura do diff nem na suíte existente. Nenhuma mudança de tolerância, API ou escopo de produção.

##### Red-green e mutate-verify reproduzidos

`npx vitest run src/sim/acceptance.test.ts -t PHY-50` antes da mutação: **3 verdes, 120 ignorados pelo filtro**. Mutação registrada repetida em produção: retirada das três instruções que guardam ω, zeram `angvel()` e restauram ω, deixando `world.step()` integrar o ω inteiro. Resultado: **3 vermelhos, 120 ignorados pelo filtro**, nos mesmos passos previstos.

| Teste público PHY-50 | Mutação | Saída vermelha |
| --- | --- | --- |
| Atwood 1 / 3 kg, M = 2, 250 passos | Sem guarda-e-devolve de ω | `AssertionError: T₁ at step 181: expected 2.1142636745780994 to be less than or equal to 0.13734000000000002` |
| Atwood 3 / 1 kg, M = 2, 250 passos | Sem guarda-e-devolve de ω | `AssertionError: T₁ at step 181: expected 1.2716671046931367 to be less than or equal to 0.17658` |
| Atwood 1 / 3 kg, M = 0.2, 230 passos | Sem guarda-e-devolve de ω | `AssertionError: T₁ at step 148: expected 0.5534703854770608 to be less than or equal to 0.1459536585365854` |

Arquivos restaurados byte a byte em `finally`; `git diff --exit-code -- src/sim/simulator.ts src/sim/acceptance.test.ts` confirmou a restauração. Depois dela, `npx vitest run src/sim/acceptance.test.ts -t PHY-25` → **22 verdes, 101 ignorados pelo filtro**, incluindo PHY-49, PHY-50, CLEAN-17 e a polia móvel com massa. O gate completo confirmou novamente os três casos e todos os testes existentes.

##### Gate e limitação operacional

Gate independente após restauração e rebase: `npm test && npm run lint && npm run typecheck && npm run build`, com `VITEST_MAX_WORKERS=1` somente no ambiente da chamada, restaurado ao terminar. **30 arquivos e 796 testes verdes**, suíte em 105,38 s; lint, typecheck e build exit 0. Timeouts, tolerâncias e configuração persistente preservados. Apenas o aviso existente de chunk tardio do simulador acima de 500 kB.

A concorrência padrão teve **795 verdes e 1 timeout** de 5000 ms no teste antigo `a body launched beyond the viewport…` (`src/sim/simulator.test.ts:520`, 6382 ms). Comparação sem a produção e sem os três testes da PHY-50 — removido o guarda-e-devolve e reposto `acceptance.test.ts` de `f44de5a` — reproduziu o mesmo timeout (6594 ms), com **792 verdes e 1 vermelho** nos 793 testes da base. Esse defeito operacional é anterior à mudança. O uso transitório de um worker segue o precedente já registrado na Resolution do PHY-48 e mantém o timeout original.

##### Integração e fechamento

Rebase sobre a sessão já atualizado, sem conflitos. Branch `phy/PHY-50-omega-do-disco-alem-do-limite-do-rapier` integrada com `--no-ff`, sem squash, em `969ba45`; a árvore após o merge é idêntica à validada (`a0c1c0188de1214ad818c78e87f3eb75b3de523a`). Resolução, linha do ledger, CLEAN-22 e `Stage: done` registrados juntos no commit de fechamento sobre a sessão.

Totais: Standards 2 observações não bloqueantes (documentação encaminhada à CLEAN-22; duplicação apenas heurística); Spec 0 achados.
