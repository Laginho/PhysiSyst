# PHY-14: Undo/redo, Delete, atalhos e menu `?`
Stage: implementing
Status: ready-for-agent
Blocked by: none

- Primary files:
  - New: `src/editor/history.ts` + `src/editor/history.test.ts`
  - New: `src/editor/shortcuts.ts` + `src/editor/shortcuts.test.ts`
  - `src/App.tsx` (um listener de teclado, pilha de undo, botões ↶ ↷, popover `?`)
  - `src/App.test.ts`
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts` (chaves novas nos dois catálogos)

#### What to build

O aluno pode desfazer e refazer qualquer edição de cena, remover o corpo selecionado pelo teclado, e controlar o playback sem o mouse. Botões ↶ ↷ na barra de playback ficam desabilitados quando não há o que desfazer/refazer. Um botão `?` (e a tecla `?`) abre um popover listando todos os atalhos; Esc ou clique fora fecha. Nenhum atalho dispara enquanto o foco está em um campo de texto.

Atalhos: Ctrl+Z desfaz · Ctrl+Shift+Z e Ctrl+Y refazem · Delete/Backspace remove o corpo selecionado · Espaço play/pause · → um passo · R reinicia · Esc desmarca (ou fecha o menu) · `?` abre/fecha o menu. `Cmd` funciona como `Ctrl` no código; o menu mostra só "Ctrl".

#### Acceptance criteria

1. Módulo puro de histórico: `push`, `undo`, `redo`, `clear`, `canUndo`, `canRedo`, limite de 50 entradas, `push` descarta o ramo de redo
2. Função pura tecla→ação: recebe tecla, modificadores e se o foco está em campo de texto; devolve o nome da ação ou nulo (`metaKey` ≡ `ctrlKey`, campo de texto → nulo, tecla desconhecida → nulo)
3. Um arraste completo (move, rotate, resize, α) é um único passo de undo: push no pointer-up, nunca no pointer-move
4. Toda edição de painel que muda o doc (massa, fixo, v₀, μ, força, g, modo partícula, adicionar/remover corpo, adicionar/remover contato) entra na pilha
5. Trocar, importar, criar ou excluir cena limpa a pilha
6. Undo/redo durante playback pausa, restaura o doc e passa pelo rebuild estrutural normal; nenhuma lógica nova de playback
7. Delete/Backspace com corpo selecionado usa a mesma remoção com dependentes da lixeira e limpa a seleção
8. Botões ↶ ↷ na barra de playback, `disabled` quando `canUndo`/`canRedo` é falso; títulos via i18n
9. Botão `?` abre popover com a tabela de atalhos; fecha com Esc, clique fora ou `?`; nomes das ações via i18n; sem menção a Mac/Cmd no texto
10. Um único listener de teclado no App; atalhos ignorados com foco em `input`, `textarea`, `select` ou `contenteditable`
11. Todas as chaves novas existem em pt-BR e EN (paridade em `i18n.test.ts` continua verde)
12. Verificação live em browser: arrastar, Ctrl+Z volta; Backspace dentro de um campo numérico apaga o dígito, não o corpo; Espaço alterna play/pause
13. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
14. Gate verde

#### Verification

    npx vitest run src/editor/history.test.ts src/editor/shortcuts.test.ts src/App.test.ts src/i18n/i18n.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/history.test.ts`, no módulo puro: cada operação, o limite de 50, o descarte do ramo de redo (critério 1). Vermelho porque o módulo não existe.
- `src/editor/shortcuts.test.ts`, na função tecla→ação: cada atalho da tabela, `metaKey` ≡ `ctrlKey`, campo de texto → nulo, tecla desconhecida → nulo (2). Vermelho porque a função não existe.
- `src/App.test.ts`, no espelho: um passo por arraste (3), uma edição de cada painel na pilha (4), troca de cena limpa a pilha (5), undo durante playback pausa (6), Delete remove com dependentes (7). Vermelhos porque o App ainda não tem pilha nem listener.
- `src/i18n/i18n.test.ts` continua sendo a paridade (11) — não é teste novo.

## Comments
