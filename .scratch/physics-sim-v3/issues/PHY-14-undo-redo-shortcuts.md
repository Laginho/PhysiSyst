# PHY-14: Undo/redo, Delete, atalhos e menu `?`
Stage: to-review
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

## Mutate-verify (App.test.ts, seam DOM/integração)

Cada mutação abaixo foi aplicada em `src/App.tsx`, rodada isoladamente (`npx
vitest run src/App.test.ts -t "<nome>"`), confirmado vermelho pelo motivo
certo, depois revertida. `history.test.ts`/`shortcuts.test.ts` chamam a
função de produção direto — sem registro aqui, por protocolo.

1. **"a full drag (...) is exactly one undo step"** — `if (drag && ...)` em
   `onPointerUp` virou `if (false && drag && ...)` (nenhum push de
   histórico no fim do drag). Vermelho: posição pós-Ctrl+Z ficou `{x:10,
   y:5}` em vez de `{x:11, y:5}` — o Ctrl+Z não tinha o que desfazer.
2. **"a panel edit (mass) enters the undo stack..."** — `commitDoc` perdeu
   a linha `setHistory((h) => pushHistory(h, prev))`. Vermelho: massa
   ficou `5` após Ctrl+Z em vez de voltar a `1`.
3. **"creating a new scene clears the undo stack"** — `setHistory(clearHistory())`
   removido do fim de `switchToScene`. Vermelho: botão ↶ continuou
   habilitado (`false` em vez de `true`) depois de "nova cena".
4. **"undo during playback pauses..."** — `dispatch({ type: 'pause' })`
   removido do início de `undo()`. Vermelho: botão de playback ficou
   `undefined` para `▶ reproduzir` (nunca voltou a pausado).
5. **"Backspace removes the selected body..."** — `case 'delete':` no
   switch do listener virou um `break` vazio (sem chamar `deleteSelected`).
   Vermelho: o fieldset do corpo continuou presente (`true` em vez de
   `false`) depois do Backspace.
6. **"Delete/Backspace do nothing while focus is in a text field"** —
   `inTextField` virou a constante `false`. Vermelho: o fieldset do corpo
   sumiu (`false` em vez de `true`) mesmo com o foco no campo de massa.
7. **"shows a `?` popover..."** — `onClick` do botão `?` virou `() => {}`.
   Vermelho: `host.textContent` não continha mais `'Ctrl+Z'` depois do
   clique.
8. **"↶ and ↷ are disabled until there is something..."** — `disabled={!canUndo(history)}`
   virou `disabled={false}` no botão ↶. Vermelho: `disabled` ficou `false`
   logo após montar o App, sem nenhuma edição ainda.

## Verificação live em browser (critério 12)

`npm run dev` via preview do editor, localStorage limpo:

- Arrastar um corpo (várias posições de pointermove) e apertar Ctrl+Z:
  volta exatamente à posição de antes do drag; botão ↶ fica desabilitado.
- Selecionar um corpo, focar o campo "massa (kg)", apertar Backspace: só
  o dígito é apagado (o campo volta ao valor controlado), o corpo continua
  no canvas.
- Selecionar o corpo (sem foco em campo) e apertar Backspace: o corpo e
  o contato que dependia dele somem juntos (removeBodyAndDependents).
- Botão `?`: abre o popover com a tabela de atalhos (só "Ctrl", sem menção
  a Mac/Cmd); Esc fecha.
- Tecla Espaço (disparada fora de um campo de texto) alterna
  reproduzir/pausar; Ctrl+Z durante o playback pausa o transporte antes de
  restaurar o doc (botão volta a "▶ reproduzir").

## Comments
