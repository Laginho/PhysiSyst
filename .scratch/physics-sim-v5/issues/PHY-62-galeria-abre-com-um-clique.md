# PHY-62: A galeria abre o preset com um clique, sem criar cena
Stage: to-implement
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

#### Stage 2 — evidência DOM e ajustes do harness (2026-10-03)

- Red de navegação (f46556c): 3 falhas por ausência de card clicável (missing preset card: wedge-flagship/atwood).
- Red de cópia (1a62d1c): 6 falhas, 4 verdes, 98 ignorados: id permaneceu preset:..., nome da duplicação foi Cena 2, e falha de quota não protegia o documento.
- Ajustes de harness em commits só de testes: localizar o range pelo tipo (o label inclui o valor), preservar o caractere Unicode de undo, disparar blur para abandonar o rascunho numérico rejeitado, ler Blob com timers reais e comparar a primeira cena com DEMO_SCENE. Os testes Chromium existentes passaram a abrir o card e duplicar antes de testar números; as asserções originais foram mantidas.
- Mutate-verify: cada mutação abaixo foi aplicada isoladamente em src/App.tsx, os 10 testes DOM PHY-62 foram executados e o arquivo foi restaurado em finally. Todos os mutantes falharam; trechos reais da saída vermelha por teste:

**autosave-preset** — substituir `if (!openPreset) saverRef.current?.schedule(currentId, doc)` por `saverRef.current?.schedule(currentId, doc)`.

- `abre cada card em t=0 sem salvar cenas; transporte não cria cópia`: `AssertionError: expected [ [ …(2) ], …(23) ] to deeply equal []`.

**reload-preset** — substituir `if (openPreset) return openPreset.buildScene()` por `if (openPreset) return blankScene()`.

- `reabre o preset após reload; desconhecido volta à cena salva`: `AssertionError: expected last "vi.fn()" call to have been called with [ { version: 1, …(6) } ]`.

**same-card-reset** — substituir `if (openPresetRef.current?.id === preset.id) return` por `// mutant: allow repeated open`.

- `clique no preset já aberto preserva playback e mundo`: `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times`.

**no-copy** — substituir `if (!copyOpenPreset()) return false` por `// mutant: edit without copy`.

- `primeira edição cria uma cópia; undo mantém o id e reabrir preserva o original`: `AssertionError: expected 'preset:atwood' to be 'cena-2' // Object.is equality`.
- `primeira edição de g durante play cria cópia sem reset e chega ao mundo`: `AssertionError: expected 'preset:wedge-flagship' to be 'cena-2' // Object.is equality`.
- `primeira edição de F durante play cria cópia sem reset e chega ao mundo`: `AssertionError: expected 'preset:wedge-flagship' to be 'cena-2' // Object.is equality`.
- `falha ao salvar cópia mantém preset intacto; repetir edição cria só uma cópia`: `AssertionError: expected '5' to be '9.81' // Object.is equality`.

**copy-rebuild** — substituir `const { entry, scene } = result` por `simRef.current?.replaceScene(docRef.current)     const { entry, scene } = result`.

- `primeira edição de g durante play cria cópia sem reset e chega ao mundo`: `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times`.
- `primeira edição de F durante play cria cópia sem reset e chega ao mundo`: `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times`.

**duplicate-generic** — substituir `if (openPresetRef.current) {` por `if (false) {`.

- `duplicar um preset cria a cena no idioma atual (PHY-62)`: `AssertionError: expected 'Cena 2' to be 'Atwood machine' // Object.is equality`.
- `exporta o doc do preset e duplicar cria cópias com nomes distintos`: `AssertionError: expected 'Cena 2' to be 'Máquina de Atwood' // Object.is equality`.

**skip-flush** — substituir `saverRef.current?.flush()     const scene = preset.buildScene()` por `saverRef.current?.cancel()     const scene = preset.buildScene()`.

- `flush da cena salva precede abertura; cena em branco continua criando uma cena`: `AssertionError: expected 9.81 to be 3 // Object.is equality`.

**ignore-copy-failure** — substituir `setStorageWarning(result.reason)       return false` por `setStorageWarning(result.reason)       return true`.

- `falha ao salvar cópia mantém preset intacto; repetir edição cria só uma cópia`: `AssertionError: expected '5' to be '9.81' // Object.is equality`.

**export-blank** — substituir `const txt = exportScene(doc)` por `const txt = exportScene(blankScene())`.

- `exporta o doc do preset e duplicar cria cópias com nomes distintos`: `AssertionError: expected { version: 1, …(4) } to deeply equal { version: 1, …(6) }`.

- Testes diretos também mutados: retirar o reconhecimento de preset: produziu expected null to be 'preset:atwood'; salvar sempre baseName produziu Expected Máquina de Atwood (2), Received Máquina de Atwood. Restaurados: 12 testes PHY-62 verdes, 167 ignorados (179 nos três arquivos).
- As decisões Proxy decided já presentes foram seguidas; esta etapa não acrescentou decisão de proxy nem alterou critérios ou escopo. Abrir só grava as chaves de seleção/ack previstas nos critérios 8 e 10, nunca índice ou payload de cena. A cópia reaproveita createPresetScene (payload antes do índice, rollback de órfão) e só troca a identidade após sucesso.
- Gate final: npm test && npm run lint && npm run typecheck && npm run build — 30 arquivos, 959 testes verdes; lint e typecheck sem erros; Vite build concluído. Aviso de bundle maior que 500 kB no simulador permanece.
- Diff revisado: apenas Primary files e este ticket; sem artefatos gerados ou alteração de critérios. Commits de código não alteram testes. Entrega da etapa 2; revisão da etapa 3 pendente.

#### Stage 3 review (2026-10-03)

Verdict: Reopen — critério 3: entrada numérica equivalente cria cópia antes de mudar o conteúdo do doc.

Base: `sweatshop/2026-10-02-2210` (`3ecf4f6`); HEAD revisado: `b16fba9`. Diff inteiro e chamadores revisados; Standards e Spec executados em agentes separados. Primeira revisão da PHY-62.

##### Standards

Nenhuma violação das normas documentadas. Os arquivos estão nos Primary files, além deste ticket. Commits de produção não alteram testes; os testes precedem suas implementações, e ajustes posteriores do harness estão em commits exclusivos. Há evidência de mutação para os dez testes DOM PHY-62. Terminologia e traduções seguem CONTEXT.md e as convenções existentes.

Observação opcional, sem reprovação: possível Duplicated Code em `src/App.tsx:1072–1079`. A sequência `setDoc(scene); setSelection(null); ... setHistory(clearHistory()); docRef.current = scene; dispatch({ type: 'reset' })` repete a limpeza de `switchToScene:1048–1058`. Um helper poderia prevenir divergência futura. É julgamento de manutenção, não falha de contrato; nenhuma refatoração é exigida nesta reabertura. `copyOpenPreset` deve permanecer fora do caminho de reset.

##### Spec

- **❌ Critério 3 — P2:** o gatilho aprovado é a primeira **mudança no doc**. Abrir Atwood e acrescentar `0` ao campo `g = 9.81`, produzindo `9.810`, preserva o valor e conteúdo, mas cria `cena-2` e sai do modo preset. `NumField` (`src/App.tsx:309–312`) encaminha o número finito; `updateG` (`src/editor/doc.ts:204–205`) devolve um objeto equivalente; `editDoc` (`src/App.tsx:748–753`) compara apenas identidade antes de `copyOpenPreset`. Isso também contraria a definição já registrada pelo proxy: edição é o que muda o conteúdo protegido.
- Reprodução DOM temporária usando App e harness existentes, restaurada em `finally`: renderizar, abrir Atwood, focar g, chamar o setter nativo de `HTMLInputElement.value` com `'9.810'` e disparar `input` com `bubbles: true`. A asserção `expect(loadScene(storage, 'cena-2')).toEqual(presetById('atwood')!.buildScene())` passou. Saída: `selected=cena-2`, `count=2`, `g=9.810`, `savedG=9.81`.
- Vermelho: `expected 'cena-2' to be 'preset:atwood'` e `expected [...] to have a length of 1 but got 2`; **1 teste falhou, 108 ignorados (109)**. A suíte atual não cobre esse caso. A reprodução não foi incluída no commit.
- Critérios 1, 2 e 4–13 atendidos nos caminhos revisados. Nenhuma mudança de produção alheia ao pedido. Escritas de seleção e ACK são previstas nos critérios 8/10 e não violam a proteção do índice/payload no critério 1.

As dez decisões `Proxy decided` foram conferidas: (1) edição = mudança de conteúdo, com a falha acima; (2) cópia preserva playback/histórico; (3) opção/dica e Excluir/Duplicar/Exportar; (4) reload/fallback; (5) undo fica na cópia; (6) galeria aberta e ACK; (7) nome localizado e sufixos; (8) demo inicial e cena em branco; (9) clique no preset atual sem efeito; (10) flush e abertura pausada em t=0. Decisões 2–10 atendidas. Nenhuma decisão nova foi atribuída ao proxy.

##### Validação independente

- Gate completo: `npm test && npm run lint && npm run typecheck && npm run build` — **30 arquivos, 959 testes passaram**; lint, typecheck e build passaram. A tentativa inicial no sandbox teve 12 falhas de conexão Chromium (947 passaram), junto de erro Windows `CreateProcessWithLogonW 1909`; fora do sandbox o gate completo passou. Permanece o aviso conhecido de bundle acima de 500 kB.
- As **11 mutações registradas pela etapa 2** foram repetidas isoladamente, restaurando cada arquivo em `finally`. Falhas por mutante: `autosave-preset` 1; `reload-preset` 1; `same-card-reset` 1; `no-copy` 4; `copy-rebuild` 2; `duplicate-generic` 2; `skip-flush` 1; `ignore-copy-failure` 1; `export-blank` 1; `preset-reference` 1; `copy-name` 1. Os testes e motivos vermelhos coincidiram com a evidência já registrada acima. Nenhum mutante sobreviveu.
- Restaurados os três arquivos, filtro `PHY-62`: **12 testes verdes, 167 ignorados (179)**. A reprodução adicional acima foi executada depois e removida; produção e testes permanecem idênticos a `b16fba9`. `git diff --check` passou.

##### Trabalho restante para a etapa 2

Somente o ❌ acima: impedir que uma atualização sem mudança de conteúdo materialize o preset. Acrescentar primeiro, em commit só de testes, a regressão DOM da entrada numérica equivalente, verificando que o preset permanece aberto e o índice/payload não mudam; uma edição real posterior ainda deve criar exatamente uma cópia. Inspecionar os demais chamadores de `editDoc` que podem devolver um objeto equivalente. Corrigir dentro dos Primary files, registrar mutate-verify e executar novamente o gate. Não reescrever critérios nem refatorar transições nesta correção.

A correção precisa de teste novo e, pela regra mecânica de ticket-flow, volta à etapa 2. Nenhum merge foi feito e não havia linha PHY-62 no ledger para remover.

Standards: 0 violações, 1 observação opcional. Spec: 1 achado P2, critério 3.
