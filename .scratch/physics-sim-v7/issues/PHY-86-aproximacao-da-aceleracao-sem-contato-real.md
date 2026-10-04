# PHY-86: "≈" da aceleração só com contato real em t = 0
Stage: blocked
Status: needs-triage
Blocked by: PHY-75, PHY-82
Review: agent
Difficulty: normal

- Primary files:
  - (a definir na triagem; provavelmente src/playback/accelerationTracker.ts (`isHeld`))

#### What to build

Débito deixado pelo PHY-75: ao declarar o par bola↔chão em queda livre e projétil, `isHeld` passa a marcar a aceleração analítica com "≈" antes do primeiro passo, porque olha os pares **declarados** em `scene.contacts`. A bola no ar tem a = g exato, e o "≈" confunde o aluno.

Direção: `isHeld` deve considerar os contatos **reais** em t = 0, que a sonda do PHY-82 já lê, em vez dos pares declarados. Corpo no ar sem corda nem mola fica sem "≈"; corpo apoiado continua com "≈".

Bruno quer resolver, mas não nesta rodada.

#### Acceptance criteria

1. (a escrever na triagem)

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- (a escrever na triagem)

## Comments

- 2026-10-04 Débito registrado a pedido do Bruno ao revisar o board v7 ("o usuário vai olhar e não vai entender por que tem uma aproximação"). `Stage: blocked` até o PHY-75 e o PHY-82 entrarem e a triagem escrever o contrato: a sessão que receber este id deve reportar e parar.
