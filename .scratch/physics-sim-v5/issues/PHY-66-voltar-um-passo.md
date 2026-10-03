# PHY-66: Voltar um passo
Stage: done
Status: ready-for-agent
Blocked by: PHY-64
Review: agent
Difficulty: normal

- Primary files:
  - src/editor/shortcuts.ts (`ShortcutAction`, `actionForKey`)
  - src/editor/shortcuts.test.ts
  - src/App.tsx (barra de transporte em ~1573, listener de teclado em ~1133, tabela de atalhos em ~1619)
  - src/App.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts

#### What to build

O espelho do passo único: um botão "voltar um passo" ao lado do "Passo" e a seta ← mostram o registro anterior da gravação do PHY-64. Pausa se estiver tocando. Não roda nada no mundo: é um `seek` para `(cursor ?? length − 1) − 1`, limitado a 0. Em t = 0 (cursor 0, ou gravação com um registro só) o botão fica desabilitado e a ← não faz nada.

#### Acceptance criteria

1. `actionForKey` devolve `'stepBack'` para `ArrowLeft` fora de campo de texto e sem Ctrl/Cmd, como `ArrowRight` devolve `'stepOnce'`.
2. A barra de transporte tem um botão de voltar um passo, com título i18n, ao lado do botão "Passo".
3. Ao vivo, depois de N > 0 passos, clicar no botão (ou apertar ←) mostra o registro N − 1: poses, rótulo de tempo, slider e painel de leitura, como um `seek` do PHY-64.
4. Com o cursor no registro i > 0, o botão e a ← levam ao registro i − 1.
5. Durante o play, o botão e a ← pausam e voltam um registro.
6. Com o cursor em 0, ou com a gravação com um registro só, o botão está desabilitado e a ← não muda nada.
7. A tabela de atalhos lista ← com o texto `t('shortcuts.stepBack')` ("voltar um passo").

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/shortcuts.test.ts`: critério 1 chamando `actionForKey` direto; vermelho hoje (devolve `null`).
- `src/App.test.ts`, com o simulador falso e o `requestAnimationFrame` controlado: critérios 2 a 7; vermelhos hoje. Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.

## Comments

- 2026-10-02 Aberto no stage 1 dos tickets do feedback da v4. O proxy propôs separar "voltar um passo" do PHY-64 e o Bruno aceitou no fatiamento (PHY-64, PHY-65, PHY-66).
- Proxy decided: atalhos fora do PHY-64, → continua passo único, ← e o botão de voltar viram este ticket — mantém o PHY-64 no tamanho de um ticket.

- 2026-10-03 Stage 2: inspected keyboard mapping/listener, transport buttons, seek dispatch and recorded-player harness. New action uses existing seek; no physics stepping or simulator initialization. Boundary: initial single record and cursor zero must remain a no-op, even during play. Dependency PHY-64 is done on the session base.
- Red: `npx vitest run src/editor/shortcuts.test.ts src/App.test.ts -t 'ArrowLeft|PHY-66'`: 4 failed, 143 skipped. ArrowLeft returned null; both DOM transport cases found no back button; shortcut table had no left-arrow row.

- 2026-10-03 Implementation: back button and ArrowLeft seek the preceding recorded frame, pause through existing seek, and leave cursor zero unchanged. Added Portuguese/English labels, title and shortcut-table entry. No simulator step or rebuild.
- Mutation evidence, `PHY-66 button seeks backward from live and recorded play, stopping at zero`: changed production seek target from `index - 1` to `index`; failed at App.test.ts:2771, `expected '4' to be '3'`.
- Mutation evidence, `PHY-66 keyboard seeks backward from live and recorded play, stopping at zero`: same production mutation; failed at App.test.ts:2771, `expected '4' to be '3'`.
- Mutation evidence, `PHY-66 lists the left-arrow shortcut with localized text`: changed production table translation to `shortcuts.stepOnce`; failed at App.test.ts:2803, `expected 'avançar um passo' to be 'voltar um passo'`. Combined DOM mutation run: 3 failed / 126 skipped. All mutations restored.
- Shortcut mutation: replaced production `return 'stepBack'` with `return null`; test failed with `expected null to be 'stepBack'`. Restored afterward.
- Green: focused new tests 4 passed / 143 skipped. Full gate: 31 files, 1007 tests passed; lint, typecheck and build passed. Initial sandbox run had 15 Chromium connection failures (992 passed); rerun outside sandbox passed all 1007. Build retains large-chunk warning. Final diff reviewed: only Primary files and this ticket; code commit does not modify tests.

- 2026-10-03 Stage 3: corrected comment chronology to retain the original planning entries before the appended Stage 2 evidence, as required by docs/agents/issue-tracker.md. No production or test changes.

#### Resolution (2026-10-03)
Verdict: Approve

- Standards: one documentation finding corrected in `440a227`: implementation comments now follow the original planning history, as required by `docs/agents/issue-tracker.md`. No remaining documented-standard violations or relevant code smells.
- Spec: zero findings. Criteria 1–7 met: ArrowLeft respects text fields and Ctrl/Cmd; the adjacent localized button and keyboard shortcut seek exactly one preceding record, update poses/time/slider/readout, pause playback, and do nothing at zero or with one record. No simulator stepping or rebuilding.
- Proxy decision reviewed: "atalhos fora do PHY-64, → continua passo único, ← e o botão de voltar viram este ticket". Implementation preserves that scope and the right-arrow behavior.
- Files: `src/App.tsx`, `src/App.test.ts`, `src/editor/shortcuts.ts`, `src/editor/shortcuts.test.ts`, `src/i18n/pt-BR.ts`, `src/i18n/en.ts`; stage 3 changed only this ticket and the ledger. Test-only commit `06f9f78` precedes implementation `c14cbfc`, whose diff contains no test changes.
- Red proof rerun in stage 3, `node node_modules/vitest/vitest.mjs run src/App.test.ts -t PHY-66`: replacing the seek target `index - 1` with `index` failed both button and keyboard cases at `App.test.ts:2771`, `expected '4' to be '3'`; replacing the table key with `shortcuts.stepOnce` failed the shortcut-table case at `App.test.ts:2803`, `expected 'avançar um passo' to be 'voltar um passo'`. Result: 3 failed, 126 skipped.
- Shortcut red proof rerun: returning `null` for ArrowLeft failed at `shortcuts.test.ts:54`, `expected null to be 'stepBack'`. Result: 1 failed, 17 skipped. All mutated production files were restored byte for byte.
- Green proof after restoration, `node node_modules/vitest/vitest.mjs run src/editor/shortcuts.test.ts src/App.test.ts -t 'ArrowLeft|PHY-66'`: 2 files passed, 4 tests passed, 143 skipped.
- Independent full gate: `npm test && npm run lint && npm run typecheck && npm run build` passed, 31 test files and 1007 tests. Existing Vite chunk-size warning remains. Commands ran outside the unavailable Windows sandbox (process creation error 1909).
- Rebase onto `sweatshop/2026-10-02-2210` was already up to date; the validated production and test trees did not change. Merged locally without squash as `bef6215`; final ticket and ledger closure recorded together on the session branch.
