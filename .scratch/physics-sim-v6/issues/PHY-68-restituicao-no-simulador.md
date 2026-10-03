# PHY-68: Restituição no simulador por fatores por corpo
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-67
Review: human
Difficulty: hard

- Primary files:
  - src/sim/simulator.ts (`assignPairFrictions` ~:683-782 como modelo; `colliderDescFor` ~:784-804 com `setRestitution(0)` :800; aros de polia ~:909-916; `build` ~:844-988 onde os avisos são coletados)
  - src/sim/acceptance.test.ts (teste de esferas frontais ~:325-396 como modelo; fica intacto)
  - src/sim/contacts.test.ts (testes de `assignPairFrictions` como modelo)
  - docs/adr/0005-restitution-on-contact-pairs.md (novo)
  - docs/adr/0003-friction-on-contact-pairs.md (referenciado, não editado)

#### What to build

O Rapier só tem restituição por colisor mais uma regra de combinação. O `e` do par (PHY-67) vira um fator `r` por corpo com a regra **Multiply**: `e_par = r_a · r_b`. Corpo sem nenhum par com `e` declarado tem `r = 0`, então toda colisão não declarada continua inelástica como hoje.

Solve (função pura `assignPairRestitutions(scene)` ao lado de `assignPairFrictions`, mesma forma de retorno `{ factor, useMinFallback, warnings }`): arestas = pares declarados com `e > 0`; sistema linear em espaço log, `log r_a + log r_b = log e`, resolvido componente a componente como o atrito (potenciais com uma incógnita livre por componente bipartida; componente com ciclo ímpar tem solução única). Corpos fora de toda aresta ficam com `r = 0`. Um par declarado com `e = 0` cujos dois corpos têm `r > 0` pelo solve é conflito. Qualquer conflito ou inconsistência → fallback: `r` de cada corpo = máximo de `e` entre seus pares (0 sem pares), regra **Min** em todos os colisores, e um aviso em inglês cru no molde do de atrito: `'contact e-graph has inconsistent constraints; restitution degraded to per-body max with Min rule'`.

`colliderDescFor` troca `setRestitution(0)` por `setRestitution(r)` e `setRestitutionCombineRule(useMinFallback ? Min : Multiply)`. Aros de polia continuam com `0` e Min: Rapier aplica a regra de maior valor no enum (Multiply 2 > Min 1), e `0 · x = 0`.

ADR-0005, curto, no formato dos anteriores: contexto (Rapier sem restituição por par, JS sem modificação de contato), decisão (fatores por corpo, Multiply, `r = 0` por padrão, fallback Min + aviso), consequências (exato quando solúvel; pares não declarados entre corpos com `e` em outros pares herdam `r_a · r_b`, desvio residual aceito como no ADR-0003).

#### Acceptance criteria

1. `assignPairRestitutions` para dois corpos com par `e = 0.5` e um terceiro sem par devolve `r` tal que `r_a · r_b = 0.5` (±1e-9) e `r_c = 0`, `useMinFallback = false`, sem avisos.
2. Para A–B `e = 0.5` e A–C `e = 1`, devolve fatores com `r_a·r_b = 0.5` e `r_a·r_c = 1` (±1e-9).
3. Para A–B `e = 1`, B–C `e = 1`, A–C `e = 0` (conflito), devolve `useMinFallback = true`, `r = {1, 1, 1}` e exatamente um aviso.
4. Cena sem nenhum `e` declarado devolve `r = 0` em todos os corpos, sem fallback nem avisos.
5. Simulação, g = 0, duas esferas iguais (m = 1, r = 0.5) frontais com v = +3 e 0: com `e = 1` as velocidades finais são 0 e 3 (±3%); com `e = 0.5`, 0.75 e 2.25 (±3%); com `e = 0`, ambas 1.5 (±3%). Momento conservado em todos (±3%).
6. Esfera (m = 1) caindo de 2 m sobre o chão com um par esfera–esfera `e = 1` declarado com outra esfera distante, mas sem par com o chão: a velocidade vertical depois do impacto com o chão é ≤ 5% da velocidade de chegada (continua inelástico).
7. O teste de esferas frontais existente em `acceptance.test.ts` passa sem alteração.
8. `docs/adr/0005-restitution-on-contact-pairs.md` existe e referencia a 0003.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/contacts.test.ts`: critérios 1 a 4 chamando `assignPairRestitutions` direto; vermelhos hoje porque a função não existe.
- `src/sim/acceptance.test.ts`: critérios 5 e 6 com cenas inline no molde do teste de esferas frontais (velocidade por força de lançamento ou `vx` direto); vermelhos hoje porque todo colisor tem restituição 0. Chamam o simulador direto; não é costura de DOM.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy). Bruno decidiu: fatores por corpo com Multiply, `r = 0` sem par declarado, exato quando solúvel, fallback + aviso.
- Proxy decided: solve em espaço log; fallback = máx por corpo com regra Min (mantém pares não declarados em 0 e acerta o preset de colisão mesmo sem o solve); ADR-0005 referenciando a 0003; aviso em inglês cru como os existentes.
- Planner: Rapier 0.20 não tem limiar de velocidade para restituição; bola com `e = 1` quica para sempre. Aceito, vai para o FINAL_REPORT no PHY-74.
