# PHY-56: O desenho da corda mostra a corda solta da polia
Stage: blocked
Status: needs-triage
Blocked by: PHY-54
Review: agent

- Primary files:
  - (a definir)

#### What to build

Depois que a corda sai de uma polia ideal (PHY-54), o desenho mostra a corda reta entre as pontas, como a simulação a resolve.

Hoje o desenho (`scenePath`, chamado por `src/render/draw.ts` e `src/render/overlay.ts`) refaz o caminho a cada quadro pelas poses, sem direção guardada e sem histórico de varredura. Com o PHY-54, a corda da simulação fica reta e os blocos podem cair juntos para longe da polia, mas a corda desenhada continua subindo até a polia, dando a volta nela e descendo. O PHY-45 já tinha deixado um descompasso parecido como só visual (as pernas se cruzando por baixo do disco); este é maior, porque a corda desenhada passa por uma polia que a corda simulada não toca.

O histórico mora no `RopeBinding` do simulador, e o `ropePath` do PHY-54 já sabe usá-lo. Falta levá-lo do simulador até o desenho, que é uma costura nova. Também `draw.ts` desenha o arco com `arc.start + arc.direction * arc.sweep`, então uma varredura desenrolada negativa ou acima de 2π precisa de cuidado ali.

**Por que está bloqueado:** depende da interface do `ropePath` com histórico, que o PHY-54 fixa. Achar a costura (o que o simulador expõe e como o desenho lê) e fixar os critérios é trabalho de stage 1.

## Comments

- 2026-10-01 Aberto no stage 1 do PHY-54 por decisão do proxy. Nada foi commitado.
