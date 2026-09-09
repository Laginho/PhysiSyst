# PHY-14: Undo/redo, Delete, atalhos e menu `?`
Stage: done
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
15. Nenhum atalho dispara quando o elemento focado trata a tecla nativamente: com foco em `button`, Espaço (e Enter) ativa o botão, não o playback
16. O rótulo da tecla Espaço na tabela do popover vem do i18n — nenhuma palavra em português hard-coded no JSX do menu

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

#### Review (2026-09-09) — reopened

Separação dos commits certa (`51f1767` só toca teste + a linha `Stage:`, os dois
commits de código não tocam teste nenhum), gate verde de verdade — 25 arquivos /
436 testes, lint, typecheck, build — e o registro mutate-verify tem as oito
mutações com o vermelho de cada. O módulo puro e a função tecla→ação estão bem
desenhados. Dois defeitos reais, nenhum pego por critério existente porque os
critérios 9 e 10 estão cumpridos na letra.

- 1 ✓ `history.ts` puro e genérico; `push` fatia em `HISTORY_LIMIT = 50` e zera `future`; `undo`/`redo` recebem o valor corrente e devolvem `null` na borda
- 2 ✓ `actionForKey` pura; `metaKey ≡ ctrlKey`, `inTextField` → nulo, tecla desconhecida → nulo, e `if (ctrl) return null` preserva Ctrl+R
- 3 ✓ `startDoc` capturado no pointer-down das quatro variantes de drag, um único `pushHistory` no pointer-up
- 4 ✓ tudo que muda o doc passa por `commitDoc`: g, modo partícula, `PropertiesPanel`, forças, contatos, duplicar, `addShape`, `deleteSelected`
- 5 ✓ os quatro caminhos (trocar, importar, criar, excluir cena) desembocam em `switchToScene`, que chama `clearHistory()`
- 6 ✓ `undo`/`redo` despacham `pause` antes do `setDoc`; nenhuma lógica nova de playback
- 7 ✓ `deleteSelected` é o mesmo caminho do botão do painel — `removeBodyAndDependents` + `setSelectedId(null)`
- 8 ✓ `disabled={!canUndo(history)}` / `{!canRedo(history)}`, títulos via `playback.undoTitle`/`redoTitle`
- 9 ❌ letra cumprida, intenção não: o popover abre/fecha nos três gestos e os nomes das ações vêm do i18n, mas o rótulo da tecla Espaço é o literal `Espaço` no JSX, fora de qualquer `t()`. Em EN a tabela mostra "Espaço — play/pause". Os outros rótulos (`Ctrl+Z`, `→`, `R`, `Esc`, `Delete / Backspace`) são neutros; só esse é uma palavra
- 10 ❌ letra cumprida, intenção não: o listener é único e ignora `input`/`textarea`/`select`/`contenteditable`, mas não o caso em que o elemento focado **já trata a tecla nativamente**. Com foco em qualquer `<button>` — paleta, ↶, ↷, `?`, reiniciar, cenas, exportar — Espaço cai em `togglePlay` com `preventDefault()`, e o botão nunca ativa. Um usuário de teclado tabula até "retângulo", aperta Espaço e o playback alterna em vez de criar o corpo. Prova (probe descartável em jsdom, `keydown` de `' '` despachado com o botão da paleta focado): `defaultPrevented === true`. O checkbox do modo partícula escapa por acidente, porque o `tagName` dele é `INPUT`
- 11 ✓ 11 chaves novas nos dois catálogos, paridade verde
- 12 ✓ registro live presente e coerente com o código (drag → Ctrl+Z, Backspace em campo numérico, `?`, Espaço, undo durante playback)
- 13 ✓ oito mutações em `src/App.tsx`, cada uma com o vermelho que produziu; `history.test.ts` e `shortcuts.test.ts` chamam produção direto, sem registro por protocolo
- 14 ✓ gate verde

O que falta (tudo dentro dos Primary files; reabre porque o item 1 precisa de
teste novo, e essa é a regra mecânica do `ticket-flow`, não uma questão de
tamanho do diff):

1. Critério 15 — excluir do atalho a tecla que o controle focado ativa por conta
   própria. Espaço e Enter com foco em `button` têm de chegar no botão. Fica
   melhor como um campo novo do `KeyInput` do que como um `inTextField`
   esticado: `inTextField` significa "campo de texto", e um botão não é um.
   Teste em `shortcuts.test.ts` para a função pura, mais um em `App.test.ts` que
   prenda o observável (Espaço com a paleta focada cria o corpo e não mexe no
   transporte)
2. Critério 16 — uma chave nova (`shortcuts.keySpace`) nos dois catálogos e
   `t()` no lugar do literal. Sem teste novo: a paridade de `i18n.test.ts` já
   cobre

Nota, não bloqueia e não é critério: soltar um corpo na lixeira **sem nenhum
pointermove** entre o pointer-down e o pointer-up não empilha nada
(`drag.startDoc === docRef.current`, então o `push` não acontece, e a remoção
logo abaixo entra sem entrada de histórico). Só é alcançável se o corpo já
estiver por baixo do alvo da lixeira; se algum dia for, o conserto é empilhar
`startDoc` também no ramo da lixeira.

#### Reabertura resolvida (2026-09-09)

- 15 ✓ novo campo `targetHandlesKeyNatively` em `KeyInput` (`shortcuts.ts`),
  não um `inTextField` esticado. `actionForKey` devolve `null` para
  Espaço/Enter quando o alvo já trata a tecla (checkbox escapa por acidente
  como antes, porque continua sendo `INPUT` → `inTextField`). `App.tsx`
  calcula `targetHandlesKeyNatively: tag === 'BUTTON'` no listener único.
  Teste novo na função pura (`shortcuts.test.ts`) e no observável
  (`App.test.ts`: Espaço com a paleta focada não previne o default e não
  mexe no transporte). Mutate-verify: `targetHandlesKeyNatively: tag ===
  'BUTTON'` virou `targetHandlesKeyNatively: false`; vermelho por
  `event.defaultPrevented` `true` em vez de `false`; revertido.
- 16 ✓ chave `shortcuts.keySpace` em `pt-BR.ts`/`en.ts`, `t('shortcuts.keySpace')`
  no lugar do literal `Espaço` no JSX do popover. Sem teste novo — paridade
  de `i18n.test.ts` já cobre.
- Gate verde: 440 testes / lint / typecheck / build.
- Commits: `test(PHY-14): red tests for native-activation targets (criteria
  15-16)` (só teste), depois o commit de código (`shortcuts.ts`, `App.tsx`,
  `pt-BR.ts`, `en.ts` — nenhum arquivo de teste).

#### Resolution (2026-09-09)

Reabertura fechada. Revisão de stage 3 conferiu os dois itens que faltavam e
re-verificou o resto por amostragem — nada regrediu.

- 15 ✓ `targetHandlesKeyNatively` é campo próprio do `KeyInput`, não um
  `inTextField` esticado, e a decisão fica na função pura; `App.tsx` só informa
  `tag === 'BUTTON'`. `NATIVE_ACTIVATION_KEYS` cobre Espaço e Enter, e o guarda
  entra **depois** de `inTextField` e **antes** do ramo de Ctrl — por isso
  Ctrl+Z continua funcionando com um botão focado (há teste para isso). Varri o
  JSX: não existe `role="button"`, `tabIndex` nem `<a>` no app, então todo
  controle focável é `BUTTON` de verdade ou cai em `inTextField` — `tagName`
  basta, não falta caso
- 16 ✓ `t('shortcuts.keySpace')` no lugar do literal; nenhuma palavra em
  português sobrou no JSX do popover (as outras células são `Ctrl+Z`,
  `Ctrl+Shift+Z / Ctrl+Y`, `Delete / Backspace`, `→`, `R`, `Esc`, `?`, todas
  neutras)

Mutate-verify refeito pelo revisor, não aceito de palavra:
`targetHandlesKeyNatively: tag === 'BUTTON'` → `false` em `src/App.tsx`,
`npx vitest run src/App.test.ts -t "Space with a palette button focused"` →
vermelho em `expect(event.defaultPrevented).toBe(false)` (recebeu `true`),
revertido em seguida.

Gate rodado pelo revisor: **440 testes / 25 arquivos**, `eslint` limpo,
`tsc --noEmit` limpo, `vite build` ok (só o aviso de chunk > 500 kB que já
existia).

Duas observações, nenhuma bloqueia:

- O teste de App para o critério 15 se chama "creates the body", mas o que ele
  prende é `defaultPrevented === false` mais o transporte intacto — jsdom não
  ativa `<button>` por Espaço. A asserção é a certa e é a única que pode
  regredir (o bug era o `preventDefault`); a ativação em si é comportamento do
  próprio navegador. O nome promete um pouco mais do que o corpo entrega
- Tentei confirmar a ativação nativa em browser de verdade: o harness de
  preview não entrega `key` nos eventos sintéticos (um `<button>` de controle
  criado na mão também não recebeu `click`), então a checagem live desse item
  não é possível por aqui. Fica pela via lógica acima

Merge direto: a revisão não mudou código.

Files: `src/editor/history.ts`, `src/editor/shortcuts.ts`, `src/App.tsx`,
`src/i18n/pt-BR.ts`, `src/i18n/en.ts` (+ os três arquivos de teste).
