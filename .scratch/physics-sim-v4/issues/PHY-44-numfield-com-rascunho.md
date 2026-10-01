# PHY-44: Dá para digitar `0.5` dígito a dígito num campo numérico
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (`NumField`; `SpringPanel` só se a chamada mudar)
  - `src/App.test.ts`

#### What to build

O `NumField` é um `type="number"` controlado, que chama `onChange` a cada tecla. No inspetor da mola, `commitSpringEdit` recusa `k ≤ 0` e `x₀ ≤ 0`, e essa recusa sem clamp foi decisão do PHY-27. Para digitar `0.5`, a primeira tecla é `0`: o valor é recusado, o documento não muda, e o React devolve ao campo o valor antigo. Só colando `0.5` inteiro ele passa. Um comprimento natural abaixo de 1 m é o caso comum de uma mola de livro-texto.

O CLEAN-13 item 6 já listava isto sem verificação. O Sol confirmou no Chromium com `x₀ = 3`: mandar `0` no evento `input` faz o React restaurar `3`, enquanto mandar `0.5` num evento só é aceito.

O `NumField` passa a guardar um rascunho de texto. Cada tecla que resulta num valor aceito continua indo para o documento na hora, como hoje. Uma tecla que resulta num valor recusado, ou num texto incompleto, fica só no rascunho. Ao perder o foco com um rascunho inválido, o campo volta a mostrar o valor do documento. A correção é no `NumField`, que é compartilhado, então vale para todo campo que o usa. Os campos que hoje clampam, como os do painel do corpo, continuam clampando.

#### Acceptance criteria

1. No inspetor da mola, digitar `0`, `.` e `5`, uma tecla por evento, deixa `x₀ = 0.5` no documento. O mesmo vale para `k`
2. Nenhum valor intermediário recusado chega ao documento, e nenhum cria passo de undo
3. Ao perder o foco com um rascunho inválido (por exemplo, `0`), o campo mostra de novo o valor do documento
4. Os campos do painel do corpo mantêm o comportamento de clamp de hoje
5. Os testes de regressão são mutate-verified conforme o `AGENTS.md` (seam de DOM: mutação e saída vermelha registradas por teste)
6. Gate verde

#### Verification

    npx vitest run src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: os critérios 1 a 3, digitando tecla por tecla, com um `input` por tecla e não um valor inteiro de uma vez. Vermelho porque hoje o `0` é recusado e o campo volta ao valor antigo.

## Comments

- 2026-09-30 Aberto a partir do CLEAN-13 item 6, confirmado no Chromium pelo Sol (F6) no review de benchmark do PR 9. O Opus e o Sonnet chegaram ao mesmo achado pelo código.

- 2026-09-30 Attempt 1 stopped to ask: PHY-44 ficou `blocked` no commit `0013122`: os testes reproduzem o bug, mas o harness falha ao ler o documento. A alteração de produção foi revertida; working tree limpa. /  / A [skill ticket-flow](C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. É preciso corrigir o harness antes de retomar.

- 2026-09-30 Proxy decided: retomar de `refs/foreman/phy-44-attempt1` mantendo `3b24466`; novo commit só de teste corrige `storedSpring()` em `src/App.test.ts` (sem import dinâmico, sem `pagehide`: espera `AUTOSAVE_DELAY_MS + 50` e lê `localStorage` por `SCENE_KEY_PREFIX`/`CURRENT_SCENE_KEY`), vermelho igual ao original (`expected '1.5' to be '0'` / `expected '40' to be '0'`) antes da produção — causa: a base `'/PhysiSyst/'` do Vite quebra a URL do import e nada escuta `pagehide`, então o autosave não era descarregado. Contrato inalterado.
- 2026-09-30 Stage 2, seam aprovado: DOM de `App`, com Chromium para a edição nativa de `0.` (jsdom sanitiza esse intermediário). Reutilizado `src/test/browser.ts`; cada caractere usa uma edição nativa e um evento `input`. Os testes existentes que observavam a recusa imediata de k, c e mₛ passam a observar o valor após blur, conforme o critério 3.
- Red antes da produção: `npx vitest run src/App.test.ts` → **2 failed | 66 passed (68)**. Caso `x₀ (m)`: `expected '1.5' to be '0'`; caso `k (N/m)`: `expected '40' to be '0'`. Ambos falham na primeira tecla, antes de qualquer alteração em `NumField`.

- 2026-09-30 Retomada: o commit original de testes `3b24466` foi recuperado como `4e04128` sobre a sessão atual, preservando os tickets já concluídos desde a tentativa anterior. Harness corrigido conforme a decisão do proxy: aguarda 450 ms e lê o autosave com `SCENE_KEY_PREFIX` e `CURRENT_SCENE_KEY`, sem import dinâmico ou `pagehide`. `npx vitest run src/App.test.ts` antes da produção → **2 failed | 81 passed (83)**; `x₀ (m)`: `expected '1.5' to be '0'`; `k (N/m)`: `expected '40' to be '0'`.

#### Stage 2 — mutate-verify (2026-09-30)

`NumField` mantém localmente o texto recusado ou incompleto; `SpringPanel.edit` devolve a aceitação já determinada por `onEdit`. Entradas aceitas continuam aplicadas imediatamente, incluindo os clamps existentes. Blur descarta o rascunho; uma alteração externa do valor também o descarta. Nenhum teste foi alterado depois do commit de harness `8b85fac`.

Comando de cada mutação: `npx vitest run src/App.test.ts -t PHY-44`. Cada execução produziu **2 failed | 81 skipped (83)**; produção restaurada depois de cada uma.

| Teste de regressão | Mutação em `NumField` | Saída vermelha |
| --- | --- | --- |
| `x₀ (m) aceita 0.5 tecla por tecla, reverte no blur e só desfaz a edição aceita` | Substituir `value={draft?.text ?? value}` por `value={value}` | `expected '1.5' to be '0'` na primeira tecla (linha 1571) |
| Mesmo teste de `x₀ (m)` | Substituir `onBlur={() => setDraft(null)}` por callback vazio | `expected '0' to be '1.5'` após blur (linha 1575) |
| Mesmo teste de `x₀ (m)` | Substituir `onChange(v) !== false` por `false`, mantendo o rascunho visível sem editar o documento | `expected 1.5 to be 0.5` na leitura do autosave (linha 1592) |
| `k (N/m) aceita 0.5 tecla por tecla, reverte no blur e só desfaz a edição aceita` | Substituir `value={draft?.text ?? value}` por `value={value}` | `expected '40' to be '0'` na primeira tecla (linha 1571) |
| Mesmo teste de `k (N/m)` | Substituir `onBlur={() => setDraft(null)}` por callback vazio | `expected '0' to be '40'` após blur (linha 1575) |
| Mesmo teste de `k (N/m)` | Substituir `onChange(v) !== false` por `false`, mantendo o rascunho visível sem editar o documento | `expected 40 to be 0.5` na leitura do autosave (linha 1592) |

Verde com produção corrigida: `npx vitest run src/App.test.ts` → **83 passed (83)**. Os dois testes verificam `0`, o intermediário incompleto `-`, a sequência nativa `0` → `.` → `5` (cinco eventos `input` no total), autosave inalterado e undo desabilitado durante os intermediários; depois de `0.5`, um único undo restaura o documento original e esgota o histórico. Os testes existentes do painel do corpo continuam verificando clamps de dimensões, base e alpha.

Gate completo: `npm test && npm run lint && npm run typecheck && npm run build` → **30 arquivos, 721 testes passando**; lint, typecheck e build concluídos com exit 0. Vite manteve o aviso de chunks acima de 500 kB. Stage 2 concluído, pronto para revisão na branch `phy/PHY-44-numfield-com-rascunho`, baseada em `sweatshop/2026-09-24-1853`.

#### Resolution (2026-09-30)

Verdict: Approve

Revisão fixada em `git diff c712721f8723a0473fe7ba8365ab6849d03ec9a2...3e3686a`, base `sweatshop/2026-09-24-1853`. Standards e Spec examinados por sub-agentes independentes; gate, reprodução do vermelho e repetição das mutações pelo agente principal. Commits: `4e04128` e `8b85fac` (testes e metadados), depois `3e3686a` (produção e metadados, sem alterar testes).

##### Standards

Nenhuma violação documentada ou smell relevante no diff.

- `src/App.tsx`: alteração restrita a `NumField` e à propagação de aceitação em `SpringPanel`, dentro dos Primary files. Rascunho e validação ficam no componente compartilhado; os clamps existentes permanecem nos seus callbacks.
- `src/App.test.ts`: reutiliza `src/test/browser.ts` e observa DOM, persistência e undo, conforme Testing Decisions. Os commits de teste precedem a produção; a correção do harness em outro commit de testes foi autorizada pelo proxy.
- Ticket: mantém `Stage:` separado de `Status:` e registra, para cada teste novo, mutações e saídas vermelhas, conforme `AGENTS.md`.

A decisão **Proxy decided** de retomar os testes e ler o autosave pelas chaves `SCENE_KEY_PREFIX`/`CURRENT_SCENE_KEY` após o debounce foi respeitada em `8b85fac`: sem import dinâmico ou `pagehide`, espera de `AUTOSAVE_DELAY_MS + 50`. Nenhuma nova decisão de proxy nesta revisão.

##### Spec

Nenhum critério ausente ou parcial, aumento material de escopo ou comportamento incorreto identificado.

Os critérios 1–3 estão implementados pelo rascunho local em `NumField`, pelo retorno ao valor do documento no blur e pela aplicação imediata dos valores aceitos. `SpringPanel.edit` propaga a aceitação; `commitSpringEdit` continua recusando valores inválidos antes de `commitDoc` e do histórico. Os dois testes usam edição nativa no Chromium, conferem autosave e demonstram um único undo após `0.5`.

O critério 4 mantém os clamps existentes de dimensões, base e alpha, com suas verificações preservadas. O critério 5 tem mutação e saída vermelha registradas por teste e reproduzidas abaixo. O critério 6 foi confirmado pelo gate independente antes da revisão e após restaurar a produção.

Prova independente com os testes finais inalterados:

| Produção / comando | Resultado |
| --- | --- |
| Produção anterior, do commit de testes `8b85fac`; `npx vitest run src/App.test.ts` | **2 failed, 81 passed (83)**. `x₀`: `expected '1.5' to be '0'`; `k`: `expected '40' to be '0'`, ambos na primeira tecla, linha 1571. |
| Produção corrigida e restaurada; mesmo comando | **83 passed (83)**. |

Repetição das três mutações registradas no stage 2, isoladamente, via `npx vitest run src/App.test.ts -t PHY-44`. Cada execução produziu **2 failed, 81 skipped (83)**:

| Mutação em `NumField` | Vermelho do teste de `x₀ (m)` | Vermelho do teste de `k (N/m)` |
| --- | --- | --- |
| `value={draft?.text ?? value}` → `value={value}` | `expected '1.5' to be '0'`, linha 1571 | `expected '40' to be '0'`, linha 1571 |
| `onBlur={() => setDraft(null)}` → callback vazio | `expected '0' to be '1.5'`, linha 1575 | `expected '0' to be '40'`, linha 1575 |
| `onChange(v) !== false` → `false`, sem editar o documento | `expected 1.5 to be 0.5`, linha 1592 | `expected 40 to be 0.5`, linha 1592 |

Produção restaurada byte a byte após cada execução; diff vazio e hashes Git de produção e testes iguais aos blobs de `HEAD`. Rebase sobre a sessão já atualizado, sem conflitos. Gate final `npm test && npm run lint && npm run typecheck && npm run build`: **30 test files passed (30), 721 tests passed (721)**; lint, typecheck e build exit 0. Permanece o aviso existente do chunk tardio do simulador acima de 500 kB.

Sem correção de produção nesta revisão. Arquivos entregues: `src/App.tsx` e `src/App.test.ts`; fechamento neste ticket e em `.scratch/physics-sim-v4/ledger.md`. Merge `--no-ff` na sessão: `274bdf1`. `Stage: done` e linha do ledger no mesmo commit de fechamento. Totais: Standards **0 achados**; Spec **0 achados**.
