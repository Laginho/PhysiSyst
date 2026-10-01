# PHY-48: Mola com massa amortecida explode a partir de c ≈ 100 (acoplamento explícito com os corpos)
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

O PHY-40 deixou a mola com massa (PHY-30) fora do escopo, dizendo que ela "já é implícita no `chainStep` (θ-método, `κ = k′ + c′/θΔt`)". Isso só vale para o lado de dentro da cadeia. As pontas entram no `chainStep` como pontos prescritos, que seguem com a velocidade de agora. As forças `fa`/`fb` que saem do passo vão para os corpos como força externa explícita (`addForceAtPoint` em `pushChain`). Cada elo da cadeia carrega `(N + 1)·c`, com `N = CHAIN_NODES = 8`. Com `c` alto, o elo da ponta fica muito mais duro do que um passo explícito aguenta contra a massa do corpo, e a mola injeta energia.

Medido no motor real (`parse` → `createSimulator` → `step` → `readStates`), na cena horizontal do bloco PHY-26 (`horizontalScene`): `m = 1`, `k = 40`, `x₀ = 1`, massa da mola `mₛ = 0,1`, solta parada em `Δx = 0,1`, `E₀ = 0,2 J`, 600 passos:

| `c` | `max E` | Estado |
| --- | --- | --- |
| 0 | 0,2006 J | oscila, ok |
| 20, 30, 50, 80 | 0,2000 J | decai, acompanha a analítica da mola ideal |
| 100 | 81 561 J | diverge, ±270 m/s |
| 150 | 82 581 J | diverge |
| 200 | 84 437 J (em 60 passos) | 11 456 J já no passo 10, `vx = 151 m/s` |

O limiar fica entre `c = 80` e `c = 100` para esse par `m`/`mₛ`. O gpt-6-astra reproduziu um caso equivalente, com pivô fixo e `g = 0`: 0,2 J viram 11 438 J em 10 passos. A correção do PHY-47 (mola ideal) não toca este caminho.

**Por que está bloqueado:** falta decidir o método, e é decisão de stage 1. O candidato natural é pôr as pontas no próprio solve θ do `chainStep`, como nós com a massa efetiva do corpo ao longo do eixo (`1/K`, com `K` de `ropeInvMass`; ponta fixa = massa infinita). Assim a força na ponta sai implícita, como o PHY-47 faz na mola ideal. Só que isso mexe no `CHAIN_THETA = 0,55` e no atraso `(θ − 1 + φ)·Δt` que o PHY-30 calibrou para a amplitude e o cancelamento do ringing. O stage 1 precisa escolher o método com um protótipo e fixar critérios que mantenham os testes do PHY-30 sem mudar tolerância. Um ponto de partida para os critérios: a tabela acima com energia nunca crescente para todo `c ≥ 0`, e `Δx(t)` perto da mola ideal amortecida quando `mₛ → 0`.

## Comments

- 2026-09-30 Aberto a partir do review de benchmark do PR 9. O defeito veio do gpt-6-astra (high), o limiar foi medido por mim com probes descartáveis no motor real, sobre `0ff2047`. Nada foi commitado e nenhum protótipo foi feito para este caminho.
