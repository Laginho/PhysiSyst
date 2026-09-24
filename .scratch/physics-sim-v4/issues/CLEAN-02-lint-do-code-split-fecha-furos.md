# CLEAN-02: Regra de lint do code-split fecha os dois furos
Stage: to-review
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `eslint.config.js` (bloco `no-restricted-imports` do code-split)

#### What to build

O CLEAN-01 pinou por lint o critério 4 do PHY-32: nenhum import de valor do módulo do simulador fora de `src/sim/`. Mesmo assim, dois caminhos devolvem o Rapier ao chunk de entrada com o gate verde (achados do review do PHY-23, conferidos no código em 2026-09-24):

1. `allowTypeImports: true` aceita o import de tipo dentro das chaves, `import { type Simulator } from '../sim'`. Com `verbatimModuleSyntax` (tsconfig), esse import compila para `import {} from '../sim'`, um import de efeito colateral que mantém o barrel do sim, e o Rapier, no grafo de entrada. Só o `import type { … }` de nível superior é apagado.
2. A regra só olha `**/sim`. Um import direto de `@dimforge/rapier2d-compat` fora de `src/sim/` passa no lint.

O review sugeriu `@typescript-eslint/no-import-type-side-effects` para o primeiro furo. Essa escolha é do stage 2, desde que os critérios valham.

#### Acceptance criteria

1. `import { type Simulator } from '../sim'` num arquivo de produção de `src/playback/` falha no `npm run lint`
2. `import RAPIER from '@dimforge/rapier2d-compat'` (e qualquer import desse pacote) num arquivo de produção fora de `src/sim/` falha no `npm run lint`
3. Continuam limpos: `import type { Simulator } from '../sim'`, `import { TIMESTEP } from '../sim/timestep'`, o `import('./sim')` dinâmico de `App.tsx`, qualquer import dentro de `src/sim/` e os arquivos `*.test.ts(x)`
4. O código de produção atual passa no lint sem mudança fora dos Primary files
5. Gate verde

#### Verification

    npm run lint
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: os critérios 1–3 são verificados pela saída do lint sobre um arquivo descartável em `src/playback/` com os imports dos critérios, apagado antes do commit, do mesmo jeito que foi feito no CLEAN-01. A saída vai para `## Comments`, antes (critérios 1–2 limpos, isto é, o furo existe) e depois.

## Comments

- 2026-09-24 Aberto a partir dos achados não verificados que o review do PHY-23 deixou no CLEAN-01 (itens 1 e 2). O item 4 (falta de `preventDefault`) foi descartado: é decisão do proxy, conferida pelo review do CLEAN-01. O item 5 (script live com `ROOT` fixo) também foi descartado: é harness local.

- 2026-09-24 Stage 2, antes (furos abertos). Lint sobre um `src/playback/probe.ts` descartável (apagado antes do commit) com, linha a linha: `import { type Simulator } from '../sim'`, `import RAPIER from '@dimforge/rapier2d-compat'`, `import type { World } from '@dimforge/rapier2d-compat'`, `import type { Simulator as S2 } from '../sim'`, `import { TIMESTEP } from '../sim/timestep'`; junto com `src/App.tsx`, `src/sim/simulator.ts` (importa o Rapier) e `src/playback/integration.test.ts`:

      $ npx eslint src/playback/probe.ts src/App.tsx src/sim/simulator.ts src/playback/integration.test.ts
      (nenhuma saída, exit 0: as linhas 1–3 passam)

- 2026-09-24 Stage 2, depois. `eslint.config.js`: `@typescript-eslint/no-import-type-side-effects` no bloco do code-split (furo 1) e um segundo padrão `^@dimforge/rapier2d-compat(/|$)` sem `allowTypeImports` (furo 2, qualquer import do pacote, inclusive de tipo e subcaminhos). Mesmo probe, mesmo comando:

      src\playback\probe.ts
        1:1  error  TypeScript will only remove the inline type specifiers which will leave behind a side effect import at runtime. …  @typescript-eslint/no-import-type-side-effects
        2:1  error  '@dimforge/rapier2d-compat' import is restricted from being used by a pattern. Rapier belongs to src/sim/ only; …  @typescript-eslint/no-restricted-imports
        3:1  error  '@dimforge/rapier2d-compat' import is restricted from being used by a pattern. Rapier belongs to src/sim/ only; …  @typescript-eslint/no-restricted-imports
      ✖ 3 problems (3 errors, 0 warnings)

  Linhas 4–5, `App.tsx` (o `import('./sim')` dinâmico), `src/sim/simulator.ts` e o teste seguem limpos (critério 3). Gate, probe apagado, sem mudança fora dos Primary files (critério 4): `npm test` 29 arquivos / 526 testes passando; `npm run lint`, `npm run typecheck` limpos; `npm run build` ok.
