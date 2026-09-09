# 04: Canvas mede o container

**What to build:** O canvas deixa de ser 900×600 fixo. Ele ocupa o maior tamanho 3:2 que cabe no container (letterbox nos dois eixos), com largura mínima de 600 px, e se re-mede quando a janela é redimensionada ou maximizada, durante edição ou playback, sem esticar o desenho. A mesma região do mundo fica visível em qualquer tamanho: muda a escala, não o enquadramento. Arraste, hit-test, snap, lixeira e overlays continuam precisos após o resize.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Função pura `fitCanvas(containerWidth, containerHeight) → { width, height }`: proporção 3:2 exata, maior tamanho que cabe nos dois eixos, largura nunca abaixo de 600 (testes em `render/`: container largo, container alto, container minúsculo, container exatamente 3:2)
- [ ] O App observa o container com `ResizeObserver` e recalcula tamanho lógico, backing store (DPR) e a transformação mundo↔tela a cada mudança
- [ ] A transformação e o retângulo da lixeira derivam do tamanho atual; não existem mais constantes de módulo para largura/altura do canvas
- [ ] A câmera escala pixels-por-metro com a largura, mantendo a mesma região do mundo visível (teste: o mesmo ponto do mundo mapeia para a mesma fração da tela em dois tamanhos)
- [ ] Hit-test, arraste, snap e lixeira usam a transformação atual (espelho em `App.test.ts` com dois tamanhos: o mesmo clique relativo seleciona o mesmo corpo)
- [ ] Verificação live em browser: redimensionar a janela durante playback não estica nem borra o desenho; maximizar e restaurar mantém a cena inteira visível
- [ ] Limitação #3 do FINAL_REPORT v1 (resize estica) é marcada como resolvida no comentário do ticket
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
