# 03: Undo/redo, Delete, atalhos e menu `?`

**What to build:** O aluno pode desfazer e refazer qualquer edição de cena, remover o corpo selecionado pelo teclado, e controlar o playback sem o mouse. Botões ↶ ↷ na barra de playback ficam desabilitados quando não há o que desfazer/refazer. Um botão `?` (e a tecla `?`) abre um popover listando todos os atalhos; Esc ou clique fora fecha. Nenhum atalho dispara enquanto o foco está em um campo de texto.

Atalhos: Ctrl+Z desfaz · Ctrl+Shift+Z e Ctrl+Y refazem · Delete/Backspace remove o corpo selecionado · Espaço play/pause · → um passo · R reinicia · Esc desmarca (ou fecha o menu) · `?` abre/fecha o menu. `Cmd` funciona como `Ctrl` no código; o menu mostra só "Ctrl".

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Módulo puro de histórico: `push`, `undo`, `redo`, `clear`, `canUndo`, `canRedo`, limite de 50 entradas, `push` descarta o ramo de redo (testes unitários cobrem cada operação e o limite)
- [ ] Função pura tecla→ação: recebe tecla, modificadores e se o foco está em campo de texto; devolve o nome da ação ou nulo (testes: cada atalho da tabela, `metaKey` ≡ `ctrlKey`, campo de texto → nulo, tecla desconhecida → nulo)
- [ ] Um arraste completo (move, rotate, resize, α) é um único passo de undo: push no pointer-up, nunca no pointer-move (espelho em `App.test.ts`)
- [ ] Toda edição de painel que muda o doc (massa, fixo, v₀, μ, força, g, modo partícula, adicionar/remover corpo, adicionar/remover contato) entra na pilha (espelho cobre ao menos uma edição de cada painel)
- [ ] Trocar, importar, criar ou excluir cena limpa a pilha (espelho)
- [ ] Undo/redo durante playback pausa, restaura o doc e passa pelo rebuild estrutural normal; nenhuma lógica nova de playback (espelho pina a pausa)
- [ ] Delete/Backspace com corpo selecionado usa a mesma remoção com dependentes da lixeira e limpa a seleção (espelho)
- [ ] Botões ↶ ↷ na barra de playback, `disabled` quando `canUndo`/`canRedo` é falso; títulos via i18n
- [ ] Botão `?` abre popover com a tabela de atalhos; fecha com Esc, clique fora ou `?`; nomes das ações via i18n; sem menção a Mac/Cmd no texto
- [ ] Um único listener de teclado no App; atalhos ignorados com foco em `input`, `textarea`, `select` ou `contenteditable`
- [ ] Todas as chaves novas existem em pt-BR e EN (paridade em `i18n.test.ts` continua verde)
- [ ] Verificação live em browser: arrastar, Ctrl+Z volta; Backspace dentro de um campo numérico apaga o dígito, não o corpo; Espaço alterna play/pause
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
