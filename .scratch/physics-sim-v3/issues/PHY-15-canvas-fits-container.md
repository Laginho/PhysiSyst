# PHY-15: Canvas mede o container
Stage: to-review
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

Os dois testes novos de `App.test.ts` posicionam o corpo por uma via que não
depende da transformação (campos x/y (m) do painel, ou o centro de tela lido
de volta do DOM via `canvas.style.width/height`), e só usam a transformação
esperada (derivada da largura pretendida) para o clique/drop que a asserção
checa — sem isso, um clique calculado com a transformação errada podia
simplesmente errar o corpo dos dois jeitos (antes e depois do fix) e o teste
passar por acidente. Duas armadilhas encontradas ao escrever: (1) a cena
carregada por padrão é a `DEMO_SCENE` (seed automático na inicialização do
`useState`, não `blankScene()`), então os testes clicam `nova cena` primeiro
para não esbarrar nos corpos dela; (2) o painel de propriedades só renderiza
o fieldset do corpo **selecionado** — ausência de fieldset não prova exclusão,
só falta de seleção, daí os testes verificarem seleção positiva (`toBe(true)`)
em vez de ausência (`toBe(false)`) para a parte de clique.

## Mutate-verify (App.test.ts, seam DOM/integração)

Cada mutação abaixo foi aplicada em `src/App.tsx`, rodada isoladamente (`npx
vitest run src/App.test.ts -t "<nome>"`), confirmado vermelho pelo motivo
certo, depois revertida. `fitCanvas.test.ts`/`transform.test.ts` chamam a
função de produção direto — sem registro aqui, por protocolo.

1. **"the same relative click selects the body..."** — `geometryFor`:
   `pixelsPerMeter: pixelsPerMeterForWidth(width)` virou `pixelsPerMeter: 60`
   (câmera fixa, não escala com a largura). Vermelho: reselecionar em
   (1200×800) não achou o corpo — `expected false to be true`.
2. **"dropping on the trash target removes the body..."** — `geometryFor`:
   `trash: trashRect(width, height)` virou `trash: trashRect(900, 600)` (zona
   da lixeira fixa). Vermelho: em (1200×800) o corpo continuou selecionado
   após o drop — `expected true to be false`.
3. **Ambos os testes acima** — o callback do `ResizeObserver`:
   `setSize(fitCanvas(entry.contentRect.width, entry.contentRect.height))`
   virou `setSize(fitCanvas(900, 600))` (App ignora o tamanho do container).
   Vermelho nos dois testes, mesmo padrão: em (1200×800) o canvas continuou
   900×600 por baixo, então clique e drop erraram.

## Verificação live em browser (critério 6)

`npm run dev` via preview do editor:

- Cena "cunha empurrada" tocando (`▶ reproduzir`), redimensionei a janela do
  preview de ~800px para 1400×900: o canvas escalou de 600×400 para 702×468
  (proporção 1.5 confirmada via `canvas.style.width/height` e
  `canvas.width/height`), sem esticar — grade continuou quadrada, `m_a`
  continuou círculo (não elipse), sem borrão perceptível, playback seguiu
  correndo durante o resize.
- Redimensionei para 700×700 (mais estreito que largura+painel cabem):
  canvas foi ao piso de 600px de largura e ficou parcialmente sobreposto ao
  painel lateral — aceitável pela letra do critério 1 (nunca abaixo de
  600px), mas achei um bug real nesse caminho: a caixa que envolve o canvas
  tinha `overflow: hidden`, e como ela havia encolhido abaixo de 600px, a
  metade do canvas ficava CORTADA (invisível), não só sobreposta. Troquei
  para `overflow: 'visible'` em `App.tsx` — agora a cena inteira continua
  visível (só sobrepõe o painel), nunca cortada. Sem teste jsdom para isso
  (jsdom não faz layout real); pego só pela verificação live.
- Restaurei para o tamanho normal do preview: cena inteira visível de novo,
  sem distorção, sem erro no console.

**Critério 7** — Limitação #3 do `FINAL_REPORT.md` ("Window resize during
playback — canvas backing store sized once at mount; resizing stretches
rendering until reload") está **resolvida**: o backing store agora é
realocado a cada mudança de tamanho do container (`ResizeObserver` + efeito
que depende de `size.width/size.height`), e o resize verificado ao vivo acima
não estica nem borra o desenho.

## Comments
