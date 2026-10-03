# PHY-62: A galeria abre o preset com um clique, sem criar cena
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: human
Difficulty: hard

- Primary files:
  - src/App.tsx (galeria em ~1805, seletor de cenas e botões em ~1680, `editDoc`, `switchToScene`, cena inicial em ~627, autosave em ~843)
  - src/App.test.ts
  - src/presets/index.ts (`createPresetScene`)
  - src/presets/presets.test.ts
  - src/persistence/index.ts (`CURRENT_SCENE_KEY`, `loadCurrentSceneId`, `saveCurrentSceneId`)
  - src/persistence/persistence.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts

#### What to build

Hoje a galeria é uma lista de rádios mais "usar selecionada", que cria uma cena salva a cada preset olhado. Depois deste ticket, cada card da galeria é clicável: o clique abre o preset na hora, pausado em t = 0, sem criar cena nem escrever no armazenamento. O preset aberto é só leitura. A primeira mudança no doc (qualquer uma, inclusive g ou F ao vivo durante o play) salva uma cópia do preset como `cena-N`, com o nome do preset, passa a editar a cópia e só então aplica a edição, que entra no histórico de undo. Criar a cópia não reseta a simulação.

Enquanto um preset está aberto: o seletor de cenas mostra a opção desabilitada e selecionada "Preset: <nome> (só leitura)", uma dica perto do transporte diz que a primeira edição cria uma cópia, Excluir fica desabilitado, Duplicar cria a cópia e troca para ela, e Exportar baixa o doc do preset. Recarregar a página volta ao mesmo preset.

A decisão de design (Bruno): o `App` guarda qual preset está aberto; a cena aberta é montada do preset e não tem id salvo; a cópia é salva por uma função de persistência e o app faz o rebind do id, sem `switchToScene`. O detalhe de cada comportamento está em `../spec.md`, seção "Galeria".

#### Acceptance criteria

1. Cada preset da galeria é um elemento clicável (sem rádio, sem o botão "usar selecionada"). Clicar num card mostra a cena do preset (os corpos de `preset.buildScene()`), pausada em t = 0, e não muda nada no armazenamento — nem `INDEX_KEY` nem nenhuma chave `SCENE_KEY_PREFIX*` —, nem depois de play, passo único, reset e mudança de velocidade, que não contam como edição.
2. Com um preset aberto, o seletor de cenas tem uma opção desabilitada e selecionada com o texto `t('scenes.presetOption', { name })` ("Preset: <nome> (só leitura)" em pt-BR), e uma dica `t('preset.readOnlyHint')` aparece perto dos botões de transporte. Sem preset aberto, nem a opção nem a dica existem.
3. A primeira mudança no doc com um preset aberto cria exatamente uma entrada nova no índice, com id `cena-N` e nome `t('preset.<id>.name')`, cujo conteúdo salvo, depois do autosave, já tem a edição. O seletor passa a mostrar essa cena e a opção de preset some.
4. Se o nome do preset já existe no índice, a cópia se chama `<nome> (2)`; se esse também existe, `<nome> (3)`, e assim por diante.
5. Criar a cópia durante o play não reseta: `stepsTaken` não volta a 0 e a simulação continua tocando. Uma mudança de g durante o play num preset aberto cria a cópia e chega ao mundo como edição ao vivo.
6. Undo logo depois da primeira edição continua na cópia (mesmo id no seletor) e deixa o doc igual ao do preset. Nenhuma cena é apagada.
7. Reabrir pela galeria um preset que tinha gerado uma cópia mostra o conteúdo original do preset.
8. Com um preset aberto, `CURRENT_SCENE_KEY` vale `preset:<id>` e, ao montar o `App` de novo com esse armazenamento, o mesmo preset abre em modo só leitura. Com `preset:<id desconhecido>`, a cena inicial é escolhida como hoje.
9. Com um preset aberto, Excluir está desabilitado, Duplicar cria uma cópia (regra dos critérios 3 e 4) e troca para ela, e Exportar gera o JSON do doc do preset.
10. A galeria continua aberta depois de clicar num card e depois de a cópia ser criada. O primeiro clique num card grava `GALLERY_ACK_KEY`.
11. Clicar no card do preset que já está aberto não muda nada (sem reset, sem rebuild).
12. Clicar num card com uma cena salva aberta e uma edição ainda não salva grava essa edição antes de abrir o preset (flush do autosave). Clicar num card durante o play abre o preset pausado em t = 0.
13. Sem armazenamento algum, a primeira abertura continua como hoje: `cena-1` com a cena demo e a galeria aberta. O botão "Cena em branco" continua criando uma cena nova.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, com o simulador falso e o `requestAnimationFrame` controlado que o arquivo já usa: critérios 1, 2, 3, 5, 6, 7, 8, 9, 10, 11 e 12 vermelhos hoje (não há card clicável nem preset aberto). O 13 passa hoje e vai junto. Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.
- `src/presets/presets.test.ts` (ou `persistence.test.ts`, onde ficar a função): critério 4 chamando direto a função que salva a cópia; vermelho hoje porque `createPresetScene` não desduplica o nome.
- `src/persistence/persistence.test.ts`: a leitura de `preset:<id>` do critério 8 chamando direto a função de persistência; vermelho hoje porque `loadCurrentSceneId` só aceita ids do índice.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 2).
- 2026-10-02 Stage 1 (planner, grilling com proxy). Bruno decidiu: cards de texto clicáveis; abrir sem confirmar; cópia na primeira edição; preset aberto guardado no `App`, cópia salva por persistência com rebind de id; um ticket só.
- Proxy decided: edição = qualquer mudança no doc, inclusive g/F ao vivo; play, passo, reset e velocidade não — é o que muda o conteúdo que o preset protege.
- Proxy decided: criar a cópia durante o play não reseta nem limpa o undo — reset no meio de uma edição ao vivo apagaria o que o aluno estava olhando.
- Proxy decided: seletor com opção desabilitada "Preset: <nome> (só leitura)" + dica; Excluir desabilitado, Duplicar = cópia, Exportar = doc do preset — mostra o estado sem inventar um controle novo.
- Proxy decided: recarregar volta ao preset via `CURRENT_SCENE_KEY = preset:<id>`, id desconhecido cai no comportamento de hoje — recarregar não deve criar cena.
- Proxy decided: undo depois da primeira edição fica na cópia — apagar a cópia por undo perderia dados sem aviso.
- Proxy decided: galeria aberta ao trocar de preset e ao criar a cópia; primeiro clique chama `ackGallery` — alternar rápido é o pedido do Bruno.
- Proxy decided: cópia com o nome do preset no idioma atual, " (2)" em colisão, id `cena-N` — reaproveita o esquema de ids que já existe.
- Proxy decided: "Cena em branco" e a primeira abertura não mudam — fora do pedido.
- Proxy decided: clique no card do preset já aberto não faz nada — reset já tem botão.
- Proxy decided: clique num card faz flush e abre pausado em t = 0, como troca de cena — nenhuma edição se perde.

- Stage 2: chamadores inspecionados: editDoc centraliza commitDoc, undo/redo e arrastos; switchToScene atende seletor, criar, duplicar, excluir e importar; createPresetScene atende a galeria e testes; loadCurrentSceneId atende a inicialização do App. Bordas: preset desconhecido, índice vazio, nome repetido, falha de quota, edição pendente e edição ao vivo.
- Red inicial: testes diretos PHY-62 (persistência + presets): 2 falhas, 69 ignorados. loadCurrentSceneId retornou null em vez de preset:atwood; a segunda cópia manteve Máquina de Atwood em vez de Máquina de Atwood (2).