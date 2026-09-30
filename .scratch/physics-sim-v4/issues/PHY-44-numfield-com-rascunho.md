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
