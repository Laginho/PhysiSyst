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

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: `focus` opcional na `Scene`, ausente = tudo ligado, cena em branco com forças + energia + momento; fileira "mostrar: forças · cinemática · energia · momento" no topo do painel direito; forças = setas de força + leituras de força, cinemática = setas v/a + leituras cinemáticas, energia e momento só painel; setas independentes; "mostrar todos os vetores" vira escopo e nasce ligado; grupos valem para leitura do corpo e sistema, edição nunca filtrada; chips fora do undo e sem reset, salvos em cenas do usuário e só da sessão em presets; chips não filtram tipos do gráfico.
- Planner: forma `{ show, hidden? }` com `show` canonizado; leitura de vínculo pertence a forças; "sistema" some com energia e momento desligados; a seta de F aplicada sai com forças (a âncora continua editável pelo painel); Foco lido do `docRef`, nunca do registro; caminho dos chips fora de `editDoc`; `routeDocChange` já trata `focus` como `live` sem ops.

- 2026-10-04 Attempt 1 stopped to ask: PHY-78 ficou `blocked`, registrado no commit `58c5ac4`. O critério 9 exige contatos habilitados após um passo, contrariando o bloqueio existente e o spec. /  / 39 testes focados passaram; 389 ficaram fora do filtro. Apenas o ticket mudou. /  / Aprova preservar contatos bloqueados após um passo e habilitados no registro zero, ajustando o critério e seu teste? O [ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “a session without a proxy asks by stopping”. /  / A revisão automática rejeitou a consulta ao Claude por envolver envio de código privado a um destino externo não verificado. Sua decisão direta resolve essa pendência.
- 2026-10-04 Proxy decided: manter o bloqueio estrutural (PHY-39, ADR-0004) e reescrever o critério 9: o Foco não pode esconder nem mudar a habilitação de campo nenhum, verificado no mesmo instante; contatos desabilitados após um passo é o PHY-39, não o PHY-78 — a regra do spec ("campos de edição nunca são filtrados") é sobre o Foco, não sobre os outros bloqueios, e o critério como escrito pedia que este ticket desfizesse o PHY-39, o que ninguém decidiu. Nenhuma mudança de produção; só o teste do critério 9 (commit test-only) e o texto do critério. O que o teste deve asserir: (a) após `p.steps(1)`, selecionar o corpo e capturar `disabled` de cada input de forças e de `contacts.muS/muK/e` com forças ligadas; (b) `toggleFocus('forces')` e asserir que os mesmos inputs seguem no DOM com `disabled` igual ao capturado — forças `false`, contatos `true` — sem `seek(0)` antes; (c) só então `p.seek(0)` e asserir todos `false`, ainda com forças desligadas; (d) religar forças e asserir `P`. Mutate-verify: a mutação "fieldset de contatos recebe `disabled={disabled || !showForces}`" (ou `hidden` nos campos com forças desligadas) deve ficar vermelha em (b); registrar a saída no ticket. Retomar da branch `phy/PHY-78-modelo-de-foco-e-chips` (fb7bb72): os outros critérios passaram com 22 mutações; `src/App.tsx` não muda.
- 2026-10-04 Foreman: retomar da branch `phy/PHY-78-modelo-de-foco-e-chips` (código revisado em `fb7bb72`; a sessão ainda não foi mergeada nela e `src/App.tsx` conflita com o PHY-82, já na sessão: integrar a sessão faz parte da retomada); falta só o commit test-only do critério 9 com a mutação registrada.

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
