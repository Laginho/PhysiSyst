# PHY-62: A galeria abre o preset com um clique, sem criar cena
Stage: blocked
Status: needs-triage
Review: human
Difficulty: normal

- Primary files (provável):
  - src/App.tsx (galeria em ~1805, `switchToScene`, guarda de edição)
  - src/presets/index.ts, src/persistence/index.ts (`createPresetScene`)

#### What to build

Hoje a galeria é uma lista de rádios mais o botão "usar selecionada", que cria uma cena salva nova a partir do preset (`createPresetScene`). Para só olhar um preset é preciso criar uma cena, e cada olhada deixa uma cena a mais na lista.

O Bruno quer: clicar no card do preset e a cena abrir na hora; alternar rápido entre presets só para ver; os presets imutáveis.

Decisões até aqui (Bruno, 2026-10-02):
- Clique no card abre o preset direto, sem confirmar.
- O preset aberto é só para ver; a primeira edição cria uma cena salva dele automaticamente e passa a editar a cópia. O preset nunca muda.

Perguntas para o stage 1 (planner):
- Rodar o play num preset aberto conta como edição? (Provável: não.)
- O que o seletor de cenas mostra enquanto um preset está aberto, e o que volta depois de recarregar a página?
- Undo da primeira edição: volta ao preset ou fica a cópia sem a edição?
- A galeria fica aberta ao trocar de preset? (Para alternar rápido, provavelmente sim.)

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 2). `Stage: blocked` até o planner escrever spec e critérios.
