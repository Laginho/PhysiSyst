# PHY-15: Canvas mede o container
Stage: implementing
Status: ready-for-agent
Blocked by: none

- Primary files:
  - New: `src/render/fitCanvas.ts` + `src/render/fitCanvas.test.ts`
  - `src/render/transform.ts` (escala pixels-por-metro derivada da largura)
  - `src/render/transform.test.ts`
  - `src/App.tsx` (`CANVAS_W`/`CANVAS_H`, `TRANSFORM`, `TRASH_RECT`, backing store, `ResizeObserver`)
  - `src/App.test.ts`

#### What to build

O canvas deixa de ser 900×600 fixo. Ele ocupa o maior tamanho 3:2 que cabe no container (letterbox nos dois eixos), com largura mínima de 600 px, e se re-mede quando a janela é redimensionada ou maximizada, durante edição ou playback, sem esticar o desenho. A mesma região do mundo fica visível em qualquer tamanho: muda a escala, não o enquadramento. Arraste, hit-test, snap, lixeira e overlays continuam precisos após o resize.

#### Acceptance criteria

1. Função pura `fitCanvas(containerWidth, containerHeight) → { width, height }`: proporção 3:2 exata, maior tamanho que cabe nos dois eixos, largura nunca abaixo de 600
2. O App observa o container com `ResizeObserver` e recalcula tamanho lógico, backing store (DPR) e a transformação mundo↔tela a cada mudança
3. A transformação e o retângulo da lixeira derivam do tamanho atual; não existem mais constantes de módulo para largura/altura do canvas
4. A câmera escala pixels-por-metro com a largura, mantendo a mesma região do mundo visível: o mesmo ponto do mundo mapeia para a mesma fração da tela em dois tamanhos
5. Hit-test, arraste, snap e lixeira usam a transformação atual: o mesmo clique relativo seleciona o mesmo corpo em dois tamanhos
6. Verificação live em browser: redimensionar a janela durante playback não estica nem borra o desenho; maximizar e restaurar mantém a cena inteira visível
7. Limitação #3 do FINAL_REPORT v1 (resize estica) marcada como resolvida no comentário deste ticket
8. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
9. Gate verde

#### Verification

    npx vitest run src/render/fitCanvas.test.ts src/render/transform.test.ts src/App.test.ts src/editor/trash.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/fitCanvas.test.ts`, na função pura: container largo, container alto, container minúsculo (piso de 600), container exatamente 3:2 (critério 1). Vermelho porque a função não existe.
- `src/render/transform.test.ts`, na transformação: o mesmo ponto do mundo na mesma fração da tela em duas larguras (4). Vermelho porque a escala hoje é constante.
- `src/App.test.ts`, no espelho, com dois tamanhos: o mesmo clique relativo seleciona o mesmo corpo, e a lixeira acerta (5). Vermelho porque `TRANSFORM` e `TRASH_RECT` são constantes de módulo.

## Comments
