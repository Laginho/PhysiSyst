# PHY-82: Vetores N e T no instante inicial
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: hard

- Primary files:
  - src/sim/simulator.ts (`Simulator` :62-81 ganha `probeInitial`; `RapierSimulator` :901 ganha `dispose`; `buildWorld` :931, `readContacts` :1515, `readConstraints`, `replaceScene` :1612 consumidos)
  - src/sim/index.ts (tipo `InitialProbe` reexportado)
  - src/sim/contacts.test.ts (`describe('readContacts')` :56 como modelo)
  - src/App.tsx (`captureFrame`/`showFrame`/`resetRecording` :737-755; `paint` :186-292, `ropeReadingsOf` :182; `syncWorld` :1056-1077; `dispatch` com `rebuild` :1120-1141; doc effect :1159-1184; `ensureSim` :1246-1259)
  - src/App.test.ts (o simulador falso :31-46 ganha `probeInitial`)

#### What to build

Antes do primeiro passo o canvas não mostra N nem T: `readContacts()` lê as manifolds da fase estreita do Rapier, que começam vazias, e a tração da corda começa em 0 (`RopeState.tension` só existe depois de um solve). P, F aplicada, F_el (de `readConstraints()` após `replaceScene`), v₀ e a aceleração analítica já aparecem em t = 0.

**Sonda.** `Simulator.probeInitial(scene: Scene): InitialProbe`, com `InitialProbe = { contacts: ContactPoint[]; constraints: ConstraintState[] }`. Em `RapierSimulator`, instancia um segundo `RapierSimulator(scene)` (o mesmo `buildWorld` que `replaceScene` usa, com os solves das ADR-0003/0005), dá um `step()`, lê `readContacts()` e `readConstraints()`, e num `finally` libera o mundo descartável (`dispose()` → `world.free()`). O mundo vivo não é tocado: `this.world`, `this.bodies` e companhia ficam intactos, e nenhum passo dele avança. Se `buildWorld` lançar (documento inválido), a sonda devolve `{ contacts: [], constraints: [] }`; o erro real continua sendo reportado pelo caminho de hoje.

**Quando.** O App guarda o resultado em `initialProbeRef` e o recalcula só quando o instante exibido pode ser t = 0 e o documento mudou estruturalmente: no boot (`ensureSim` resolvido), no `reset` e troca de cena (`dispatch` com `rebuild`), e no ramo `structural` do doc effect quando `stepsTaken === 0`. Nunca depois do primeiro passo, nunca por edição ao vivo (g, F), nunca no `syncWorld` que antecede um passo. O resultado vale sempre que o instante exibido é t = 0: a ponta antes do primeiro passo (`statesRef.current === null`) ou o cursor no registro 0 (que mostra o mesmo documento, porque qualquer edição em cursor 0 reinicia).

**Onde.** Em `paint`, quando o instante exibido é t = 0, `normalArrows` recebe `probe.contacts` e `tensionArrows` recebe `probe.constraints` com o `path` de cada `RopeState` descartado (`{ ...state, path: undefined }`), para a seta de T ser posta sobre o caminho do documento, não sobre as poses da sonda, que já andaram 1/60 s. O desenho da corda continua vindo do documento (`ropeReadingsOf` devolve `[]` sem estados, PHY-56) e F_el continua de `constraintsRef`. A partir do primeiro passo tudo vem da gravação como hoje. A leitura de T no painel em t = 0 não muda (fica fora do escopo).

Com o grupo forças do Foco desligado (PHY-78, quando existir) as setas da sonda somem com as demais; este ticket não depende disso.

#### Acceptance criteria

1. (Rapier real) `probeInitial` sobre uma cena com um retângulo dinâmico apoiado no `groundBody()` devolve ao menos um contato entre os dois com normal de módulo 1 e componente y com |ny| > 0,99 (direção exata, como o teste `reports a resting contact…`).
2. (Rapier real) `probeInitial` sobre `presetById('atwood')!.buildScene()` devolve o `RopeState` de `corda` com `tension` dentro de 15 % de 2·m₁·m₂·g/(m₁+m₂) = 23,54 N e `slack: false`.
3. (Rapier real) Antes e depois de `probeInitial`, `readStates()` do simulador vivo é igual (`toEqual`) e `readContacts()` do vivo continua vazio em t = 0; chamar `probeInitial` 20 vezes seguidas não lança e devolve o mesmo resultado (`toEqual`) a cada vez.
4. (Rapier real) `probeInitial` sobre uma cena com `mass: 0` num corpo dinâmico devolve `{ contacts: [], constraints: [] }` sem lançar, e o simulador vivo continua utilizável (`step()` não lança).
5. No `App`, com o simulador falso cujo `probeInitial` devolve um contato `chao ↔ caixa` e um `RopeState` com `tension: 5` para uma corda `pivo → bola` (`via: []`), `paint` em t = 0 escreve `N` e `T` antes de qualquer passo; o `moveTo` da seta de T coincide com `worldToScreen` da âncora da `bola` no documento (não com a pose do estado da sonda, que o teste faz diferente).
6. Depois de um passo, `paint` usa `readContacts()`/`readConstraints()` do falso (que o teste faz devolver outro contato) e não a sonda: o `N` muda de posição e `probeInitial` não é chamado de novo.
7. `probeInitial` é chamado uma vez no boot; uma vez a mais a cada edição estrutural em t = 0 (arrastar um corpo três vezes antes de qualquer passo → três chamadas a mais); zero a mais por edição de g em t = 0; uma a mais por `reset`. `step` do falso tem 0 chamadas durante tudo isso.
8. Depois de 10 passos, `seek(0)` desenha `N` e `T` da sonda (o registro 0 tem `contacts: []`), e `seek(5)` desenha o `N` do registro 5.
9. Um mock de `probeInitial` que lança não derruba o `App`: a cena pinta sem `N`/`T` e `simError` não aparece por causa da sonda.

#### Verification

    npm test -- src/sim/contacts.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/contacts.test.ts`: critérios 1 a 4 chamando `createSimulator` e `probeInitial` direto (Rapier real, como o `describe('readContacts')`); vermelhos hoje (`probeInitial` não existe; o import tipa, a chamada falha).
- `src/App.test.ts`: critérios 5 a 9 com o simulador falso ampliado e o mock de canvas (`fillText`, `moveTo`); vermelhos hoje (nenhum `N`/`T` em t = 0). Costura de DOM: registrar a mutação aplicada e a saída vermelha por teste novo.

## Comments

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: independente de A–F; sonda = simulador descartável do mesmo documento pelo caminho de construção de `replaceScene`, um `TIMESTEP`, ler contatos e trações, liberar, desenhar em t = 0 junto do que já existe; o mundo vivo nunca é tocado; recalcular só em edições estruturais em t = 0.
- Planner: `probeInitial` como método síncrono do `Simulator`, com `dispose` no `RapierSimulator`; o `path` da leitura da sonda é descartado para a seta de T cair no caminho do documento; o resultado vale também com o cursor em 0; a leitura de T do painel em t = 0 fica fora do escopo (spec, "Fora de escopo").

#### Stage 2 — costuras e primeiro vermelho (2026-10-04)

- Costuras aprovadas: API pública do `Simulator` em `contacts.test.ts`; DOM e canvas reais do App com simulador falso em `App.test.ts`.
- Chamadores examinados antes dos testes: `paint` via `repaint` (resize, seleção, idioma, documento, transporte e rAF); `ensureSim` via mount, play, step e retry; `dispatch(reset)` via reinício, edição no registro 0 e transições de cena; `syncWorld` via step/rAF. `readContacts` e `readConstraints` também alimentam gravação, painéis e energia; a sonda não substitui essas leituras.
- Fronteiras a preservar: documento vazio; massa dinâmica inválida com mundo vivo ainda utilizável; boot pendente e erro da sonda; edição ao vivo após rebuild estrutural pendente; cursor 0 e registros posteriores; caminho de corda e F_el do documento/mundo vivo.
- Vermelho da API: `npm test -- src/sim/contacts.test.ts` → **5 failed | 12 passed (17)**, os cinco novos testes com `TypeError: sim.probeInitial is not a function`. Nenhum código de produção alterado.
- Verde da API: **17 passed (17)**. Mutantes confirmados: omitir `probe.step()` derruba normal e Atwood; inserir `this.step()` derruba isolamento/repetição e cena vazia; propagar falha de construção derruba massa inválida. Todos restaurados antes do commit de produção.
- Vermelho do App, antes de alterar `App.tsx`: `npm test -- src/App.test.ts -t 'initial force vectors'` → **8 failed | 169 skipped (177)**. Os testes de desenho falham pela ausência de N em t = 0/cursor 0; os demais falham pela ausência de chamadas à sonda. Incluem boot com edição pendente, troca de cena/edição do registro 0 e preservação de corda/F_el/leitura T. `npm run typecheck` passa com o contrato da API implementado.
