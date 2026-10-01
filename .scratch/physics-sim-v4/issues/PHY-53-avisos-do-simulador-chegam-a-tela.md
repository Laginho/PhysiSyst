# PHY-53: Os avisos do simulador chegam à tela
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-51
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (o cálculo de `warnings` em ~1434 e o que o faz mudar durante a corrida)
  - src/App.test.ts

#### What to build

O painel de avisos (`warnings.title`) mostra os avisos do simulador além dos da cena. Hoje ele mostra só `collectWarnings(doc)`, e o `Simulator.warnings` não aparece em lugar nenhum. Isso inclui o aviso de atrito degradado do grafo de contatos, que já existe e ninguém vê, e o do teto de ω do PHY-51, que aparece no meio da corrida.

Um aviso do simulador aparece no painel a partir do primeiro repaint depois de surgir, e some quando a cena é reconstruída sem ele. Os avisos da cena continuam como estão e vêm primeiro.

#### Acceptance criteria

1. Com um simulador cujo `warnings` tem uma linha desde a construção, o painel de avisos mostra essa linha depois do boot.
2. Com um simulador cujo `warnings` ganha uma linha num `step()` durante o play, o painel passa a mostrar essa linha sem nenhuma outra interação.
3. Uma cena com aviso próprio (por exemplo massa ≤ 0) mais um aviso do simulador mostra os dois, o da cena primeiro.
4. Com `warnings` vazio no simulador e cena sem avisos, o painel não aparece, como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, com o `makeFakeSimulator` existente (`warnings` já é um campo dele): critérios 1 a 3, vermelhos hoje porque o App nunca lê `Simulator.warnings`. O 4 passa hoje e vai junto. É uma costura de DOM: o ticket registra, por teste novo, a mutação aplicada no `App.tsx` e a saída vermelha que ela deu (AGENTS.md, Mutate-verify).

## Comments

- 2026-10-01 Aberto na triagem do PHY-51. O proxy viu que `Simulator.warnings` não chega à UI (`src/App.tsx` ~1434 só lê `collectWarnings(doc)`) e separou isso do PHY-51 por ser outra costura.
