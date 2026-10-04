# PHY-78: Modelo de Foco e chips
Stage: done
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

#### Stage 2 — decisão de contrato pendente (2026-10-04)

- Retomada na branch existente `phy/PHY-78-modelo-de-foco-e-chips`, commit `0cdd8c0`, base de sessão `sweatshop/2026-10-04-1243`. Restante: somente o critério 9 reaberto; nenhuma alteração de produção ou de testes nesta tentativa.
- Confirmado o conflito: o critério exige contatos habilitados depois de um passo, mas a prosa e o spec preservam os campos de edição. `BodyContactsPanel` recebe `structuralLocked`; o teste anterior `locks the whole body contact fieldset after stepping and unlocks after reset` exige esse bloqueio. O teste novo de forças navega para o registro zero antes de verificar habilitação, portanto não resolve o instante exigido pelo critério.
- Pergunta ao humano: aprova esclarecer o critério 9 para preservar as permissões existentes, verificando forças editáveis e contatos bloqueados depois de um passo, e ambos habilitados no registro zero, antes e depois de alternar o Foco? Recomendação: preservar o bloqueio, conforme o spec; habilitar contatos após um passo mudaria a edição física além do escopo de Foco.
- Consulta ao proxy indisponível nesta tentativa: o CLI no sandbox foi encerrado sem resposta. A execução autenticada fora do sandbox, limitada a ferramentas de leitura, foi rejeitada pela revisão automática porque enviaria código, especificações e testes privados a um destino externo não verificado. Nenhuma decisão de proxy recebida; o contrato numerado permanece inalterado. Aguardando decisão direta do humano, conforme a seção `Asking the proxy` de `ticket-flow`.
- Validação disponível: `npm test -- src/App.test.ts src/scene/codec.test.ts src/persistence/persistence.test.ts src/playback/routing.test.ts -t 'scene focus|PHY-78'` — exit 0, 4 arquivos / 39 passed / 389 skipped (casos fora do filtro); `git diff --check` verde antes do registro do bloqueio. O gate integral não foi repetido nesta tentativa, pois não houve mudança de código.

#### Stage 2 resume (2026-10-04)

Somente o teste do critério 9 foi reforçado, conforme a decisão do proxy acima.
No mesmo instante após um passo, seleciona o corpo, captura os quatro campos de
força habilitados e os três de contato bloqueados, desliga forças e exige os
mesmos campos e bloqueios. Só depois navega ao registro zero e exige os sete
campos habilitados, ainda com forças desligadas. Religar forças deve restaurar P.

Costura: DOM e canvas reais do App com o simulador falso já aprovado no ticket.
`ForcesPanel` e `BodyContactsPanel` são chamados apenas pelo ramo do corpo
selecionado. Foram examinados `liveLocked`, `structuralLocked`, `showFrame`,
`seek(0)` e o caminho dos chips fora de `editDoc`; nenhuma alteração de produção
é necessária para os bloqueios. O caso distingue a ponta após um passo do
registro zero, evitando a navegação que ocultava a lacuna do teste anterior.

##### Mutate-verify do teste do critério 9

Comando por mutação: `npm test -- src/App.test.ts -t 'PHY-78 hides force layers and spring readouts'`.
As mutações abaixo foram aplicadas temporariamente ao App de produção e
restauradas byte a byte em `finally`; `git diff --exit-code -- src/App.tsx`
confirmou a restauração.

| Mutação em produção | Vermelho observado |
| --- | --- |
| Prop de `BodyContactsPanel`: `doc={showForces ? doc : { ...doc, contacts: [] }}`, removendo os campos de contato quando forças estão desligadas | `Error: missing input for μs — atrito estático`, na comparação imediatamente após desligar forças, antes de `seek(0)` (`src/App.test.ts:3492`). **1 failed / 185 skipped**, exit 1. |
| Prop de `BodyContactsPanel`: `disabled={structuralLocked || !showForces}` | No registro zero, esperado `[false, false, false, false, false, false, false]`, recebido `[false, false, false, false, true, true, true]` (`src/App.test.ts:3509`). **1 failed / 185 skipped**, exit 1. Na ponta esta mutação é equivalente ao bloqueio estrutural; a primeira mutação prova a comparação antes do seek. |

Sem mutação, antes de integrar a sessão, os novos checks de campos passam e a
última asserção fica vermelha: `expected [ 'm', 'F', 'N' ] to include 'P'`,
**1 failed / 185 skipped**, exit 1. A checagem de P no registro zero estava errada
no harness: `weightArrows` exige estados simulados; o PHY-82 acrescenta N/T
iniciais, sem mudar essa regra de P. Correção do harness registrada abaixo.

A revisão e as 22 mutações dos demais critérios continuam disponíveis no commit
`0cdd8c0`; a decisão do planner incorporada por `91cb99a` substituiu o corpo do
ticket e deixou somente a pendência do critério 9.

##### Integração da sessão e correções de harness

- Branch atualizada por rebase sobre `b3aca92`, sessão
  `sweatshop/2026-10-04-1243`, preservando os commits separados. O conflito de
  `paint` foi resolvido no commit de produção reexecutado `6b39fe2`: os guardas
  de forças abrangem os contatos/trações da sonda, mas a escolha da sonda depende
  somente do instante zero, nunca de cinemática. `ForcesPanel` e
  `BodyContactsPanel` permanecem sem mudança de produção.
- Depois da resolução, typecheck passou, mas o filtro de App apresentou
  **9 failed / 19 passed / 169 skipped**: `setupProbe` clicava incondicionalmente
  em "mostrar todos os vetores", agora marcado por padrão, e desligava as setas.
  O preparo agora habilita o checkbox somente se estiver desmarcado. Não muda a
  expectativa desses testes nem o produto.
- Correção da asserção de P: os sete campos continuam sendo verificados no
  registro zero com forças desligadas; só depois o teste volta explicitamente
  ao registro 1 e religa forças para exigir P. A comparação pós-passo anterior
  ao primeiro seek permanece intacta. Essa correção de harness respeita a
  semântica já documentada no commit test-only `f47cdd5`.
- O teste existente `paints N and T at t0 and anchors T` também exige N/T com
  cinemática desligada, ausência com forças desligadas e restauração ao religar
  forças, sem novos passos nem novas sondas. Isso verifica a interação no hunk
  de produção resolvido, no mesmo seam de DOM/canvas aprovado.

Mutate-verify repetido depois do rebase e das correções, sempre restaurando
`src/App.tsx` byte a byte. Cada execução: **1 failed / 196 skipped**, exit 1.

| Teste modificado | Mutação em produção | Vermelho observado |
| --- | --- | --- |
| `PHY-78 hides force layers and spring readouts` | Remover os contatos pelo prop `doc` quando forças estão desligadas | `missing input for μs — atrito estático`, comparação na ponta antes de seek (`src/App.test.ts:3763`). |
| Mesmo teste | `disabled={structuralLocked || !showForces}` no prop de contatos | No registro zero, os três últimos valores são `true`, esperados `false` (`src/App.test.ts:3780`). |
| `paints N and T at t0 and anchors T` | `initialProbe = showInitialVelocity ? opts?.initialProbe : undefined` | Logo após desligar cinemática, `expected [ 'm', 'a', 'm', 'b' ] to include 'N'` (`src/App.test.ts:976`). |

Verde com a produção restaurada: `npm test -- src/App.test.ts src/scene/codec.test.ts src/persistence/persistence.test.ts src/playback/routing.test.ts -t 'scene focus|PHY-78|initial force vectors'`
→ **4 arquivos / 50 passed / 389 skipped**, exit 0; os skips são os casos fora
desse filtro. `git diff --exit-code -- src/App.tsx` confirmou que as mutações
foram restauradas. Correções de harness e evidência ficam em commit só de teste.

#### Stage 2 handoff (2026-10-04)

- Pendência do critério 9 resolvida pelos commits só de teste `fa85eb6` e
  `23bc640`: comparação dos sete campos na ponta antes/depois do chip,
  habilitação no registro zero com forças desligadas e restauração de P no
  registro simulado. As mutações e seus vermelhos estão registrados acima.
- Integração com o PHY-82 concluída sobre a sessão `b3aca92`. O conflito de
  `paint` preserva as sondas iniciais, o caminho documental de T e os grupos
  independentes do Foco; a regressão dessa independência está coberta por teste
  com mutação. A retomada não altera a produção de campos de forças/contatos.
- Verificação focada completa fora do sandbox, permitindo Chromium:
  `npm test -- src/scene/codec.test.ts src/persistence/persistence.test.ts src/playback/routing.test.ts src/App.test.ts`
  → **4 arquivos / 439 testes passed, zero skips**, exit 0.
- Gate oficial completo fora do sandbox:
  `npm test && npm run lint && npm run typecheck && npm run build`
  → **33 arquivos / 1226 testes passed, zero skips**, lint, typecheck e build
  **exit 0**. Vite: 52 módulos; aviso preexistente do chunk do simulador acima
  de 500 kB (2136,71 kB). Nenhuma validação pendente.
- Diff revisado contra `b3aca92`, incluindo a resolução do conflito. Commits de
  produção não alteram testes; retomada limitada a `App.test.ts`, ao ticket e à
  resolução de `paint` durante o rebase. `git diff --check` verde, mutações
  restauradas e artefatos de build fora do diff.
- Limitação já registrada pela revisão anterior: desfazer/refazer uma edição
  física pode restaurar um Foco anterior; o contrato adicional permanece em
  `CLEAN-31`, que esta retomada preserva sem modificar.

Etapa 2 encerrada em `to-review`, pronta para a revisão independente do stage 3.

#### Stage 3 re-review (2026-10-04)

Verdict: Reopen — regression: changing focus during simulator boot suppresses the initial constraint readout after boot succeeds.

- **Standards:** 0 violações documentadas e 0 smells acionáveis. Diff completo
  de 13 arquivos e os 18 commits examinados contra a base fixada `b3aca92`
  (`sweatshop/2026-10-04-1243`), HEAD revisado `e20f60e`. Primary files
  respeitados; produção e testes permanecem em commits separados. Nenhuma
  correção de produção ou teste novo persistido nesta revisão.
- **Spec:** os critérios numerados 1–15 passam, incluindo a pendência anterior
  do critério 9. Há **1 regressão**, descrita abaixo; ela exige teste novo,
  portanto retorna mecanicamente ao stage 2. O rebuild redundante antes do
  primeiro passo, isoladamente, não reprova o critério 11.
- **Decisão do proxy examinada:** a linha `Proxy decided` que preserva o
  bloqueio estrutural de PHY-39/ADR-0004 está incorporada ao critério 9. O teste
  agora compara os sete campos na mesma ponta, antes de seek; contatos seguem
  bloqueados ali e todos os campos ficam habilitados no registro zero. A
  integração de PHY-82 mantém N/T independentes de cinemática e não dá novos
  passos nem novas sondas por um clique nos chips.

##### ❌ Regressão: leitura inicial perdida por uma edição de visualização durante boot

Reprodução no DOM do App, com o simulador falso e a costura de boot já existentes:

1. Carregar a cena de `setupProbe({ delayedBoot: true })`, que tem a corda
   `corda`, mantendo a construção do simulador pendente.
2. Clicar no chip **energia**, sem desligar forças, antes de resolver o boot.
3. Resolver o boot com sucesso, selecionar a corda no canvas em `(8, 4.5)` e
   avançar o polling de leitura em 100 ms, sem executar nenhum passo.
4. A leitura mostra `leitura — cordapassos: 0velocidade: 1,00×sem leitura`.
   Sem o clique, ou com o mesmo clique depois do boot, ela contém `T` como
   antes. O teste existente de PHY-82 também exige `T: 0,00 N` em t = 0.

Causa: `toggleFocusGroup` muda a identidade de `docRef.current`
(`src/App.tsx:883`). Ao concluir o boot, `ensureSim` marca
`pendingRebuildRef.current = docRef.current !== bootDoc` (`:1316`), mesmo sendo
uma diferença só de Foco. O efeito classifica a edição como live sem ops e
atualiza `builtDocRef` (`:1224-1232`), mas não limpa essa pendência. O polling
usa o flag para descartar a leitura válida em `constraintsRef` (`:1055`). O
primeiro passo/rebuild pode liberar a leitura, mas uma edição de visualização
não deve invalidar a leitura de um mundo que já corresponde à mesma física.

Este caminho de boot já estava no código examinado pela revisão anterior
`906b9ae`; o achado é **uma omissão daquela revisão**, e não um requisito novo
nem uma regressão introduzida pelas correções de harness da retomada. A revisão
independente deste passe encontrou a consequência durante a checagem final de
falhas e inicialização.

Sondagem temporária em `src/App.test.ts`, dentro do describe de vetores iniciais,
com três casos (sem chip, chip depois do boot, chip durante o boot):
`npm test -- src/App.test.ts -t 'stage3 probe preserves initial rope readouts'`
→ **1 failed / 2 passed / 197 skipped**, exit 1. Só o caso durante boot falhou:
`AssertionError: expected 'leitura — cordapassos: 0velocidade: 1…' to contain 'T'`.
Antes dessa asserção, forças permaneciam pressionadas e os spies confirmaram
zero chamadas de `step` e `replaceScene`. O arquivo foi restaurado byte a byte
em `finally`; `git diff --exit-code -- src/App.test.ts src/App.tsx` passou.

**Restante para o stage 2:** somente esta regressão. Escrever o teste de boot
pendente na costura de App já aprovada, em commit só de teste e vermelho; corrigir
a interação entre Foco e a pendência do mundo sem perder as edições físicas
durante boot. Preservar os controles sem chip/pós-boot, as leituras de vínculos,
a sonda inicial e os bloqueios existentes. Não limpar indiscriminadamente uma
pendência estrutural real. Nenhum critério foi reescrito nesta revisão.

##### Validação independente e memória da revisão

- Gate oficial completo fora do sandbox:
  `npm test && npm run lint && npm run typecheck && npm run build`
  → **33 arquivos / 1226 testes passed, zero skips**, lint, typecheck e build
  **exit 0**. Vite: 52 módulos; aviso preexistente do chunk do simulador acima
  de 500 kB (2136,71 kB). A sondagem acima demonstra uma lacuna dessa suíte verde.
- A primeira execução no sandbox teve **1198 passed / 28 failed**, todos por
  conexão com Chromium DevTools. A repetição integral fora dele passou sem
  omitir testes nem alterar o harness.
- Repetidas as três mutações documentadas na retomada, sempre em produção e
  restauradas byte a byte em `finally`:

| Teste | Mutação | Vermelho independente |
| --- | --- | --- |
| `PHY-78 hides force layers and spring readouts` | Prop de contatos remove `contacts` com forças desligadas | `missing input for μs — atrito estático` na comparação antes de seek, `App.test.ts:3763`; **1 failed / 196 skipped**, exit 1. |
| Mesmo teste | Prop de contatos recebe `disabled={structuralLocked || !showForces}` | No registro zero, últimos três valores `true` em vez de `false`, `App.test.ts:3780`; **1 failed / 196 skipped**, exit 1. Na ponta o mutant continua equivalente ao bloqueio estrutural. |
| `paints N and T at t0 and anchors T` | Escolha da sonda acoplada a `showInitialVelocity` | Depois de desligar cinemática, `expected [ 'm', 'a', 'm', 'b' ] to include 'N'`, `App.test.ts:976`; **1 failed / 196 skipped**, exit 1. |

Produção restaurada: os dois casos acima passaram juntos em **2 passed /
195 skipped**, exit 0. A revisão anterior e a evidência original por teste,
incluindo as 22 mutações, permanecem no ticket do commit ancestral alcançável
`906b9ae` (a referência antiga `0cdd8c0` precede o rebase). As correções e a
evidência da retomada estão em `fa85eb6`/`23bc640`.

**Chamadores, falhas e interações examinados:** codec em import/load/fallback;
serialização em autosave/export/duplicação; blankScene/createNewScene;
chips/editDoc/copyOpenPreset e identidade do preset; routeDocChange/applyLiveOps;
boot/reset/syncWorld e sonda inicial, incluindo boot pendente e falha de sonda;
captura/seek/repaint e leitura histórica; escopos global/selecionado e anel de
força; N/T iniciais e caminho documental da corda; mola/corda frouxa;
energia/momento do corpo e sistema; campos/bloqueios, troca/reabertura de cenas,
histórico físico e independência dos tipos do gráfico. Fronteiras examinadas:
focus ausente, show vazio, hidden vazio/chaves especiais, grupos do sistema
desligados, cenas vazias/fixas e cursores zero/passado/ponta. Não houve passe
humano independente, outros navegadores/mobile ou perfil prolongado de desempenho.

**CLEAN-31** permanece como limitação já registrada, fora dos critérios: uma
edição física desfeita/refeita pode restaurar um Foco anterior. Não foi usada
como motivo desta reabertura.

Reaberto em `to-implement` na mesma branch, sem merge e sem linha PHY-78 no ledger.

#### Stage 2: boot readout regression (2026-10-04)

Retomada limitada à regressão da última revisão, na costura aprovada de
DOM/canvas do App com `setupProbe({ delayedBoot: true })`. Não altera critérios,
campos de edição, histórico físico nem o contrato pendente de CLEAN-31.

Leitura ao redor da mudança, antes do teste vermelho: `ensureSim` atende mount,
retry, play e step; seu flag de rebuild é consumido pelo polling de vínculos e
energia e por `syncWorld`, chamado por `runSteps` e pelo loop de reprodução.
Foram examinados o efeito de `doc`/`bootState`, `routeDocChange`/`applyLiveOps`,
reset/troca de cena, `refreshInitialProbe`, `toggleFocusGroup` e `editDoc`.
Fronteiras: mudança só de Foco (live sem ops), nenhuma mudança de documento,
chip pós-boot, edição estrutural de posição durante boot e chip enquanto essa
edição física ainda aguarda sincronização. Operações live de física e falhas
de boot/reset continuam com seus caminhos existentes.

Teste novo parametrizado `PHY-78 preserves initial rope readouts with a focus
edit %s`: controles sem chip e com chip após boot; regressão com energia
alternada durante boot, forças ligadas, leitura `T: 0,00 N`, N/T iniciais e
nenhum passo/rebuild de visualização. O primeiro passo também não deve causar
um rebuild redundante por essa mudança de Foco.

Teste novo parametrizado `PHY-78 keeps physical boot edits pending when focus
changes %s`: mover a bola de x = 8 para x = 9 durante boot e alternar energia
durante/depois do boot. A sonda desenha a geometria atual, a leitura antiga
fica indisponível até a sincronização, e o primeiro passo aplica exatamente uma
reconstrução com a posição editada e restaura `T: 9,00 N`.

Vermelho antes de qualquer alteração de produção:
`npm test -- src/App.test.ts -t 'PHY-78.*boot|PHY-78 preserves initial rope readouts'`
→ **1 failed / 4 passed / 197 skipped**, exit 1. Só o caso de chip durante boot
falha em `App.test.ts:1101`: esperado `T: 0,00 N`, recebido
`leitura — cordapassos: 0velocidade: 1,00×sem leitura`. Os skips são os demais
casos fora do filtro. Este commit contém somente testes e a memória/Stage do ticket.

Verificação adicional de chamador: `BodyContactsPanel` → `updateContact`
permite editar `e` durante boot. O classificador existente de live/structural
não compara `Contact.e`; usá-lo sozinho para limpar a pendência de boot
perderia esse coeficiente no primeiro passo, uma regressão sobre a base.
O guard adicional `PHY-78 preserves restitution edits during boot when focus
changes before and after boot` edita e de 0 para 0,75, alterna chips dos dois
lados do boot e exige a sincronização física com esse contato intacto.
Sem expandir o escopo para `routing.ts`, a correção deve excluir somente
`focus` da comparação entre os documentos imutáveis de boot e corrente.

Mutação temporária de produção: trocar a comparação de identidade por
`routeDocChange(bootDoc, docRef.current)`, marcando pendência somente para
`kind === 'structural' || ops.length > 0`. Comando:
`npm test -- src/App.test.ts -t 'PHY-78 preserves restitution edits during boot'`
→ **1 failed / 202 skipped**, exit 1, `App.test.ts:1154`: esperado
`sem leitura` até sincronizar a edição física, recebido `T: 0,00 N` da cena
antiga. A mutação foi removida antes deste segundo commit só de teste;
`src/App.tsx` voltou à comparação original, sem diff de produção.

##### Correção e mutate-verify desta regressão

Na conclusão de `ensureSim`, comparar a união das chaves dos documentos
imutáveis de boot e corrente, ignorando somente `focus`. Um chip preserva as
referências de todos os campos físicos e não cria pendência; patches físicos
continuam marcando o mundo como pendente, inclusive restituição de contatos.
Nenhuma alteração em roteamento, polling, sonda inicial ou setters de chips.

Commits só de teste anteriores à produção: `94818aa` (regressão e controles)
e `6446948` (guard de restituição). Mutate-verify na produção corrigida:
cada mutação foi removida em `finally`, com restauração e comparação dos bytes
originais de `App.tsx`. As execuções do Vitest abaixo terminaram com exit 1.

| Caso novo na costura DOM/canvas | Mutação em produção | Vermelho observado |
| --- | --- | --- |
| Leitura inicial com chip `during boot` | Restaurar `pendingRebuildRef.current = docRef.current !== bootDoc` no boot | `App.test.ts:1101`: esperado `T: 0,00 N`, recebido `leitura — cordapassos: 0velocidade: 1,00×sem leitura`. **1 failed / 2 passed / 200 skipped** no filtro `PHY-78 preserves initial rope readouts`. |
| Controles de leitura inicial `none`, `during boot` e `after boot` | Polling de vínculo sempre publica `setConstraintReadout(null)` | Os três casos falham em `App.test.ts:1101`, esperado `T: 0,00 N`, recebido `sem leitura`. **3 failed / 200 skipped**, mesmo filtro. |
| Edição de posição pendente com chip `during boot` e `after boot` | Ramo estrutural do efeito de doc escreve `pendingRebuildRef.current = false` | Os dois casos falham em `App.test.ts:1127`: esperado `sem leitura` até sincronizar o mundo, recebido `T: 0,00 N` da cena antiga. **2 failed / 201 skipped** no filtro `PHY-78 keeps physical boot edits pending`. |
| Edição de restituição durante boot, com chips antes/depois do boot | Substituir a comparação por classificação `structural || ops.length > 0` | `App.test.ts:1154`: esperado `sem leitura`, recebido `T: 0,00 N` da cena antiga. **1 failed / 202 skipped** no filtro `PHY-78 preserves restitution edits during boot`. |

Produção restaurada, verde:
`npm test -- src/App.test.ts -t 'PHY-78.*boot|PHY-78 preserves initial rope readouts'`
→ **6 passed / 197 skipped**, exit 0. Cada um dos seis casos novos tem vermelho
por mutação registrado acima; todos os skips são casos fora dos filtros.

##### Stage 2 handoff da regressão de boot (2026-10-04)

- Regressão da última revisão corrigida: alternar somente Foco durante boot
  mantém a leitura inicial da corda, N/T da sonda e o mundo sem rebuild
  redundante. Edições físicas durante boot seguem pendentes e são aplicadas
  no primeiro passo, incluindo posição e restituição de contatos.
- Os seis casos novos de App estão nos commits só de teste `94818aa` e
  `6446948`; a correção de produção não modifica testes. Evidência vermelha
  antes da correção e mutate-verify por caso estão registrados acima.
- Verificação focada completa, fora do sandbox para permitir Chromium:
  `npm test -- src/scene/codec.test.ts src/persistence/persistence.test.ts src/playback/routing.test.ts src/App.test.ts`
  → **4 arquivos / 445 testes passed, zero skips**, exit 0.
- Gate oficial completo, também fora do sandbox:
  `npm test && npm run lint && npm run typecheck && npm run build`
  → **33 arquivos / 1232 testes passed, zero skips**, lint, typecheck e build
  **exit 0**. Vite: 52 módulos; aviso preexistente do chunk do simulador acima
  de 500 kB (2136,71 kB). Nenhuma validação pendente.
- Diff da retomada revisado contra `95c7332`: somente `App.test.ts`,
  `App.tsx` (comparação ao concluir boot) e este ticket, todos dentro da
  costura/Primary files aprovados. `git diff --check` verde, produção
  restaurada após cada mutação e nenhum artefato de build no diff.
- CLEAN-31 continua sendo a limitação já registrada de Foco no histórico
  físico; esta correção não altera undo/redo. Revisão independente, outros
  navegadores/mobile e perfil prolongado de desempenho ficam fora deste passe.

Etapa 2 encerrada em `to-review`; branch preservada para o stage 3, sem merge.

#### Resolution (2026-10-04)

Verdict: Approve

- **Standards:** 0 violações documentadas e 0 smells acionáveis. Revisão
  independente do eixo de padrões, diff completo da retomada
  `95c7332...ebf2f64` e separação de commits examinados: `94818aa` e `6446948`
  contêm testes e memória do ticket; `ebf2f64` contém a correção de produção e
  memória do ticket, sem alterar testes. A mudança respeita os Primary files.
- **Spec:** 0 achados. Revisão independente do eixo de especificação confirma
  a correção do único ❌ da última revisão: um chip durante boot preserva a
  leitura inicial da corda e N/T, sem criar reconstrução redundante; edições
  físicas continuam pendentes até o primeiro passo, inclusive `contacts.e`.
  Comparar as referências dos campos imutáveis e ignorar somente `focus`
  atende ao recorte aprovado, sem depender de lacunas do classificador live.
- **Decisão do proxy examinada:** a linha `Proxy decided` que preserva o
  bloqueio estrutural de PHY-39/ADR-0004 continua incorporada ao critério 9 e
  coberta pela comparação dos mesmos sete campos antes/depois do chip na
  ponta, seguida da habilitação no registro zero. Nenhuma decisão nova.

Os critérios 1–15 já aprovados na revisão anterior foram conferidos contra a
retomada e a suíte completa atual; registro final de aceitação:

| Critério | Veredito | Evidência |
| --- | --- | --- |
| 1 | ✅ | Canonização de show, hidden e ausência de focus. |
| 2 | ✅ | Grupos/tipos/chaves inválidos rejeitados com erro de focus. |
| 3 | ✅ | Bytes v6 preservados e focus após constraints no round-trip. |
| 4 | ✅ | Padrão de blankScene, criação/carga e bytes canônicos. |
| 5 | ✅ | Diferença só em focus roteada live sem ops. |
| 6 | ✅ | Primeira fileira, quatro chips acessíveis e padrões demo/blank. |
| 7 | ✅ | Leituras e detalhes cinemáticos respondem ao chip. |
| 8 | ✅ | Energia/momento independentes no corpo e sistema. |
| 9 | ✅ | Camadas/leitura de forças e campos/bloqueios no instante aprovado. |
| 10 | ✅ | v₀ filtrado nos escopos; campos vx/vy preservados. |
| 11 | ✅ | Edição de visualização preserva histórico/playback e cursor passado; boot corrigido. |
| 12 | ✅ | Preset conserva identidade/índice e reabertura restaura seu padrão. |
| 13 | ✅ | Autosave da cena do usuário preserva focus. |
| 14 | ✅ | Escopo global marcado ao montar. |
| 15 | ✅ | Traduções pt-BR/en e paridade. |

##### Prova independente red-green e gate

Repetidas duas mutações temporárias na comparação de boot em `src/App.tsx`,
com restauração byte a byte em `finally` depois de cada execução:

| Mutação | Teste e vermelho independente |
| --- | --- |
| Restaurar `pendingRebuildRef.current = docRef.current !== bootDoc` | `PHY-78 preserves initial rope readouts`, caso `during boot`: `App.test.ts:1101`, esperado `T: 0,00 N`, recebido `leitura — cordapassos: 0velocidade: 1,00×sem leitura`; **1 failed / 2 passed / 200 skipped**, exit 1. |
| Marcar pendência somente para `routeDocChange` structural ou com ops | `PHY-78 preserves restitution edits during boot`: `App.test.ts:1154`, esperado `sem leitura`, recebido `leitura — cordapassos: 0velocidade: 1,00×T: 0,00 N`; **1 failed / 202 skipped**, exit 1. |

Produção restaurada: `npm test -- src/App.test.ts -t 'PHY-78.*boot|PHY-78 preserves initial rope readouts'`
→ **6 passed / 197 skipped**, exit 0. Os skips são casos fora dos filtros.
`git diff --exit-code -- src/App.tsx src/App.test.ts` confirmou a restauração.
A evidência de mutação por cada um dos seis casos novos está registrada no
handoff acima; testes precedem a produção nos commits `94818aa`/`6446948`.

Gate oficial independente, completo fora do sandbox:
`npm test && npm run lint && npm run typecheck && npm run build`
→ **33 arquivos / 1232 testes passed, zero skips**, lint, typecheck e build
**exit 0**. A primeira execução no sandbox teve **1204 passed / 28 failed**,
todos por conexão/desconexão do Chromium DevTools; a repetição integral fora
dele passou sem alterar o harness ou omitir testes. Vite: 52 módulos; aviso
preexistente do chunk do simulador acima de 500 kB (2136,71 kB).

**Chamadores, falhas e interações da retomada examinados:** ensureSim em
mount/play/step/retry e boot compartilhado; conclusão/falha de boot;
toggleFocusGroup/editDoc e patches imutáveis de corpo, força, contatos,
constantes, vínculos e polias; efeito de doc/bootState, builtDocRef e
pendingRebuildRef; polling de vínculos/energia; syncWorld/runSteps;
reset/troca de cena e sonda inicial. Fronteiras: sem chip, chip durante/depois
do boot, edição de posição pendente nos dois instantes e restituição com
chips antes/depois do boot. Os demais caminhos e fronteiras estão registrados
na revisão anterior. Não examinados outros navegadores/mobile ou perfil
prolongado de desempenho.

**Limitação preservada:** CLEAN-31 registra que undo/redo de edição física
pode restaurar um Foco anterior; permanece em triagem fora destes critérios.

Rebase sobre `sweatshop/2026-10-04-1243` confirmou a base atual `b3aca92`, sem
reexecutar commits. Merge local sem squash `5252fcf`; a árvore mergeada é
idêntica à implementação validada `ebf2f64` (`git diff --exit-code ebf2f64 HEAD`
verde). Diff final sem artefatos gerados ou mudanças de produção da revisão;
`git diff --check` verde. `Stage: done` e a linha PHY-78 no ledger são gravados
no mesmo commit de encerramento da sessão.

- 2026-10-04 Foreman: os blocos "Stage 2 — red/green e mutate-verify", a primeira "Stage 3 review" (`Verdict: Reopen`, 906b9ae) e "Stage 2 — decisão de contrato pendente" foram restaurados de `8b85173^`. O foreman os apagou por engano em `8b85173` ao copiar o ticket da sessão para a branch, e por isso o driver contou um reopen só e não estacionou o ticket no segundo.
- 2026-10-04 Reopen diagnosis (foreman, depois do merge): r1 = lacuna de contrato (S1): o critério 9 pedia contatos habilitados depois de um passo, contra o bloqueio do PHY-39; resolvida pelo proxy, só o teste mudou. r2 = defeito novo de implementação na integração com o PHY-82 (S2-implícito): `toggleFocusGroup` troca a identidade de `docRef`, `ensureSim` marca `pendingRebuildRef` no fim do boot e o polling descarta a leitura inicial de T; corrigido no stage 2 (94818aa, 6446948). O revisor da r2 chamou de omissão da r1, mas antes do PHY-82 não havia leitura de T em t = 0 para perder; review miss fica `unknown`. Sem churn de revisão. Próxima ação: nenhuma, mergeado em `5252fcf`.
