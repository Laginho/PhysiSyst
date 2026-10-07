# PHY-79: Foco das cenas prontas
Stage: done
Status: ready-for-agent
Blocked by: PHY-78
Review: agent
Difficulty: normal

- Primary files:
  - src/presets/index.ts (todas as funções de cena :52-297 e `PRESETS` :302-317)
  - src/presets/presets.test.ts
  - src/App.test.ts (um teste de ponta a ponta abrindo um preset pela galeria)

#### What to build

Cada preset declara o seu Foco (PHY-78) no `buildScene()`, para a cena abrir mostrando o que o tópico ensina:

| Presets | `focus.show` | `focus.hidden` |
|---|---|---|
| `wedge-flagship`, `atwood`, `table-hanging`, `movable-pulley` (princípios), `incline-block` (atrito), `loop-pendulum` (pêndulo volta completa) | `['forces']` | — |
| `free-fall`, `projectile` | `['kinematics', 'energy']` | — |
| `collision-elastic`, `collision-inelastic` | `['kinematics', 'momentum']` | — |
| `spring-horizontal`, `spring-damped` | `['energy']` | `{ energy: ['E_pg'] }` |
| `spring-vertical`, `simple-pendulum` | `['forces', 'energy']` | — |

Nada mais muda nas cenas: corpos, forças, contatos, polias, vínculos e constantes ficam byte a byte como hoje; `focus` é a única chave nova em cada literal, na posição canônica (depois de `constraints`/`pulleys`, ou de `contacts` quando não há nenhum).

Nas colisões, momento ligado faz o painel mostrar |p| do corpo e do sistema, como o Bruno pediu. O `hidden` das molas horizontais só é honrado pelo gráfico a partir do PHY-81; até lá o dado é inerte e o critério aqui é sobre o dado.

Com o Foco explícito, a regra do PHY-78 para presets passa a ser observável: um chip alterado num preset vale só na sessão e reabrir o preset volta ao Foco da tabela.

#### Acceptance criteria

1. Para cada id da tabela, `presetById(id)!.buildScene().focus` é exatamente o objeto da linha (`show` na ordem de `FOCUS_GROUPS`; `hidden` só nas duas molas horizontais, igual a `{ energy: ['E_pg'] }`); os 14 presets de `PRESETS` estão na tabela.
2. Para cada preset, `buildScene()` sem a chave `focus` é igual (`toStrictEqual`) ao `buildScene()` do commit base — isto é, a diferença entre o literal novo e o antigo é só `focus`. (O teste fixa o snapshot `JSON.stringify` de cada cena sem `focus` e compara.)
3. Os 14 presets continuam a passar o teste existente "parse, round-trip and simulate 2 s without an unexpected warning": `serialize(parse(serialize(scene)))` igual a `serialize(scene)` com `focus` incluso, `collectWarnings` vazio.
4. No `App`, abrir `collision-elastic` pela galeria mostra os chips com `aria-pressed` `false, true, false, true` (forças, cinemática, energia, momento) e o fieldset `t('readout.system')` contém `t('readout.momentum')` e não contém `t('readout.mechanical')`.
5. No `App`, abrir `free-fall`, ligar forças, trocar para `cena-1` e reabrir `free-fall` → chips `false, true, true, false`.

#### Verification

    npm test -- src/presets/presets.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/presets/presets.test.ts`: critérios 1 a 3 chamando `buildScene`, `parse`, `serialize` e `collectWarnings` direto; 1 vermelho hoje (`focus` ausente), 2 e 3 passam e pinam que nada além de `focus` mudou.
- `src/App.test.ts`: critérios 4 e 5 com o simulador falso e a galeria; vermelhos hoje (todos os chips `true`). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu a tabela: princípios, atrito e pêndulo volta completa → forças; queda livre e projétil → cinemática + energia; colisões → cinemática + momento com |p| no painel; mola horizontal e amortecida → energia com E_pg escondida no gráfico; mola vertical e pêndulo simples → forças + energia.
- Planner: `hidden` das molas horizontais é dado inerte até o PHY-81; o critério testa o dado, não o desenho.

- 2026-10-04 Stage 2: base da sessão `sweatshop/2026-10-04-1243`, commit `ae93388`; PHY-78 está `done`. Costuras confirmadas pelo ticket: `presetById/buildScene`, codec e avisos; App pela galeria com simulador falso. Chamadores examinados: montagem/reload e `openGalleryPreset` no App; `createPresetScene` para cópias persistidas; galeria e testes de física. O novo dado não altera corpos, contatos, forças ou vínculos; as cenas sem `focus` ficam fixadas por 14 snapshots literais capturados do commit base. Casos distintos cobertos: presets com/sem vínculos, variantes compartilhadas de colisão, mola e pêndulo, e `hidden` exclusivo das molas horizontais.
- 2026-10-04 Red antes da produção: `npm test -- src/presets/presets.test.ts src/App.test.ts -t PHY-79` → **16 failed, 15 passed, 241 skipped** (272 total). Os 14 testes de Foco receberam `undefined`; colisão recebeu chips `true,true,true,true` em vez de `false,true,false,true`; queda livre recebeu forças `false` depois do clique em vez de `true`. Os 14 snapshots sem Foco e a cobertura exata da tabela passaram. O teste anterior de reabertura foi atualizado para o padrão explícito deste ticket.
- 2026-10-04 Correção de harness em commit só de testes: o fieldset de sistema inicia com `sem leitura` e a leitura é atualizada pelo intervalo de 100 ms. O teste novo da colisão agora usa relógio falso e avança 100 ms após abrir o card. Nenhuma mudança no contrato ou no App. Reexecutado com `src/presets/index.ts` temporariamente restaurado a `ae93388`: **16 failed, 15 passed, 241 skipped**, pelos mesmos motivos corretos; produção restaurada em `finally`. Com os novos Focos: **31 passed, 241 skipped**.

#### Mutate-verify (2026-10-04)

Todas as mutações foram temporárias, com restauração em `finally` antes do gate.

| Teste | Mutação de produção | Saída vermelha observada |
|---|---|---|
| Os 14 `declares the focus of its topic` | Restaurar `src/presets/index.ts` ao commit base, removendo todos os novos `focus` | 14 falhas: `expected undefined to strictly equal { show: ... }`; junto aos dois testes DOM, `16 failed, 15 passed, 241 skipped`. |
| Os 14 `preserves its complete scene apart from focus` | Somar 1 a `constants.g` de cada builder, preservando `focus` | `14 failed, 54 skipped`; `expected { version: 1, … } to strictly equal { version: 1, … }` (g 10.81 em vez de 9.81). |
| `covers exactly the 14 presets in the gallery` | Remover `spring-damped` de `PRESETS` | `1 failed, 67 skipped`; `expected [ …(13) ] to have a length of 14 but got 13`. |
| App: `PHY-79 opens elastic collisions from the gallery with kinematics and momentum readouts` | Em `src/App.tsx`, trocar a condição das linhas de momento do sistema de `showMomentum` para `false`, mantendo os chips corretos | `1 failed, 203 skipped`; `expected 'sistema' to contain '|p|'`, App.test.ts:329. |
| App: `PHY-79 keeps preset focus in memory without creating a scene and restores its topic focus on reopening` | Contar chamadas de `freeFall()` e devolver forças ligadas somente na segunda construção, simulando vazamento do Foco da sessão ao reabrir | `1 failed, 203 skipped`; `expected [ 'true', 'true', 'true', 'false' ] to deeply equal [ 'false', 'true', 'true', 'false' ]`, App.test.ts:309. |

#### Stage 2 handoff (2026-10-04)

- Branch: `phy/PHY-79-foco-das-cenas-prontas`, base `ae93388` na sessão `sweatshop/2026-10-04-1243`.
- Commits só de testes: `d4be120` (vermelho antes de produção) e `4bfb212` (correção do relógio do harness, vermelho revalidado). Este commit de produção não toca testes.
- Produção: 11 novas linhas de `focus` nos builders, cobrindo os 14 presets; ordem canônica de grupos e chave no fim de cada literal. Pêndulos compartilham o builder: sem velocidade inicial → forças + energia; volta completa → forças. Nenhum dado físico mudou, conforme os 14 snapshots `toStrictEqual` e `JSON.stringify` do base.
- Critérios 1–5 cobertos por tabela exata, snapshots, round-trip com Foco e simulação existente de 2 s, abertura de colisão com momento sem energia, e reabertura de queda livre restaurando seu padrão sem criar uma cena.
- Gate executado em primeiro plano, fora do sandbox após falhas de conexão DevTools no sandbox: `npm test && npm run lint && npm run typecheck && npm run build` → **33 test files passed, 1262 tests passed**, lint e typecheck sem erros, build verde (52 módulos). Aviso existente de chunk acima de 500 kB, sem falha do build. Nenhuma validação pendente.
- Diff final verificado com `git diff --check`: somente os três Primary files e este ticket; sem mutações residuais ou artefatos temporários. `CONTEXT.md` e o spec já descrevem o comportamento; `hidden.energy = ['E_pg']` continua inerte no gráfico até PHY-81, conforme o contrato.

#### Resolution (2026-10-04)
Verdict: Approve

##### Standards

0 violações documentadas; 1 julgamento não bloqueante de possível duplicação
em `src/App.test.ts:307,322`: as duas asserções repetem a leitura dos quatro
chips abaixo. Um helper seria opcional; a revisão mantém os testes como estão.

```ts
['forces', 'kinematics', 'energy', 'momentum'].map(group =>
  focusChip(host, group as FocusGroup).getAttribute('aria-pressed'),
)
```

Diff completo `ae93388...be51d11` e os três commits examinados em revisão
independente. `d4be120` e `4bfb212` contêm somente testes e memória do ticket;
`be51d11` contém produção e memória, sem tocar testes. Os 11 acréscimos de
produção ficam nos builders existentes, com preferências novas por construção.
Os snapshots independentes seguem o contrato; não compartilham fixtures com
a produção. Nenhuma correção de código ou novo teste nesta etapa.

##### Spec

0 achados em revisão independente: sem requisito ausente, parcial ou incorreto,
e sem comportamento acrescentado fora do escopo. Registro de aceitação:

| Critério | Veredito | Evidência |
| --- | --- | --- |
| 1 | ✅ | Os 14 objetos da tabela são exatos e canônicos; `hidden` aparece somente nas duas molas horizontais. Builders compartilhados de colisão, mola e pêndulo conferidos. |
| 2 | ✅ | Diff de produção acrescenta apenas `focus`; 14 snapshots do base com `toStrictEqual` e `JSON.stringify` preservam todos os dados físicos e sua ordem. |
| 3 | ✅ | Round-trip com Foco, avisos vazios e teste existente dos 14 presets por 120 passos (2 s) passaram. |
| 4 | ✅ | Colisão elástica aberta pela galeria: chips `false,true,false,true`, `|p|` no sistema e ausência de energia mecânica após o polling. |
| 5 | ✅ | Forças ligadas em queda livre, troca para `cena-1` e reabertura restauram `false,true,true,false`, sem persistir nem materializar o preset. |

**Chamadores, falhas e interações examinados:** montagem/reload com preset
salvo e fallback de ID inválido; `openGalleryPreset`, troca de cena e
`toggleFocusGroup`; exclusão de presets do autosave; cópia por
`createPresetScene`, erros de payload/índice e rollback; codec, canonização e
avisos; atualização periódica de leituras do corpo/sistema e rebuild;
presets com/sem contatos, polias e vínculos, incluindo variantes dos builders
compartilhados. Preferências de visualização continuam separadas da física;
`hidden.energy` permanece inerte no gráfico até PHY-81, conforme o contrato.
Não há decisão de proxy neste ticket. Não examinados outros navegadores/mobile,
inspeção visual manual ou desempenho prolongado.

##### Prova independente red-green e gate

Repetidas todas as mutações registradas no handoff, uma por vez, com
restauração byte a byte em `finally` depois de cada execução:

| Mutação repetida | Vermelho independente observado |
| --- | --- |
| Restaurar `src/presets/index.ts` a `ae93388`, sem Foco | **16 failed / 15 passed / 241 skipped**, exit 1: 14 objetos receberam `undefined`; colisão recebeu quatro chips `true` (`App.test.ts:326`); forças de queda livre ficaram `false` após o clique (`App.test.ts:302`). |
| Somar 1 a `constants.g` de todos os builders, mantendo Foco | **14 failed / 54 skipped**, exit 1: cada snapshot recebeu `g: 10.81` em vez de `9.81` (`presets.test.ts:67`). |
| Remover `spring-damped` de `PRESETS` | **1 failed / 67 skipped**, exit 1: `expected [...] to have a length of 14 but got 13` (`presets.test.ts:32`). |
| Trocar somente a condição do momento do sistema por `false` no App | **1 failed / 203 skipped**, exit 1: `expected 'sistema' to contain '|p|'` (`App.test.ts:329`); chips corretos. |
| Ligar forças somente na segunda construção de `freeFall()` | **1 failed / 203 skipped**, exit 1: recebido `true,true,true,false`, esperado `false,true,true,false` na reabertura (`App.test.ts:309`). |

Produção restaurada: `npm test -- src/presets/presets.test.ts src/App.test.ts`
→ **2 arquivos / 272 testes passed, zero skips**, exit 0.
`git diff --exit-code` confirmou os quatro arquivos de código/testes idênticos
a `be51d11`; não houve mutação residual nem alteração do harness.

Gate oficial independente, completo fora do sandbox:
`npm test && npm run lint && npm run typecheck && npm run build`
→ **33 arquivos / 1262 testes passed, zero skips**, lint, typecheck e build
**exit 0**. A primeira execução no sandbox teve **1234 passed / 28 failed**,
todos por conexão/desconexão do Chromium DevTools; a repetição integral fora
dele passou sem omitir testes. Vite: 52 módulos; aviso preexistente do chunk
do simulador acima de 500 kB (2136,71 kB).

Rebase sobre `sweatshop/2026-10-04-1243` confirmou a base atual `ae93388`, sem
alterar commits. Merge local sem squash `926a46b`; a árvore mergeada é idêntica
à implementação validada `be51d11` (`git diff --exit-code be51d11 HEAD` verde).
`Stage: done`, esta resolução e a linha PHY-79 no ledger são gravados juntos
no commit de encerramento da sessão.
