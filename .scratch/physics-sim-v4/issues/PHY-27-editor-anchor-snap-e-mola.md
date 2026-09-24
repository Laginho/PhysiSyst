# PHY-27: Editor I — Anchor snap e ferramenta Mola
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-26
Review: agent

- Primary files:
  - New: `src/editor/anchorSnap.ts`, `src/editor/anchorSnap.test.ts`
  - `src/editor/doc.ts`, `src/editor/doc.test.ts` (adicionar, editar e remover mola)
  - `src/editor/hitTest.ts`, `src/editor/hitTest.test.ts` (acertar uma mola)
  - `src/App.tsx`, `src/App.test.ts`
  - `src/render/draw.ts` (destaque de seleção da mola)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

O aluno cria uma mola pela paleta: clica num ponto do corpo A, depois num ponto do corpo B. Cada clique passa pelo **Anchor snap**: perto do centro de massa, do meio de uma face ou de um vértice, a âncora vai para lá; senão fica onde clicou. Esc cancela no meio. A mola nasce relaxada (`x₀ = x`). Clicar na mola a seleciona: o inspetor mostra `k`, `x₀`, `Δx` e `c`, com `x₀` e `Δx` editáveis e ligados; Delete a remove; tudo é desfazível. Com a mola selecionada durante o playback, o painel de leitura mostra `F_el` e `Δx`.

O mesmo Anchor snap passa a valer para o ponto de aplicação das forças aplicadas, que ganha arraste no canvas (os campos numéricos continuam).

#### Acceptance criteria

1. `anchorSnap(body, pontoDoMundo, transform)` devolve a âncora local: centro de massa, meio de face ou vértice quando dentro de uma tolerância fixa em pixels de tela (o mais próximo vence); o próprio ponto caso contrário; puro, para os três formatos de Corpo
2. Ferramenta Mola: clique em A → clique em B cria exatamente uma mola com as âncoras do snap e `x₀` = distância atual; clique fora de Corpo é ignorado; clique em B = A é ignorado; Esc entre os cliques cancela sem mexer no doc
3. Inspetor da mola: editar `k`, `c`, `x₀`; editar `Δx` grava `x₀ = x − Δx`; valores inválidos seguem a regra de aviso do codec
4. Arrastar um corpo ligado mantém `x₀` e muda o `Δx` mostrado
5. Clicar na mola seleciona; Delete remove só a mola; Ctrl+Z restaura
6. Durante o playback, com a mola selecionada, o painel mostra `F_el` e `Δx` lidos do simulador
7. Arrastar o ponto de aplicação de uma força no canvas move a âncora com Anchor snap; um arraste = um passo de undo
8. Strings novas nos dois catálogos
9. Verificação live em browser: montar massa-mola à mão (chão fixo, parede fixa, bloco, mola da parede ao bloco), `Δx = −0,1`, play, oscila
10. Testes novos no `App.test.ts` com mutação aplicada e saída vermelha registradas em `## Comments` (AGENTS.md)
11. Gate verde

#### Verification

    npx vitest run src/editor src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/anchorSnap.test.ts`: candidatos, tolerância, mais próximo, fora da tolerância (1). Vermelho porque o módulo não existe.
- `src/editor/doc.test.ts`: operações da mola e o vínculo `x₀`/`Δx` (2–3).
- `src/editor/hitTest.test.ts`: acerto na mola (5).
- `src/App.test.ts`, no espelho do pointer e do teclado: criação, cancelamento, seleção, Delete, undo, arraste do ponto de força (2, 4, 5, 7). Vermelho porque a ferramenta não existe.

## Comments
