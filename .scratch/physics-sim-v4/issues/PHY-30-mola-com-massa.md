# PHY-30: Mola com massa (Realism option)
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-27, PHY-29
Review: agent

- Primary files:
  - `src/scene/codec.ts`, `src/scene/codec.test.ts` (`mass ≥ 0` na mola)
  - `src/sim/simulator.ts`
  - `src/sim/acceptance.test.ts`
  - `src/render/overlay.ts`, `src/render/overlay.test.ts` (`F_el` diferente em cada ponta)
  - `src/App.tsx`, `src/App.test.ts` (campo de massa no inspetor, leitura por ponta)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

Uma mola pode ter massa `mₛ`. Por dentro, o simulador a representa como uma cadeia escondida de N corpos pequenos ligados por N+1 molas, sem colisão; por fora, continua sendo uma mola só, desenhada igual. A força elástica passa a poder diferir entre as pontas, e a leitura, as setas e o painel mostram as duas. `mass` ausente ou 0 mantém a mola ideal do PHY-26 exatamente como é.

Pode ser cortado sem prejuízo do resto do ciclo.

#### Acceptance criteria

1. O codec aceita `mass ≥ 0` na mola e rejeita negativa; ausente = 0
2. Massa-mola horizontal com `mₛ = 0,1·m`: período dentro de 3% de `2π√((m + mₛ/3)/k)`
3. Durante a aceleração, `F_el` lida em cada ponta difere; com `mₛ = 0`, é igual nas duas (critério 5 do PHY-26 continua)
4. Os corpos escondidos não aparecem em `readStates`, não colidem, e `replaceScene` com carry não produz salto (trajetória contínua dentro da tolerância do critério 2)
5. Setas e rótulos `F_el` usam o valor da própria ponta
6. Inspetor da mola ganha o campo de massa; o painel mostra `F_el` por ponta quando `mₛ > 0`
7. Strings novas nos dois catálogos
8. Testes de regressão mutate-verified; testes novos no `App.test.ts` com mutação e saída vermelha registradas
9. Gate verde

#### Verification

    npx vitest run src/scene/codec.test.ts src/sim src/render src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: `mass` da mola (1).
- `src/sim/acceptance.test.ts`: período com massa, `F_el` por ponta, carry sem salto (2–4). Vermelho porque o simulador ignora `mass` da mola.
- `src/render/overlay.test.ts`: seta por ponta com valor próprio (5).
- `src/App.test.ts`: campo de massa e leitura por ponta (6).

## Comments
