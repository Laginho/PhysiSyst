# PHY-38: Aceleração lida antes do primeiro passo ignora corda e mola
Stage: implementing
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/playback/accelerationTracker.ts` (a estimativa analítica e a marca `≈`)
  - `src/playback/accelerationTracker.test.ts`

#### What to build

Antes da primeira amostra do simulador, o painel de leitura mostra a aceleração analítica de `getAcceleration`. Essa estimativa não conhece cordas nem molas, e só leva `≈` quando o corpo participa de um Contact. Um corpo preso numa mola ou corda mostra então um valor errado, sem `≈`.

Reproduzido no passe manual do PHY-33 (Chromium, 1280 px): preset "Massa-mola horizontal" com `Δx = −0,05`, `bloco` selecionado. No passo 0 o painel lê `módulo da aceleração: 9.81 m/s²`, sem `≈`. No passo 1 lê `2.00 m/s²`, que é `k·|Δx|/m = 40 · 0,05 / 1`.

Antes do primeiro passo, a leitura de um corpo preso a um vínculo não afirma um valor que o vínculo contradiz: ou inclui a força do vínculo, ou leva `≈`.

#### Acceptance criteria

1. No passo 0, um corpo preso numa mola ou numa corda não mostra a aceleração de queda livre como exata: o valor inclui o vínculo, ou a leitura leva `≈`
2. Corpos sem vínculo e sem contato leem como hoje
3. Teste de regressão mutate-verified conforme o `AGENTS.md`
4. Gate verde

#### Verification

    npx vitest run src/playback/accelerationTracker.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/playback/accelerationTracker.test.ts`: cena com um bloco preso numa mola esticada, sem amostra medida. Confere que a leitura não é `g` exato. Vermelho porque a estimativa devolve `g` com `approximate: false`.

## Comments

- 2026-09-25 Aberto pelo passe manual do PHY-33, item 5. O corpo desse caso também está apoiado no chão sem Contact declarado, e a estimativa também ignora esse apoio. Isso vem de antes da v4 (limitação de leitura da v2) e o triage decide se entra aqui.
