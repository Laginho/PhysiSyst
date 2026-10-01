# PHY-49: As tensões lidas na Atwood com polia com massa alternam a cada passo, e a oscilação cresce
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

O diagnóstico do PHY-45 viu, na Atwood com polia com massa, que as tensões das duas peças lidas em `readConstraints` alternam a cada passo, e a amplitude dessa alternância cresce com o tempo. Na Atwood 1/3 solta do repouso (`atwoodScene(1, 3, 2)`, polia com `M = 2`):

| Passo | T₁ / T₂ (N) |
| --- | --- |
| 50 | 13,45 / 14,03 |
| 74 | 12,77 / 14,73 |

O valor esperado de T₁ é 13,73 N. O defeito já existia antes do PHY-45, e a cena do teste PHY-25 não o cobre. Ninguém verificou ainda se é só a leitura ou se o movimento também oscila, nem de onde vem a alternância (previsão de `pullPieces`, warm start em `residual`, ou a correção).

**Por que está bloqueado:** falta reproduzir com probe, achar a causa e fixar critérios. É trabalho de stage 1.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-45, a partir de um achado lateral do diagnóstico descartável sobre `b29d75a`. Números do probe; nada foi commitado.
