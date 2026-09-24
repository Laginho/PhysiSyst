# CLEAN-01: Endurecer o code-split do Rapier
Stage: implementing
Status: needs-triage
Blocked by: PHY-32
Review: agent

- Primary files:
  - `src/main.tsx` (listener `vite:preloadError`)
  - `src/sim/index.ts` (`TIMESTEP` reexportado de `./timestep`)
  - `src/sim/simulator.ts` (só remover o reexport de `TIMESTEP`)
  - `eslint.config.js` (`no-restricted-imports` para import de valor de `**/sim` fora de `src/sim/**`)
  - `src/App.test.ts` (só os dois testes de falha de boot: trocar o loop de 5 microtasks por `settleSimImport()`)
  - `src/render/overlay.test.ts` (só a linha do import de `TIMESTEP`, que passa a vir de `../sim/timestep`)

#### What to build

Três pontas soltas da revisão do PHY-32, nenhuma dentro dos Primary files daquele ticket:

1. O chunk do simulador pode falhar no fetch (rede caiu, deploy trocou o hash). O browser guarda o fetch falho no module map, então "tentar de novo" reimporta e rejeita de novo sem ir à rede; só um reload recupera. O Vite dispara `vite:preloadError` nesse caso (o helper já está no chunk de entrada); um listener em `main.tsx` que faz `window.location.reload()` fecha o buraco.
2. O critério 4 do PHY-32 (nenhum import de valor de `../sim` no caminho do chunk de entrada) só vale por convenção: `src/sim/index.ts` exporta `TIMESTEP` ao lado de `createSimulator`, e o próximo `import { TIMESTEP } from '../sim'` fora de `src/sim/` devolve o Rapier ao chunk de entrada com o gate verde. Uma regra de lint pina o invariante. Ao mesmo tempo, o barrel passa a exportar `TIMESTEP` direto de `./timestep`, para quem segue o import chegar no arquivo sem Rapier.
3. Dois testes da tela de carregamento ainda esperam o boot com `for (i < 5) await Promise.resolve()`, que agora também precisa absorver o hop do `import('./sim')`; os outros três usam `settleSimImport()`.

#### Acceptance criteria

1. Com `assets/sim-*.js` bloqueado no `vite preview`, a página recarrega sozinha uma vez em vez de mostrar o painel de erro com um "tentar de novo" que nunca funciona; uma segunda falha em menos de 10 s mostra o painel (sem loop de reload), e "tentar de novo" depois da janela recarrega. Uma falha passageira (bloqueio retirado após a primeira) termina com o simulador de pé
2. `import { TIMESTEP } from '../sim'` num arquivo de produção de `src/playback/` falha no `npm run lint`; dentro de `src/sim/`, em `import type` e em arquivos `*.test.ts(x)` continua permitido
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

- 2026-09-24 Attempt 2 (stage 2). Attempt 1 left no branch or code, only its live-check script; redone from scratch on `phy/CLEAN-01-code-split-hardening`.

- Proxy decided: `overlay.test.ts:16` imports `TIMESTEP` from `../sim/timestep`, file joins Primary files for that line — removing the reexport (criterion 3) breaks exactly that one import, and `accelerationTracker.ts` already uses `../sim/timestep`.
- Proxy decided: the lint rule exempts `*.test.ts(x)` — tests never enter the Vite build graph; rewriting five test files outside Primary files protects nothing. Folded into criterion 2.
- Proxy decided: guarded reload (sessionStorage timestamp, 10 s window, no `preventDefault`, no reload if sessionStorage throws) — a naive listener reload-loops forever while the chunk is unreachable; `preventDefault` would resolve the import to `undefined` and crash the `.then`. Folded into criterion 1.

- Mutation record, criterion 4 (`src/App.test.ts`, `loading screen (PHY-16)`, all four 5-microtask loops replaced by `settleSimImport()`, the retry/play clicks included since they re-issue `import('./sim')`). Unmutated: 5 passed. Mutation: mount effect's `void ensureSim()` commented out in `src/App.tsx`. Output:

      × boots the simulator on mount, before any play interaction
      × shows the loading overlay while booting, without blocking canvas pointer events
      × rotates the message every 1.5s and clears the timer once the sim is ready
      × shows a fixed error with a retry button on boot failure; retry re-attempts the boot
      × leaves the error state when a boot triggered by play succeeds
      AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
      TypeError: resolveBoot is not a function   (×2)
      AssertionError: expected '…' to contain 'não foi possível carregar o motor de …'   (×2)
      Tests  5 failed | 28 skipped (33)
