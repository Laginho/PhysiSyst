# PHY-55: A corda se solta da polia com massa quando o bloco passa por ela, sem ganho de energia
Stage: blocked
Status: needs-triage
Blocked by: PHY-52, PHY-54
Review: agent

- Primary files:
  - (a definir)

#### What to build

O mesmo que o PHY-54, para a polia com massa (PHY-25): quando o bloco passa por cima do disco e segue além dele, a corda sai do disco e fica reta, sem ganho de energia. Inclui a corda mista (uma polia com massa e polias ideais no mesmo caminho): o PHY-54 não passa histórico a nenhuma polia de uma corda com grip.

Medido com um probe descartável no `Simulator` público, sobre `0ab2f57` com o protótipo do PHY-54 (só polias ideais), cena da mesa do PHY-23 com 1/2, μ = 3 e `mass: 2` na polia, 600 passos: no passo 156 a varredura no disco vai de 0,28 para 5,67 rad (a costura 0/2π), `T` vai a 2687 N e a energia dos blocos sobe cerca de 1060 J num passo. Daí em diante diverge: +1,94 MJ.

Aplicar ao grip a mesma regra do PHY-54 (varredura negativa = perna reta) sem mais nada não resolve: +285 kJ. A corda que sai do disco junta as duas peças numa só, e quando reengata o ponto de divisão muda, então o comprimento de cada peça deixa de ser fixo pela vida do mundo, como o ADR-0004 diz hoje. O reengate é também um impacto: o aro do disco e a corda chegam com velocidades diferentes.

**Por que está bloqueado:** os números com `M = 2` misturam este mecanismo com o impacto no aro do PHY-52, e o caminho depende do histórico de varredura do PHY-54. Medir de novo depois dos dois e fixar caminho e critérios. É trabalho de stage 1.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-54, a partir de probes descartáveis sobre `0ab2f57`. Nada foi commitado.
