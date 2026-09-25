# PHY-36: Trocar de cena herda o estado simulado da cena anterior
Stage: to-review
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
