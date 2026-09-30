# PHY-44: Dá para digitar `0.5` dígito a dígito num campo numérico
Stage: to-implement
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
