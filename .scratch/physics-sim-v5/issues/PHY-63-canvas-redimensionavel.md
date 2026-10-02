# PHY-63: Canvas da cena redimensionável
Stage: blocked
Status: needs-triage
Review: human
Difficulty: normal

- Primary files (provável):
  - src/render/fitCanvas.ts (`fitCanvas`, `CANVAS_MIN_WIDTH = 600`)
  - src/App.tsx (o `ResizeObserver` do `canvasBoxRef` em ~773)

#### What to build

O canvas ocupa o maior 3:2 que cabe no contêiner, com piso de 600 px de largura. O Bruno acha grande demais e quer poder redimensionar.

Perguntas para o stage 1 (planner):
- Controle: alça de arrastar na borda do canvas, slider de tamanho, ou poucos tamanhos fixos?
- O tamanho escolhido persiste entre recargas?
- O piso de 600 px cai? Até quanto? Ele existe hoje por causa do layout lado a lado com o inspetor.
- Redimensionar muda o zoom (a cena inteira cabe em qualquer tamanho) ou só a área visível, mantendo pixels por metro?

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 3; confirmado que "preview" é o canvas da cena). `Stage: blocked` até o planner escrever spec e critérios.
