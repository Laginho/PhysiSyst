# CLEAN-03: ADR-0004 descreve a predição por posição e o fator de subpasso ganha teste
Stage: reviewing
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md`
  - `src/scene/index.ts` (comentário de cabeçalho, linhas sobre as travas do PHY-24)
  - `src/sim/acceptance.test.ts`

#### What to build

O PHY-24 trocou o mecanismo da corda sem tocar no documento que o descreve. Três resíduos, todos fora dos Primary files daquele ticket (achados do review do PHY-24, 2026-09-24):

1. `docs/adr/0004-*.md`, seção Mechanism, passo 1, ainda descreve a predição por taxa do PHY-23 (velocidade prevista, `T` escolhido pela taxa, `K = Σ 1/m + (r×u)²/I` sobre as duas pontas). O código de `pullRope` agora prevê por posição: integra o passo livre como o Rapier integra (`φ = (n + 1)/2n` com `n = world.numSolverIterations` subpassos, medido 5/8 com n = 4), puxa ao longo das pernas do meio do passo, usa `K = J M⁻¹ J′ᵀ` assimétrico (J do meio, J′ do fim), soma os puxões de uma mesma polia móvel e sua ponta no mesmo corpo, e a correção compartilha `ropeAllowance` com a predição. A tabela Measured só tem as famílias do PHY-23; as do PHY-24 estão em `## Comments` do ticket (volta de 1 m, `v₀² = 6gL`: |dist − L| ≤ 0,05 mm; ~4% de energia por volta perdida na projeção).
2. `src/scene/index.ts:16-19` diz que o codec ainda rejeita corda fora de exatamente uma polia e polia em Corpo dinâmico. Só a massa de polia continua rejeitada (PHY-25).
3. `φ` não está preso por teste: com `φ = 1` a volta de 1 m estica ~12 mm e a suíte fica verde (conferido no review, `20 passed`), porque nenhum critério do PHY-24 pede comprimento na volta.

#### Acceptance criteria

1. O ADR-0004 descreve o mecanismo que `pullRope`/`correctRope` implementam hoje (predição por posição, `φ`, pernas do meio do passo, `K` assimétrico, puxão no eixo da polia móvel, `ropeAllowance` compartilhada) e a tabela Measured ganha as famílias do PHY-24; o que fica preso por `ponytail:` (perda de energia na projeção) aparece em Consequences
2. O comentário de `src/scene/index.ts` diz só o que o codec rejeita hoje
3. `src/sim/acceptance.test.ts`: na volta de 1 m com `v₀² = 6gL`, |dist(bola, pivô) − L| ≤ 1 mm em todo passo da primeira volta; vermelho com `φ = 1`
4. Testes de regressão mutate-verified (a mutação `φ = 1` e sua saída vermelha em `## Comments`)
5. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`: comprimento da corda na volta (3). Não fica vermelho no código atual (o `φ` certo já está lá); o vermelho é a mutação `φ = 1`, registrada em `## Comments`.

## Comments

- 2026-09-24 Aberto pelo review do PHY-24 (stage 3). Os três itens estavam anotados pelo stage 2 em `## Comments` do PHY-24 como fora dos Primary files; nenhum é critério daquele ticket, então o PHY-24 fechou como está.

Etapa 2 (2026-09-24), mutate-verify (critério 4). Teste novo em `805edd5`: `acceptance: general rope (PHY-24) > loop with v₀² = 6gL: the rope stays at L (±1 mm) every step of the first turn (CLEAN-03)`. Verde no código atual (pior |dist − L| = 0,045 mm), como o ticket previa.

| Mutação | Vermelho |
|---|---|
| `pullRope`: `const phi = 1` no lugar de `(n + 1) / (2 * n)` | `Tests 1 failed \| 20 passed (21)`; `AssertionError: expected 0.011633209588792104 to be less than or equal to 0.001` — só o teste novo |

Revertida depois. A tabela Measured do ADR foi remedida no código atual com logs descartáveis no `acceptance.test.ts` (revertidos, fora dos commits): as linhas do PHY-23 mudaram um pouco com o mecanismo novo (Atwood `T` 0,003% → 0,004%, mesa μₖ = 0,2 `T` 0,788% → 0,490%) e foram atualizadas junto com as famílias novas.

Gate verde no commit de docs: 29 arquivos, 542/542 testes, lint, typecheck, build (só o aviso de chunk > 500 kB, que já existia).

Etapa 3 (2026-09-24). O teste novo copiava o laço de varredura do irmão `loop with v_top² > gL` inteiro (mesma cena, mesmo laço); o review fundiu a asserção de comprimento nesse teste, agora `loop with v_top² > gL: goes all the way round with T > 0 and the rope at L (±1 mm) every step (CLEAN-03)`. Mutate-verify refeito no teste fundido:

| Mutação | Vermelho |
|---|---|
| `pullRope`: `const phi = 1` | `Tests 1 failed \| 19 passed (20)`; `AssertionError: expected 0.011633209588792104 to be less than or equal to 0.001` — só o teste fundido |

Revertida depois. O ADR também recuperou a linha de tolerâncias do PHY-23 (2%, 5%, 1 mm) que o commit de docs tinha apagado.
