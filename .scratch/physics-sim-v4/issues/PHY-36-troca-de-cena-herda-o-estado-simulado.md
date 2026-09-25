# PHY-36: Trocar de cena herda o estado simulado da cena anterior
Stage: to-implement
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
