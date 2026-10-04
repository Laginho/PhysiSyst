# PHY-78: Modelo de Foco e chips
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: hard

- Primary files:
  - src/scene/types.ts (`Scene` :130-151 ganha `focus?`; novos `FOCUS_GROUPS`, `FocusGroup`, `Focus`)
  - src/scene/index.ts (reexportar os tipos e `FOCUS_GROUPS`)
  - src/scene/codec.ts (chaves da raiz :272; parse de `focus` anexado depois de `constraints` :349-358)
  - src/scene/codec.test.ts
  - src/persistence/index.ts (`blankScene` :77-79 escreve o padrão explícito)
  - src/persistence/persistence.test.ts
  - src/playback/routing.test.ts (pina `routeDocChange` com diferença só em `focus`; `routing.ts` não muda)
  - src/App.tsx (`paint` :186-292, camadas :245-252 e ramo de seleção :257-268; `showGlobal` :681 padrão; `editDoc` :811-829 não é o caminho dos chips; painel direito :1958-1974; leitura do corpo :2145-2214; bloco do sistema :2215-2231)
  - src/App.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`focus.*`)
  - CONTEXT.md (entrada **Foco**, já escrita pelo stage 1; corrigir só se o stage 2 mudar a forma)

#### What to build

**Modelo.** `Scene.focus?: Focus`, com

    export const FOCUS_GROUPS = ['forces', 'kinematics', 'energy', 'momentum'] as const
    export type FocusGroup = typeof FOCUS_GROUPS[number]
    export interface Focus {
      /** Grupos mostrados; Focus ausente = os quatro. */
      show: FocusGroup[]
      /** Curvas escondidas por tipo de gráfico, pelo nome da série (PHY-81). */
      hidden?: Record<string, string[]>
    }

Ausente significa os quatro grupos ligados: cenas antigas, importadas e `DEMO_SCENE` não perdem nada. `blankScene()` escreve o padrão explícito `focus: { show: ['forces', 'energy', 'momentum'] }` (cinemática desligada), e `createNewScene` o persiste. `SCENE_VERSION` fica 1 (precedente aditivo-opcional: `particleMode`, `vx/vy`, `pulleys`). O codec aceita `focus` na raiz: objeto com `show` (array de strings de `FOCUS_GROUPS`, sem repetição, canonizado na ordem de `FOCUS_GROUPS`) e `hidden` opcional (objeto cujos valores são arrays de strings não vazias); chaves desconhecidas em `focus`, grupo desconhecido ou repetido falham com erro apontando `focus`. Na saída canônica `focus` vem depois de `constraints` e só quando definido, para cenas v6 continuarem byte a byte.

**Chips.** No topo do painel direito, antes de "encaixar em contato", uma fileira: `t('focus.show')` ("mostrar:") e quatro `<button aria-pressed>` com `t('focus.forces' | 'focus.kinematics' | 'focus.energy' | 'focus.momentum')` ("forças", "cinemática", "energia", "momento"). O estado vem de `doc.focus` (ausente = todos pressionados).

**Efeito dos grupos.** O Foco é lido sempre do documento corrente (`docRef.current.focus`), nunca da `scene` do registro exibido, para valer com o slider para trás.

- forças: no canvas, as camadas P, F aplicada (com o anel de arrasto da âncora), N, T e F_el; no painel, a leitura de vínculo (F_el, Δx, T, frouxa).
- cinemática: no canvas, a seta de v₀ (e as de v e a do PHY-80); no painel, posição, módulo da velocidade, módulo da aceleração e as componentes dentro de "ver mais".
- energia: só painel — E_c e E_pg do corpo (em "ver mais") e E_c, E_pg, E_el, E_mec do sistema.
- momento: só painel — |p| do corpo e |p|, p_x, p_y do sistema.

Ficam sempre: "passos", "velocidade" (da reprodução), a legenda da leitura, "sem leitura"/"selecione um corpo". Com energia **e** momento desligados o fieldset "sistema" some. Campos de edição nunca são filtrados: `PropertiesPanel` (inclusive v₀), `ForcesPanel`, mola, corda, polia e contatos ficam como estão. Os chips não filtram os tipos do gráfico.

**Escopo.** "mostrar todos os vetores" (`showGlobal`) continua sendo o escopo todos-os-corpos vs. o selecionado, agora com padrão ligado (`useState(true)`). Os dois eixos compõem: um grupo desligado não aparece em escopo nenhum.

**Edição de visualização.** Um clique num chip grava `focus` no documento por um caminho próprio (`docRef.current = { ...docRef.current, focus }; setDoc(...)`), que não passa por `editDoc`: não empilha histórico, não chama `copyOpenPreset`, não marca `resetOnEditRef`, não dispara `reset`, e funciona com `liveLocked` e `structuralLocked`. Numa cena do usuário o autosave existente salva o `focus` (o payload serializado mudou). Num preset aberto o chip muda só o `doc` em memória: nenhuma cópia é criada e, ao reabrir o preset, `buildScene()` devolve o padrão dele. `routeDocChange` já devolve `{ kind: 'live', ops: [] }` para uma diferença só em `focus`; o App segue esse caminho sem efeito no mundo.

#### Acceptance criteria

1. `parse` aceita `focus: { show: ['energy', 'forces'] }` e devolve `focus.show` igual a `['forces', 'energy']`; aceita `hidden: { energy: ['E_pg'] }` e o devolve igual; sem `focus`, `scene.focus` é `undefined`.
2. `parse` rejeita `show` com grupo desconhecido (`'foo'`), com repetição (`['forces', 'forces']`), não array, e `focus` com chave desconhecida, com erro cujo texto contém `focus`.
3. `serialize(parse(doc))` de um documento v6 sem `focus` é byte a byte igual ao original; com `focus` presente a saída o contém depois de `constraints` e `parse` o lê de volta igual.
4. `blankScene().focus` é `{ show: ['forces', 'energy', 'momentum'] }`; `createNewScene` persiste uma cena cujo `loadScene` tem esse `focus`; `JSON.stringify(serialize(parse(serialize(blankScene()))))` é igual a `JSON.stringify(serialize(blankScene()))`.
5. `routeDocChange(a, { ...a, focus: { show: ['forces'] } })` devolve `{ kind: 'live', ops: [] }`.
6. No `App`, a fileira de chips é o primeiro item do painel direito, com quatro botões `focus.forces`, `focus.kinematics`, `focus.energy`, `focus.momentum` e `aria-pressed`; numa cena nova em branco os valores são `true, false, true, true`; na `DEMO_SCENE` (sem `focus`) são `true, true, true, true`.
7. Cena em branco com um corpo selecionado (cinemática desligada): a leitura não contém `t('readout.position')`, `t('readout.velocityMagnitude')` nem `t('readout.accelerationMagnitude')`, mas contém `t('readout.steps')`; "ver mais" contém `E_c` e `|p|` e não contém `t('readout.velocity')`. Ligar cinemática traz as três linhas de volta.
8. Desligar energia e momento faz o fieldset `t('readout.system')` sair do DOM; só energia desligada deixa o sistema com `|p|`, `p_x`, `p_y` e sem `E_c`/`E_pg`/`E_mec`, e o "ver mais" do corpo sem `E_c`/`E_pg`.
9. Forças desligadas: depois de um passo com o simulador falso numa cena com um corpo sobre o chão e uma mola, `paint` não escreve os rótulos `P`, `N` nem `F_el` (nenhum `fillText` com esses textos) e a leitura da mola selecionada não mostra `t('readout.springForce')`. Os campos de edição não são filtrados pelo Foco: no mesmo instante (ponta, depois do passo), com o corpo selecionado, os `NumField` do `ForcesPanel` e do painel de contatos continuam no DOM e o atributo `disabled` de cada um é idêntico com forças ligadas e desligadas — os do `ForcesPanel` habilitados (só `liveLocked` os desabilita), os de contatos desabilitados pelo bloqueio estrutural preexistente (PHY-39), que o chip não altera. Em seguida, no registro zero (`seek(0)`), com forças ainda desligadas, todos esses campos estão habilitados. Ligar forças de volta traz `P`.
10. Cinemática desligada em t = 0 num corpo com `vx: 2`: nenhum `fillText` com `v₀`; os campos `properties.vx`/`properties.vy` continuam no DOM. Ligar cinemática desenha `v₀`.
11. Chips são edição de visualização: numa cena nova, três cliques em chips deixam undo e redo `disabled`, `step` com o mesmo número de chamadas e o slider no mesmo valor; com o cursor no registro 5 (campos de g desabilitados) o chip de cinemática ainda alterna e a leitura muda.
12. Preset: abrir `free-fall`, desligar forças → `currentId` continua `preset:free-fall` (a opção do preset segue no `<select>` de cenas, `scenes.presetOption`), nenhuma cena nova no índice; trocar para `cena-1` e reabrir `free-fall` → os chips voltam ao padrão do preset (todos `true` até o PHY-79).
13. Cena do usuário: desligar momento e avançar `AUTOSAVE_DELAY_MS` → a cena salva em `physics-sim:scene:<id>` tem `focus.show` sem `'momentum'`.
14. O checkbox `panel.showVectors` está marcado ao montar.
15. `focus.show`, `focus.forces`, `focus.kinematics`, `focus.energy`, `focus.momentum` em pt-BR e en; paridade verde.

#### Verification

    npm test -- src/scene/codec.test.ts src/persistence/persistence.test.ts src/playback/routing.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: critérios 1 a 3 chamando `parse` e `serialize` direto; vermelhos hoje porque `checkKeys` rejeita `focus`.
- `src/persistence/persistence.test.ts`: critério 4 chamando `blankScene`/`createNewScene`/`loadScene` direto; vermelho hoje. Testes existentes que comparam `toEqual(blankScene())` seguem verdes porque comparam com a mesma função.
- `src/playback/routing.test.ts`: critério 5 chamando `routeDocChange` direto; passa hoje e pina o contrato.
- `src/App.test.ts`: critérios 6 a 14 com o simulador falso e o mock de canvas que o arquivo já usa (os rótulos passam por `fillText`); vermelhos hoje (não há chips, `showGlobal` começa desligado). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

#### Stage 2 — red/green e mutate-verify (2026-10-04)

- Codec: 20 casos novos na costura pública. Antes da implementação: 3 falhas `unknown key 'focus' at scene root`, 17 verdes. Depois: 151/151 no arquivo. Mutações temporárias: `parseFocus` sem validação/canonização → 17 falhas; descartar o foco validado → 3 falhas; inserir padrão na ausência → 2 falhas. Todos os arquivos restaurados após cada execução.
- Persistência: teste direto vermelho `expected undefined to deeply equal { show: ['forces', 'energy', 'momentum'] }`; remover o padrão da produção já implementada repetiu essa falha (1 falha, 51 ignorados), com restauração em `finally`. Codec + persistência + roteamento verdes em 242/242. Roteamento: mutação temporária classificando foco como estrutural → 1 falha no teste novo; `routing.ts` permanece sem alteração.
- App: ciclos separados de testes antes de produção (7, depois 4, depois 6 casos vermelhos). Verde após as respectivas implementações: 17/17 casos novos. O simulador é o falso existente; produtores de vetores, `drawArrow`, codec e persistência são reais.

Evidência por teste novo de DOM/canvas (cada mutação foi aplicada ao código de produção, executada e restaurada):

| Teste (`src/App.test.ts`) | Mutação aplicada | Saída vermelha observada |
| --- | --- | --- |
| `puts accessible focus chips first ... demo scenes` | `aria-pressed={false}` | `expected ['false','false','false','false'] to deeply equal ['true','true','true','true']` (4 falhas na execução, 3 verdes). |
| `puts accessible focus chips first ... blank scenes` | `aria-pressed={false}` | `expected ['false','false','false','false'] to deeply equal ['true','false','true','true']` (mesma execução). |
| `starts with the vector scope covering all bodies` | `showGlobal` inicia `false` | `expected false to be true` (1 falha, 6 verdes). |
| `toggles focus outside history and autosaves ... hidden curves intact` | chip chama `commitDoc(next)` | undo: `expected false to be true` (2 falhas, 5 verdes). Remover `...current.focus` também falhou: foco salvo sem `hidden` não igual ao esperado (1 falha, 6 verdes). |
| `keeps preset focus in memory ... reopening` | chip chama `commitDoc(next)` | `expected 'cena-2' to be 'preset:free-fall'` (2 falhas, 5 verdes). |
| `localizes the focus row in pt-BR` | `focus.show` pt-BR = `mutant` | `expected 'mutantforçascinemáticaenergiamomento' to contain 'mostrar:'` (3 falhas, 4 verdes). |
| `localizes the focus row in en` | `focus.show` en = `mutant` | `expected 'mutantforceskinematicsenergymomentum' to contain 'show:'` (1 falha, 6 verdes). |
| `filters initial body readouts with blank focus ...` | `showKinematics = true` | `expected 'leitura — bolapassos: 0velocidade: 1,…' not to contain 'posição'` (2 falhas, 9 verdes). |
| `PHY-78 filters body and spring system energy independently from momentum` | `showEnergy = true` | `expected 'sistemaE_c: 0,00 JE_pg: 40,00 JE_el: …' not to contain 'E_c'` (2 falhas, 9 verdes). |
| `PHY-78 edits the current focus at record five ...` | foco do painel vem de `displayedScene()` | chip: `expected 'true' to be 'false'` (2 falhas, 9 verdes). `showKinematics = true` também falhou por ainda conter posição. |
| `PHY-78 preserves the recording ... record zero` | chip chama `commitDoc(next)` | slider: `expected '0' to be '8'` (4 falhas, 7 verdes). |
| `composes focus with global vector scope ...` | remover o grupo de cinemática da condição de v₀ | `expected ['m','v₀','F'] to not include 'v₀'` (2 falhas, 15 verdes). Forças sempre ligadas também falhou por incluir `F`. |
| `composes focus with selected vector scope ...` | remover o grupo de cinemática da condição de v₀ | mesma falha de v₀. Remover o guard de forças do ramo selecionado também falhou no anel: `expected [Array(1)] to deeply equal []` (1 falha, 16 verdes). |
| `PHY-78 hides force layers and spring readouts ...` | forças sempre ligadas no canvas | `expected ['m','P','F','N','F','el'] to not include 'P'` (6 falhas, 11 verdes). N sem guard: `expected ['m','N'] to not include 'N'`; F_el sem guard: `expected […(2)] to deeply equal []`; leitura da mola sem guard: `expected 'leitura — linkpassos: 1velocidade: 1,…' not to contain 'F_el'` (cada uma: 1 falha, 16 verdes). |
| `PHY-78 hides rope tension ... slack=false` | leitura da corda ignora forças | `expected 'leitura — linkpassos: 1velocidade: 1,…' not to contain 'T'` (2 falhas, 15 verdes). Canvas sempre ligado também falhou por incluir `T`. |
| `PHY-78 hides rope tension ... slack=true` | leitura da corda ignora forças | mesma falha de `T` (mesma execução); a asserção de frouxa permanece no caso. |
| `PHY-78 uses current focus when painting recorded force vectors` | `paint` recebe `displayedScene().focus` | `expected ['m','P','F'] to not include 'P'` (1 falha, 16 verdes). |

##### Gate e handoff

- Gate oficial `npm test && npm run lint && npm run typecheck && npm run build`: **exit 0**, **33 arquivos / 1210 testes passed, sem skips**; lint, typecheck e build exit 0. Vite transformou 52 módulos; aviso pré-existente de chunk sim >500 kB (2136,50 kB).
- A tentativa focada inicial teve 426 testes passed e 2 falhas de conexão com Chromium; uma repetição fora do sandbox teve 1 caso passed e 1 falha de assentamento inicial de geometria. O gate completo final fora do sandbox passou todos os testes de Chromium/layout, sem alterar o harness nem omitir testes.
- 39 testes novos: 20 codec, 1 persistência, 1 roteamento, 17 App. Commits de testes separados dos commits de produção; correções de harness em seus próprios commits, novamente vermelhas. Evidência de mutações por teste acima.
- Diff final revisado: apenas Primary files e o próprio ticket; sem alteração em `routing.ts`, motor, presets ou tipos do gráfico, sem artefatos gerados ou segredos. Forma do domínio continua a já documentada em CONTEXT.md. Branch `phy/PHY-78-modelo-de-foco-e-chips`, base de sessão `sweatshop/2026-10-04-1243`.
- Stage 2 entregue em `to-review`; revisão e merge pertencem à próxima sessão.

- Stage 2, harness de canvas: `drawArrow` separa `F_el` em chamadas `fillText('F')` e `fillText('el')`; o teste verifica esses dois textos na cor elástica, com presença positiva antes de desligar forças. Corrigida a expectativa de P no caso de v₀ em t=0: `weightArrows` só desenha com estados simulados (vetores iniciais são PHY-82); o teste de forças após um passo cobre P e N. Campos de contatos mantêm o bloqueio estrutural após um passo e são verificados habilitados no registro zero, sem o Foco alterar esse bloqueio.

- Stage 2, ajuste de harness: o teste de tradução alterava o storage depois de o módulo i18n já ter hidratado seu idioma. Agora troca o idioma pelo `<select>` público do App; não exige comportamento novo. Verificado vermelho novamente com `focus.show` em inglês mutado para `mutant` (esperado `show:`, recebido `mutantforceskinematicsenergymomentum`).

- 2026-10-04 Stage 2: costuras confirmadas pelo contrato: codec público, persistência pública, `routeDocChange` e App no DOM/canvas com simulador falso. Chamadores examinados antes dos testes: `parse` em `loadScene`, `loadSceneOrBlank` e `classifyImport`; `serialize` no autosave, exportação, comparação de payload e cópia de cenas; `blankScene` em criação e fallback de carga; `paint` no `repaint`, inclusive registro histórico. Fronteiras a preservar: `focus` ausente, `show: []`, `hidden` vazio/chaves arbitrárias, ambos energia/momento desligados, cenas sem corpos, cursor zero/passado/ponta, preset e campos de edição.

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: `focus` opcional na `Scene`, ausente = tudo ligado, cena em branco com forças + energia + momento; fileira "mostrar: forças · cinemática · energia · momento" no topo do painel direito; forças = setas de força + leituras de força, cinemática = setas v/a + leituras cinemáticas, energia e momento só painel; setas independentes; "mostrar todos os vetores" vira escopo e nasce ligado; grupos valem para leitura do corpo e sistema, edição nunca filtrada; chips fora do undo e sem reset, salvos em cenas do usuário e só da sessão em presets; chips não filtram tipos do gráfico.
- Planner: forma `{ show, hidden? }` com `show` canonizado; leitura de vínculo pertence a forças; "sistema" some com energia e momento desligados; a seta de F aplicada sai com forças (a âncora continua editável pelo painel); Foco lido do `docRef`, nunca do registro; caminho dos chips fora de `editDoc`; `routeDocChange` já trata `focus` como `live` sem ops.

- 2026-10-04 Attempt 1 stopped to ask: PHY-78 ficou `blocked`, registrado no commit `58c5ac4`. O critério 9 exige contatos habilitados após um passo, contrariando o bloqueio existente e o spec. /  / 39 testes focados passaram; 389 ficaram fora do filtro. Apenas o ticket mudou. /  / Aprova preservar contatos bloqueados após um passo e habilitados no registro zero, ajustando o critério e seu teste? O [ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “a session without a proxy asks by stopping”. /  / A revisão automática rejeitou a consulta ao Claude por envolver envio de código privado a um destino externo não verificado. Sua decisão direta resolve essa pendência.
- 2026-10-04 Proxy decided: manter o bloqueio estrutural (PHY-39, ADR-0004) e reescrever o critério 9: o Foco não pode esconder nem mudar a habilitação de campo nenhum, verificado no mesmo instante; contatos desabilitados após um passo é o PHY-39, não o PHY-78 — a regra do spec ("campos de edição nunca são filtrados") é sobre o Foco, não sobre os outros bloqueios, e o critério como escrito pedia que este ticket desfizesse o PHY-39, o que ninguém decidiu. Nenhuma mudança de produção; só o teste do critério 9 (commit test-only) e o texto do critério. O que o teste deve asserir: (a) após `p.steps(1)`, selecionar o corpo e capturar `disabled` de cada input de forças e de `contacts.muS/muK/e` com forças ligadas; (b) `toggleFocus('forces')` e asserir que os mesmos inputs seguem no DOM com `disabled` igual ao capturado — forças `false`, contatos `true` — sem `seek(0)` antes; (c) só então `p.seek(0)` e asserir todos `false`, ainda com forças desligadas; (d) religar forças e asserir `P`. Mutate-verify: a mutação "fieldset de contatos recebe `disabled={disabled || !showForces}`" (ou `hidden` nos campos com forças desligadas) deve ficar vermelha em (b); registrar a saída no ticket. Retomar da branch `phy/PHY-78-modelo-de-foco-e-chips` (fb7bb72): os outros critérios passaram com 22 mutações; `src/App.tsx` não muda.
- 2026-10-04 Foreman: retomar da branch `phy/PHY-78-modelo-de-foco-e-chips` (código revisado em `fb7bb72`; a sessão ainda não foi mergeada nela e `src/App.tsx` conflita com o PHY-82, já na sessão: integrar a sessão faz parte da retomada); falta só o commit test-only do critério 9 com a mutação registrada.

#### Stage 3 review (2026-10-04)

Verdict: Reopen — criterion 9 requires enabled contact fields after one step, but the implementation and test preserve the existing structural lock.

- **Standards:** 0 violações documentadas e 0 smells acionáveis. Diff completo e os 12 commits examinados: somente Primary files e o ticket; testes e produção separados, inclusive as duas correções de harness; evidência de mutate-verify presente por caso novo de DOM/canvas. Nenhuma correção de produção nesta revisão.
- **Spec:** 1 achado de reabertura, critério 9. O contrato numerado exige, depois de um passo, os NumField de forças e contatos no DOM **e habilitados**. Em `src/App.tsx:808`, `structuralLocked` fica verdadeiro após o passo; `:2353` o passa a `BodyContactsPanel`, cujo fieldset `:505` desabilita os contatos. O teste `src/App.test.ts:3491` volta ao registro zero antes de verificar habilitação em `:3494-3495`, provando outro instante.

O bloqueio já existe na base `d6b9a700` (`App.tsx:804`, `:2313`, `:501`). A implementação preserva esse comportamento e concorda com a prosa "contatos ficam como estão"; não é regressão de contatos introduzida pelo PHY-78. Entretanto, a prosa e o comentário do stage 2 não substituem um critério numerado. Esta revisão não altera o texto do critério nem decide habilitar edição estrutural depois do passo.

Sondagem temporária no teste existente: depois do passo e de desligar forças, selecionar o corpo e executar a asserção de contatos **antes** de `p.seek(0)`. Vermelho: `AssertionError: expected true to be false` na asserção `input.matches(':disabled')` (1 falha desse caso). Junto com a sondagem de undo abaixo: **2 failed / 0 passed / 185 skipped**. Instrumentação restaurada, sem teste ou código novo persistido.

| Critério | Veredito | Evidência examinada |
| --- | --- | --- |
| 1 | ✅ | Parse canoniza grupos, preserva hidden e ausência de focus. |
| 2 | ✅ | Grupos inválidos/repetidos, tipos inválidos e chaves desconhecidas rejeitados com erro de focus. |
| 3 | ✅ | Bytes v6 preservados; focus depois de constraints; round-trip. |
| 4 | ✅ | Padrão explícito da cena em branco, criação/carga e bytes canônicos. |
| 5 | ✅ | Mudança só de focus roteada live, sem ops. |
| 6 | ✅ | Primeira fileira do inspetor, quatro botões acessíveis e padrões demo/blank. |
| 7 | ✅ | Leitura inicial do corpo e detalhes respondem ao grupo cinemática. |
| 8 | ✅ | Energia/momento independentes no corpo e sistema; fieldset removido com ambos desligados. |
| 9 | ❌ parcial | Camadas e leitura de mola ocultadas/restauradas; campos presentes. Contatos desabilitados no instante pós-passo exigido; habilitação só testada no registro zero. |
| 10 | ✅ | v₀ responde à cinemática nos dois escopos; campos vx/vy preservados. |
| 11 | ✅ | Chips não empilham histórico, não avançam/reconstroem mundo e funcionam no cursor 5; gravação preservada no cursor zero. |
| 12 | ✅ | Preset conserva identidade/índice, não persiste cópia e reabrir restaura o padrão. |
| 13 | ✅ | Autosave de cena do usuário conserva focus e hidden. |
| 14 | ✅ | Escopo global marcado ao montar. |
| 15 | ✅ | Catálogos pt-BR/en e paridade, com tradução pelo controle público. |

**Restante para o próximo stage:** somente o ❌ do critério 9. O conflito entre habilitação pós-passo e bloqueio estrutural preexistente precisa de resolução explícita do stage 1/proxy antes de uma implementação que altere o contrato. Depois, o teste deve verificar o instante aprovado, sem uma navegação silenciosa para outro registro. Reaberto em `to-implement`, sem merge e sem linha PHY-78 no ledger.

**Fora dos critérios, CLEAN-31:** desfazer/refazer uma edição física restaura a Scene inteira, inclusive um Foco anterior. Reprodução: cena nova → adicionar corpo → desligar momento → desfazer corpo; o chip momento volta a pressionado. Sondagem temporária: `expected 'true' to be 'false'`. Critério 11 só exige que cliques nos chips não criem entradas; não define preservação do Foco ao consumir histórico físico existente. Requisito separado em triagem, sem usá-lo como motivo de reabertura.

**Chamadores, falhas e interações examinados:** codec público em import/load/fallback; serialização em autosave/export/duplicação/comparação de payload; blankScene/createNewScene; editDoc/commitDoc/copyOpenPreset e autosave após materializar preset; routeDocChange/applyLiveOps; boot/reset/syncWorld; captureFrame/displayedScene/repaint e leituras no passado; escopos global/selecionado e anel da força; energia/momento, mola/corda frouxa, campos de edição, troca/reabertura de cena, undo/redo e independência dos tipos do gráfico. Fronteiras: focus ausente, show vazio, hidden vazio e chaves especiais, ambos grupos do sistema desligados, cenas sem corpos, cursores zero/passado/ponta. Não repetido um passe humano independente nem outros navegadores/mobile. Não há linhas `Proxy decided` no ticket.

##### Validação independente

- Base fixada: `d6b9a700e7b84aff842f74d7e32727e3540edab9`, sessão `sweatshop/2026-10-04-1243`; implementação revisada `fb7bb72`.
- Gate oficial: **exit 0; 33 arquivos / 1210 testes passed, zero skips**; lint, typecheck e build exit 0. Vite: 52 módulos; aviso preexistente do chunk do simulador >500 kB (2136,50 kB).
- Primeira execução no sandbox: 1182 passed / 28 failed, todos os failures em conexão/desconexão do Chromium (26 layout/browser e 2 App/Chromium). Nova execução integral fora do sandbox passou, sem omitir testes ou alterar o harness. O sandbox também passou a falhar ao iniciar comandos de leitura com `CreateProcessWithLogonW failed: 1909`; comandos locais fora dele funcionaram.
- Repetidas **22 mutações documentadas**, todas com falha de asserção, atingindo cada um dos **39 casos novos**. Arquivos de produção restaurados em finally, byte a byte; `git diff --exit-code -- src` exit 0.
- Verde após as mutações e novamente após as duas sondagens: **4 arquivos / 39 passed / 389 skipped**, filtro `scene focus|PHY-78` na costura focada (os 389 são casos fora desse filtro; o gate integral acima não tem skips). `git diff --check` verde.

| Mutação repetida | Red observado na revisão (failed / passed dentro do filtro) |
| --- | --- |
| aria-pressed sempre false | Demo e blank: arrays esperados true; **2 / 0**. |
| showGlobal inicia false | `expected false to be true`; **1 / 0**. |
| Chip chama commitDoc | Undo habilitado, preset vira cena-2, slider max 0 em vez de 8; **3 / 0**. |
| Remover spread de current.focus | Focus salvo perde hidden; **1 / 0**. |
| focus.show pt-BR = mutant | Esperado mostrar:, recebido mutant; **1 / 0**. |
| focus.show en = mutant | Esperado show:, recebido mutant; **1 / 0**. |
| showKinematics = true | Leitura inicial e cursor 5 ainda contêm posição; **2 / 0**. |
| showEnergy = true | Sistema ainda contém E_c; **1 / 0**. |
| Foco do painel vem de displayedScene | Chip true em vez de false no cursor 5; **1 / 0**. |
| Remover guard cinemática de v₀ | v₀ presente nos dois escopos; **2 / 0**. |
| Forças sempre ligadas no canvas | P/T permanecem na mola, corda frouxa/esticada e cursor histórico; **4 / 0**. |
| N sem guard | Canvas ainda contém N; **1 / 0**. |
| F_el sem guard | Chamadas F/el ainda presentes; **1 / 0**. |
| Leitura de mola sem guard | Leitura ainda contém F_el; **1 / 0**. |
| Leitura de corda sem guard | T ainda presente nos dois casos de frouxa; **2 / 0**. |
| paint recebe displayedScene().focus | Canvas histórico ainda contém P; **1 / 0**. |
| Forças selecionadas sem guard | Anel de âncora ainda presente; **1 / 0**. |
| parseFocus sem validação/canonização | Canonização e rejeições falham; **17 / 3**. |
| Descartar focus validado | Focus/hidden/show vazio perdidos; **3 / 17**. |
| Inserir focus quando ausente | Documento v6 ganha focus; **1 / 19**. |
| Remover padrão de blankScene | `expected undefined to deeply equal { show: ... }`; **1 / 0**. |
| Roteamento de focus estrutural | Esperado live sem ops, recebido structural; **1 / 0**. |
