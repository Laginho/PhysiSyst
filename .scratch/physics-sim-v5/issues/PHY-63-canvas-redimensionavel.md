# PHY-63: Canvas da cena redimensionável
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: human
Difficulty: normal

- Primary files:
  - src/render/fitCanvas.ts (`fitCanvas`, `CANVAS_MIN_WIDTH`)
  - src/render/fitCanvas.test.ts
  - src/persistence/index.ts (só a chave e as funções do tamanho do canvas)
  - src/persistence/persistence.test.ts
  - src/App.tsx (o `ResizeObserver` do `canvasBoxRef` em ~773, a caixa do canvas em ~1492)
  - src/App.browser.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (só o título da alça)

#### What to build

Hoje o canvas ocupa o maior 3:2 que cabe no contêiner, com piso de 600 px. Depois deste ticket, uma alça no canto inferior direito do canvas deixa o aluno arrastar para diminuir (ou voltar a aumentar) o canvas. A largura manda e a altura segue 3:2. O zoom acompanha: `pixelsPerMeter = width / VIEW_WIDTH_METERS` como hoje, então a cena inteira cabe em qualquer tamanho. O tamanho escolhido fica salvo no navegador e vale para o app inteiro.

Regra do tamanho: largura = máx(402, mín(escolha do usuário, ajuste automático)), arredondada para múltiplo de 3 como hoje. O ajuste automático é o `fitCanvas` de hoje, com o piso de 600 px e a regra de empilhar, que não mudam. Sem escolha salva, o canvas é o automático. Não há botão "auto": arrastar até o máximo é o automático.

#### Acceptance criteria

1. `fitCanvas(w, h, null)` devolve o mesmo que o `fitCanvas(w, h)` de hoje para qualquer contêiner.
2. `fitCanvas(w, h, user)` devolve largura `máx(402, mín(user, auto))` arredondada a múltiplo de 3, onde `auto` é a largura do critério 1, e altura = largura / 1,5. Com `user` abaixo de 402, a largura é 402 e a altura 268.
3. A chave `physics-sim:canvasSize` guarda a largura escolhida. Ler um valor ausente, não numérico ou não finito dá "automático" (`null`); um número é devolvido como está e a regra do critério 2 o limita.
4. No navegador, arrastar a alça do canto inferior direito para a esquerda diminui a caixa do canvas; a caixa medida (`getBoundingClientRect`) mantém 3:2 e o `<canvas>` tem o mesmo tamanho lógico.
5. Arrastar a alça bem além do mínimo para em 402 × 268; arrastar bem além do máximo para no tamanho automático.
6. O tamanho arrastado sobrevive a recarregar a página.
7. Arrastar a alça não move nem seleciona corpos e não cria entrada no histórico de undo.
8. A alça tem o cursor `nwse-resize` e um título i18n.
9. Com a escolha salva, redimensionar a janela até o ajuste automático ficar menor que a escolha encolhe o canvas para o automático; voltar a janela devolve a escolha.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/fitCanvas.test.ts`: critérios 1 e 2 chamando `fitCanvas` direto; o 2 é vermelho hoje (o terceiro argumento é ignorado), o 1 passa e vai junto.
- `src/persistence/persistence.test.ts`: critério 3 chamando direto as funções de leitura e escrita; vermelho hoje (não existem).
- `src/App.browser.test.ts` (Vite + Chromium headless, geometria real): critérios 4, 5, 6 e 9; vermelhos hoje (não há alça). Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.
- `src/App.test.ts` ou `src/App.browser.test.ts`: critérios 7 e 8.

## Comments

- 2026-10-03 Stage 2: callers examinados: `App` inicializa e recalcula `fitCanvas` no ResizeObserver; o piso automático também controla o empilhamento. Cobertos: escolha abaixo do mínimo, acima do automático, fracionária, contêiner menor que o piso e armazenamento inválido. Primeiro red: 3 failed / 52 passed (55); largura 1200 em vez de 750 e funções de persistência ausentes.

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 3; confirmado que "preview" é o canvas da cena).
- 2026-10-02 Stage 1 (planner, grilling com proxy). Bruno decidiu: alça de arrastar; redimensionar muda o zoom; `fitCanvas` recebe a largura do usuário e aplica mínimo e máximo, alça e persistência no `App`; um ticket só.
- Proxy decided: tamanho persistido globalmente em `physics-sim:canvasSize`, inválido → automático — é preferência de tela, não da cena.
- Proxy decided: mínimo 402 × 268, largura = máx(MIN, mín(usuário, auto)); o piso de 600 px e o empilhamento só valem para o automático — o piso existe pelo layout lado a lado, não pela legibilidade.
- Proxy decided: alinhamento como hoje, espaço que sobra vazio — sem pedido de mudar.
- Proxy decided: alça no canto inferior direito, `nwse-resize`, largura manda em 3:2, sem botão "auto" — convenção da plataforma; arrastar ao máximo já é o automático.
