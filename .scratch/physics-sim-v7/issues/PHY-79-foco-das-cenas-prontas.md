# PHY-79: Foco das cenas prontas
Stage: to-implement
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
