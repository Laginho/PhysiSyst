# PHY-64: Player de tempo, um slider para navegar na simulação
Stage: blocked
Status: needs-triage
Review: human
Difficulty: hard

- Primary files (provável):
  - src/playback/scheduler.ts, src/playback/index.ts
  - src/sim/simulator.ts (estado do mundo)
  - src/App.tsx (transporte play/pause/reset/passo)

#### What to build

Um slider de tempo, como num player de vídeo: arrastar para qualquer instante já simulado e ver a cena (corpos, cordas, vetores, leituras) naquele instante.

Hoje o transporte só anda para frente: play, pause, passo único e reset para t = 0. Não há histórico de estados.

Perguntas para o stage 1 (planner):
- Como voltar no tempo: snapshot do mundo (Rapier `takeSnapshot`) a cada N passos e re-simular a partir do mais próximo, ou guardar só o que o desenho precisa (estados dos corpos, leituras, contatos) por passo? O passo fixo determinístico (ADR-0001) permite a primeira.
- Até onde o slider vai: só o já simulado (como o buffer de um vídeo), ou um horizonte fixo pré-simulado?
- Teto de memória do histórico e o que acontece ao estourar.
- Dar play depois de voltar: continua dali descartando o futuro guardado, ou reaproveita (o futuro é o mesmo, por determinismo)?
- Edição estrutural já é só em t = 0 (PHY-39): arrastar o slider até t = 0 libera a edição?

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 4). Feature nova, `Stage: blocked` até o planner fazer o stage 1.
