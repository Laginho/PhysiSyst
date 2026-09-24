# CLEAN-01: Endurecer o code-split do Rapier
Stage: to-implement
Status: needs-triage
Blocked by: PHY-32
Review: agent

- Primary files:
  - `src/main.tsx` (listener `vite:preloadError`)
  - `src/sim/index.ts` (`TIMESTEP` reexportado de `./timestep`)
  - `src/sim/simulator.ts` (só remover o reexport de `TIMESTEP`)
  - `eslint.config.js` (`no-restricted-imports` para import de valor de `**/sim` fora de `src/sim/**`)
  - `src/App.test.ts` (só os dois testes de falha de boot: trocar o loop de 5 microtasks por `settleSimImport()`)

#### What to build

Três pontas soltas da revisão do PHY-32, nenhuma dentro dos Primary files daquele ticket:

1. O chunk do simulador pode falhar no fetch (rede caiu, deploy trocou o hash). O browser guarda o fetch falho no module map, então "tentar de novo" reimporta e rejeita de novo sem ir à rede; só um reload recupera. O Vite dispara `vite:preloadError` nesse caso (o helper já está no chunk de entrada); um listener em `main.tsx` que faz `window.location.reload()` fecha o buraco.
2. O critério 4 do PHY-32 (nenhum import de valor de `../sim` no caminho do chunk de entrada) só vale por convenção: `src/sim/index.ts` exporta `TIMESTEP` ao lado de `createSimulator`, e o próximo `import { TIMESTEP } from '../sim'` fora de `src/sim/` devolve o Rapier ao chunk de entrada com o gate verde. Uma regra de lint pina o invariante. Ao mesmo tempo, o barrel passa a exportar `TIMESTEP` direto de `./timestep`, para quem segue o import chegar no arquivo sem Rapier.
3. Dois testes da tela de carregamento ainda esperam o boot com `for (i < 5) await Promise.resolve()`, que agora também precisa absorver o hop do `import('./sim')`; os outros três usam `settleSimImport()`.

#### Acceptance criteria

1. Com `assets/sim-*.js` bloqueado no `vite preview`, a página recarrega sozinha em vez de mostrar o painel de erro com um "tentar de novo" que nunca funciona
2. `import { TIMESTEP } from '../sim'` num arquivo de `src/playback/` falha no `npm run lint`; dentro de `src/sim/` e em `import type` continua permitido
3. `src/sim/index.ts` exporta `TIMESTEP` de `./timestep`; `simulator.ts` não reexporta mais
4. Os cinco testes de `loading screen (PHY-16)` esperam o import dinâmico pelo mesmo `settleSimImport()`; mutação `void ensureSim()` comentado deixa os cinco vermelhos
5. Gate verde

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo para o item 1 (comportamento de `window`, verificado ao vivo no critério 1). Item 2 é verificado pela saída do lint. Item 3 é mudança de harness em `src/App.test.ts`, com registro da mutação.

## Comments

- 2026-09-24 Aberto pela revisão do PHY-32 (stage 3). Os três itens ficaram fora dos Primary files do PHY-32; a regra mecânica do loop manda reabrir ou parquear, e nenhum deles é o que o PHY-32 pediu.

- 2026-09-24 Attempt 1 failed: exit 0. Log tail: ...en shows the error panel, and clicking "tentar de novo" after the 10 seconds reloads it. If `sessionStorage` isn't available, it doesn't reload at all. / - **Test files are exempt from the lint rule.** Several tests outside `src/sim` import values from it, tests never end up in the entry chunk, and changing them was outside the ticket's file list. / - **`src/render/overlay.test.ts` was changed, one line.** Removing the re-export broke its import, so it now imports `TIMESTEP` from `../sim/timestep`. I added that file to the ticket's file list for that line only. /  / **Still needed from you:** a run of the live check at `C:\Users\Lage\AppData\Local\Temp\claude\D--Desktop-Projects-PhysiSyst\4541c328-b1fd-46ac-a193-7e5a02d50f7c\scratchpad\clean01-live.mjs`. It starts `vite preview` and headless Chrome, blocks `assets/sim-*.js`, and checks the reload count, the retry after the 10 seconds, and recovery from a one-off failure. Approve it here, or run it yourself: /  / ``` / node "C:\Users\Lage\AppData\Local\Temp\claude\D--Desktop-Projects-PhysiSyst\4541c328-b1fd-46ac-a193-7e5a02d50f7c\scratchpad\clean01-live.mjs" / ``` /  / Once it passes, I'll record the output in the ticket and commit `Stage: to-review`. /
