# PHY-60: Rótulo de massa com subscrito e fora de corpo pequeno
Stage: blocked
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/render/draw.ts (o `fillText(label)` dos rótulos de massa em ~243 e o rótulo em `drawArrow`)
  - src/render/draw.test.ts

#### What to build

O rótulo de massa sai literal, com o sublinhado (`m_a`, `m_b`), centrado no corpo; num corpo pequeno (o contrapeso de 0,2 m da polia móvel) ele transborda o contorno e fica ilegível. Os rótulos de vetor já desenham `_` como subscrito (`drawArrow`).

1. O rótulo de massa desenha o subscrito como os de vetor: base na fonte normal, o que vem depois do primeiro `_` na fonte menor e mais baixo. A divisão base/subscrito sai de um helper só, usado pelos dois.
2. Quando a largura medida do rótulo (`ctx.measureText`, base + subscrito) não cabe dentro da caixa do corpo na tela, com margem, o rótulo vai para fora: logo acima e à direita da caixa envolvente do corpo, sem rotação.

#### Acceptance criteria

1. Um corpo com rótulo `m_b` produz um `fillText('m', …)` e um `fillText('b', …)` com a fonte do subscrito; nenhum `fillText` recebe `m_b`.
2. Um corpo cuja caixa na tela é maior que o rótulo medido desenha o rótulo no centro, como hoje.
3. Um corpo cuja caixa na tela é menor que o rótulo medido desenha o rótulo fora da caixa envolvente.
4. Rótulos sem `_` (`m`, `M`) saem como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/draw.test.ts`, com o contexto de canvas falso que o arquivo já usa (o `measureText` dele precisa devolver uma largura controlada): critérios 1 a 3 vermelhos hoje. O 4 passa hoje e vai junto.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 5, "o m_b está bem ruim").

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-60-rotulo-massa-asked-20261003-0051`): PHY-60 implementado, mas marcado `blocked` por escopo. /  / - Subscritos e posicionamento externo prontos. / - 27 testes focados, lint, typecheck e build passaram. / - Restam sete falhas causadas por canvases falsos em `src/App.test.ts`. /  / Posso incluir esse arquivo para corrigir os dois retornos de `measureText`? A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “the implementer may touch those files and nothing else”; ele está fora dos `Primary files`. /  / Trabalho preservado nos commits `0426c42` e `9ece33d`.
