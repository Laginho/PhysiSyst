# CLEAN-25: Junções de polias soltas em ordem invertida alongam o caminho e puxam as polias
Stage: blocked
Status: needs-triage
Blocked by: PHY-54
Review: agent

- Primary files:
  - (a definir pelo stage 1)

#### What to build

(A definir pelo stage 1 após a triagem do achado em Comments. Este arquivo ainda não autoriza implementação.)

#### Acceptance criteria

(A definir pelo stage 1.)

#### Verification

(A definir pelo stage 1 a partir da reprodução abaixo.)

## Tests stage 2 writes (own commit, red)

(A definir pelo stage 1.)

## Comments

- 2026-10-02 Aberto no stage 3 do PHY-54. O eixo Spec encontrou uma limitação nova em `ropePath.release`; o revisor principal a reproduziu com o código de produção de `497fc6f` transpileado e importado em memória, sem editar a produção. Não falha um cenário numerado do PHY-54 nem demonstra comportamento anterior correto perdido; não é motivo de reabertura daquele contrato.
- Reprodução: R = 1 em ambas as polias, `keep = [-1, -1]`. Pontas iniciais `a = (-3, -2)` e `b = (8, -2)`; polias, na ordem `via`, em `(0, 0)` e `(5, 0)`. A primeira leitura não recebe histórico; cada leitura seguinte recebe os sweeps da anterior. Subir as duas pontas de h = -2 até h = 2 em passos de 0,001. Ambas se soltam: `length = 11`, sweeps `[-0.4303793433006886, -0.4303793433006895]`. Manter as pontas e baixar a segunda polia até y = -3 em passos de 0,001; depois mover a primeira de x = 0 até 5 e a segunda de x = 5 até 0 simultaneamente, também em passos de 0,001.
- Resultado final: pontas `(-3, 2)/(8, 2)`, polias `(5, 0)/(0, -3)`, sweeps `[-0.4303793433006895, -1.3104262520688144]`. As duas polias seguem soltas, com projeções distintas no interior da perna, mas as junções seguem `via`: `(5, 2)` e `(0, 2)`. Os segmentos percorrem 8 + 5 + 8 = **21 m**, em vez da perna reta de **11 m**. Somar as direções unitárias adjacentes como `ropeFrame` faz resulta em puxões por unidade de tensão **(-2, 0)/(2, 0)**, em vez de zero.
- Localização no commit inspecionado: `src/scene/ropePath.ts:141` monta as junções na ordem de `via`; `src/sim/simulator.ts:244` lê os puxões dos segmentos. O caso não é a exclusão explícita do PHY-54 de duas projeções presas na mesma ponta. Antes de implementar, o stage 1 precisa fixar como preservar o caminho e a associação de cada polia quando a ordem das projeções muda, definir a fronteira e publicar critérios e testes. Nenhuma decisão de arquitetura foi tomada nesta revisão.
