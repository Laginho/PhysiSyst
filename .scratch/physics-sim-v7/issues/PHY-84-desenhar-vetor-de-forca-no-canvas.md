# PHY-84: Desenhar vetor de força no canvas e digitar o módulo
Stage: blocked
Status: needs-triage
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - (a definir no grilling; provavelmente src/App.tsx, src/editor/doc.ts (`addForce`, `updateForce`), src/render/draw.ts)

#### What to build

Ideia registrada no feedback da v6, fora do spec da v7: o aluno desenha a **direção** de uma força aplicada diretamente no canvas (arrastando a partir de um ponto do corpo) e **digita o módulo** em seguida, em vez de clicar em "adicionar força" e preencher direção e módulo em campos numéricos. A âncora cairia pelo encaixe de âncora existente; a direção, pelo arrasto; o módulo, por um campo que aparece ao soltar.

Nada decidido ainda: nem a interação (ferramenta na paleta vs. gesto sobre o corpo selecionado), nem o que acontece com o módulo antes de ser digitado, nem a relação com o `ForcesPanel` atual. Precisa de uma sessão de grilling antes de virar spec.

#### Acceptance criteria

1. (a escrever no grilling)

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- (a escrever no grilling)

## Comments

- 2026-10-04 Stage 1 (planner). Aberto do feedback do Bruno sobre a v6, a pedido dele, para um grilling futuro. `Stage: blocked` porque não há contrato para implementar: a sessão que receber este id deve reportar e parar até o grilling acontecer.
