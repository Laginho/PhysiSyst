# PHY-85: Leitura de T da corda no instante inicial
Stage: blocked
Status: needs-triage
Blocked by: PHY-82
Review: agent
Difficulty: normal

- Primary files:
  - (a definir na triagem; provavelmente src/App.tsx, leitura da corda selecionada)

#### What to build

Débito deixado pelo PHY-82: a sonda de t = 0 alimenta só as setas. Com a corda selecionada antes do primeiro passo, a leitura de T no painel lateral continua a do mundo vivo, que é 0, enquanto a seta de T no canvas já mostra a tração da sonda. O painel deve mostrar o mesmo valor da seta em t = 0.

Bruno quer resolver, mas não nesta rodada.

#### Acceptance criteria

1. (a escrever na triagem)

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- (a escrever na triagem)

## Comments

- 2026-10-04 Débito registrado a pedido do Bruno ao revisar o board v7. `Stage: blocked` até o PHY-82 entrar e a triagem escrever o contrato: a sessão que receber este id deve reportar e parar.
