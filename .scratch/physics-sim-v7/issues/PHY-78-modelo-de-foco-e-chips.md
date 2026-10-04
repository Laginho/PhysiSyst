# PHY-78: Modelo de Foco e chips
Stage: blocked
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
9. Forças desligadas: depois de um passo com o simulador falso numa cena com um corpo sobre o chão e uma mola, `paint` não escreve os rótulos `P`, `N` nem `F_el` (nenhum `fillText` com esses textos), a leitura da mola selecionada não mostra `t('readout.springForce')`, e os `NumField` do `ForcesPanel` e do painel de contatos continuam no DOM e habilitados. Ligar forças de volta traz `P`.
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

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: `focus` opcional na `Scene`, ausente = tudo ligado, cena em branco com forças + energia + momento; fileira "mostrar: forças · cinemática · energia · momento" no topo do painel direito; forças = setas de força + leituras de força, cinemática = setas v/a + leituras cinemáticas, energia e momento só painel; setas independentes; "mostrar todos os vetores" vira escopo e nasce ligado; grupos valem para leitura do corpo e sistema, edição nunca filtrada; chips fora do undo e sem reset, salvos em cenas do usuário e só da sessão em presets; chips não filtram tipos do gráfico.
- Planner: forma `{ show, hidden? }` com `show` canonizado; leitura de vínculo pertence a forças; "sistema" some com energia e momento desligados; a seta de F aplicada sai com forças (a âncora continua editável pelo painel); Foco lido do `docRef`, nunca do registro; caminho dos chips fora de `editDoc`; `routeDocChange` já trata `focus` como `live` sem ops.

- 2026-10-04 Attempt 1 stopped to ask: PHY-78 ficou `blocked`, registrado no commit `58c5ac4`. O critério 9 exige contatos habilitados após um passo, contrariando o bloqueio existente e o spec. /  / 39 testes focados passaram; 389 ficaram fora do filtro. Apenas o ticket mudou. /  / Aprova preservar contatos bloqueados após um passo e habilitados no registro zero, ajustando o critério e seu teste? O [ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “a session without a proxy asks by stopping”. /  / A revisão automática rejeitou a consulta ao Claude por envolver envio de código privado a um destino externo não verificado. Sua decisão direta resolve essa pendência.
