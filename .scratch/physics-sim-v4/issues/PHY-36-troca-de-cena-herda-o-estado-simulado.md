# PHY-36: Trocar de cena herda o estado simulado da cena anterior
Stage: done
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (`switchToScene`: a cena nova começa num playback zerado)
  - `src/App.test.ts`

#### What to build

`switchToScene` troca o documento, mas não reinicia o playback. O efeito do `doc` trata a troca como edição estrutural da cena antiga, e o `carryOver` guarda o estado simulado de todo corpo que tem o mesmo id e a mesma pose nas duas cenas. O contador de passos também segue de onde estava.

Reproduzido no passe manual do PHY-33 (Chromium, 1280 px): abrir "Pêndulo em volta completa", avançar 20 passos, abrir o mesmo preset de novo pela galeria. A cena nova mostra `passos: 20`, e a `bola` aparece em (6,82; 5,08) m a 5,06 m/s, e não em (6; 3,5) m parada, onde o documento a põe. Um clique na pose do documento não acha corpo nenhum. Os presets repetem ids (`bola`, `bloco`, `chao`), e "duplicar cena" gera um documento idêntico, então qualquer troca dessas herda o movimento. Quando a pose muda (queda livre → pêndulo simples, os dois com `bola`), o `carryOver` descarta o estado e o problema fica só no contador.

Ao trocar de cena (lista, galeria, nova, duplicar, importar, excluir), o playback volta ao estado inicial do documento novo, como o "⟲ reiniciar".

#### Acceptance criteria

1. Depois de simular a cena A e trocar para uma cena B com corpos de mesmo id e mesma pose, `passos` é 0 e cada corpo de B lê a pose e a velocidade do documento de B
2. Vale para os seis caminhos de troca: lista de cenas, galeria, nova cena, duplicar, importar, excluir
3. Teste de regressão mutate-verified conforme o `AGENTS.md`
4. Gate verde

#### Verification

    npx vitest run src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: simula uma cena, duplica e confere que a cópia começa em `passos: 0` e na pose do documento. Vermelho porque o `carryOver` mantém o estado da original.

## Comments

- 2026-09-25 Aberto pelo passe manual do PHY-33, item 4 (a execução de controle do pêndulo rápido não achava a corda para selecionar). Vem de antes da v4: carry-over e troca de cena são da v1. A v4 só deixa o problema mais fácil de encontrar, porque tem mais presets com ids repetidos.
- 2026-09-25 Stage 2. `switchToScene` (moved below `dispatch`, which it now needs) points `docRef` at the new scene and dispatches `reset`: stepsTaken 0, paused, world rebuilt from the new doc, `statesRef` null, `builtDocRef` = new doc, so the doc effect sees nothing to route and `carryOver` never runs across a switch. All six paths call `switchToScene`, so the one change covers criterion 2. The test runs two of them (duplicar, lista de cenas).
  Mutate-verify, `npx vitest run src/App.test.ts -t PHY-36`, both cases red each time:
  - Removed `dispatch({ type: 'reset' })` from `switchToScene`: `expected 'leiturapassos: 1velocidade: 1.00×selecione um corpo' to contain 'passos: 0'` (the red commit fails the same way).
  - Removed `statesRef.current = null` from the reset in `dispatch` (counter still zeroes): `expected 'leiturapassos: 0velocidade: 1.00×selecione um corpo' to contain 'posição: (6.00, 3.50) m'`. The click on the document pose finds no body, so the pose/velocity assertions stand on their own.
  Gate: 30 files, 709 tests passed; lint, typecheck clean; build OK (the >500 kB chunk warning is from before this change).

#### Resolution (2026-09-25)

Verdict: Approve

Findings:

- Critério 1 ✅ — `switchToScene` aponta `docRef` para a cena nova e despacha `reset` antes de o efeito do `doc` correr: `stepsTaken` 0, pausado, `replaceScene(novo doc)` sem estado anterior, `statesRef` null, `builtDocRef` = novo doc. O efeito vê `builtDocRef === doc` e não roteia nada, logo o `carryOver` nunca corre numa troca. O teste clica na pose do documento e lê (6.00, 3.50) m a 0.00 m/s.
- Critério 2 ✅ — os oito call sites de `switchToScene` cobrem os seis caminhos (lista, nova ×2, duplicar, excluir ×2, galeria, importar); nenhum troca de cena por outra via. O teste exercita duplicar e lista.
- Critério 3 ✅ — as duas mutações do ticket reproduzidas nesta revisão com o mesmo vermelho: sem `dispatch({ type: 'reset' })` → 2 failed (`expected 'leiturapassos: 1…' to contain 'passos: 0'`); sem `statesRef.current = null` → 2 failed (`expected 'leiturapassos: 0…' to contain 'posição: (6.00, 3.50) m'`). A segunda mostra que as asserções de pose/velocidade não dependem do contador.
- Critério 4 ✅ — gate verde (abaixo).
- Test-first ✅ — `1a08c61` toca só `src/App.test.ts` + ticket; `b6be6a7` toca só `src/App.tsx` + ticket. Tudo dentro dos Primary files. A mudança de posição de `switchToScene` para baixo de `dispatch` é a única forma de o fechar sobre `dispatch` sem hoisting; o diff é movimento + 5 linhas.
- Regressão: nenhuma. Sim ainda a arrancar: o `reset` é no-op no mundo e o boot repõe `builtDocRef`/`pendingRebuildRef` como antes. Sim não iniciado: idem. O `repaint()` síncrono do `dispatch` pinta uma frame com a seleção antiga contra o doc novo; `paint` compara por id, então no pior caso uma frame de realce num corpo homónimo, apagada pelo efeito de seleção logo a seguir.
- Nota (sem critério, não bloqueia): se `replaceScene` lançar durante a troca, o `reset` mantém `statesRef` e o efeito do `doc` faz `carryOver` — o mesmo comportamento do botão ⟲ numa falha, que o ticket toma como modelo.
- Proxy decided: nenhum.
- Standards: sem violações.

Files: `src/App.tsx` (`switchToScene` movido abaixo de `dispatch`; `docRef.current = scene` + `dispatch({ type: 'reset' })`), `src/App.test.ts`.

Red-green: mutação 1 acima é o estado sem o fix: `npx vitest run src/App.test.ts -t PHY-36` → 2 failed. Com o fix: 2 passed.

Gate: `npm test` 30 files, 709 passed; `npm run lint` limpo; `npm run typecheck` limpo; `npm run build` ok (aviso de chunk > 500 kB pré-existente).

Merged into `sweatshop/2026-09-24-1853` at `9547435`.
