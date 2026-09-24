# PHY-32: Code-split do Rapier
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (import dinâmico do simulador no boot)
  - New: `src/sim/timestep.ts` (só `export const TIMESTEP`, sem import do Rapier)
  - `src/sim/simulator.ts` (só `TIMESTEP`: importado de `./timestep` e reexportado, exports de `./sim` inalterados)
  - `src/playback/accelerationTracker.ts` (só a linha de import: `TIMESTEP` de `../sim/timestep`, `type BodyState` continua de `../sim`)
  - `src/App.test.ts`
  - `vite.config.ts` (só se necessário)

#### What to build

O chunk de entrada deixa de carregar o Rapier (com o wasm embutido). O módulo do simulador passa a ser importado dinamicamente no boot que a tela de carregamento já dispara no mount, então o shell do app pinta antes e a espera do motor continua coberta pela tela de carregamento. Nenhum comportamento visível muda além do tempo da primeira pintura.

#### Acceptance criteria

1. `npm run build` gera um chunk de entrada abaixo de 500 kB; o Rapier sai num chunk carregado tardiamente
2. Se o aviso de chunk > 500 kB persistir, ele nomeia só o chunk tardio do Rapier; isso fica registrado em `## Comments` com os tamanhos
3. A tela de carregamento continua aparecendo até o motor ficar pronto, e o "tentar de novo" continua reexecutando o boot (testes existentes verdes)
4. Nenhum import estático de valor do módulo do simulador resta no caminho do chunk de entrada (imports de tipo continuam)
5. Verificação live em browser (`npm run build` + preview): primeira pintura sem o motor, play funciona depois do carregamento; tamanhos dos chunks antes e depois em `## Comments`
6. Gate verde

#### Verification

    npm run build
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: o critério 1 é verificado pela saída do build e os critérios 3–4 pelos testes existentes da tela de carregamento. Se o import dinâmico exigir mudança no espelho do `App.test.ts`, é mudança de harness, não teste novo.

## Comments

- 2026-09-24 Attempt 1 failed: exit 0. Log tail: ...because `src/playback/accelerationTracker.ts` imports the constant `TIMESTEP` from `../sim`. `TIMESTEP` is defined in `src/sim/simulator.ts`, the file that imports Rapier, so Rapier stays in the entry chunk. Changing `vite.config.ts` can't fix this either. /  / **Tried:** I moved `TIMESTEP` into a new `src/sim/timestep.ts` that doesn't import Rapier, built it, and then reverted it all. Uncompressed sizes: /  / | | Entry chunk | Rapier chunk | / |---|---|---| / | Before | 2,377.76 kB | — | / | `App.tsx` change only | 2,379.34 kB | none, the split has no effect | / | `TIMESTEP` moved out | 257.65 kB | 2,120.89 kB, loaded later | /  / With the move, the entry chunk is under 500 kB and the 500 kB warning names only the Rapier chunk. /  / **Decision needed (stage 1):** do you want to add these to the ticket's Primary files? / - `New: src/sim/timestep.ts` / - `src/sim/simulator.ts`, for `TIMESTEP` only (imported and re-exported, so what `./sim` exports stays the same) / - `src/playback/accelerationTracker.ts`, for the import line only /  / If yes, add them, set `to-implement` again, and the fix is those changes plus two lines in `App.tsx`. The audible beep for a stopped run didn't play: the PowerShell call was rejected. /

- 2026-09-24 Attempt 2 failed: exit 0; blocked after two attempts. Log tail: ...n `phy/PHY-32-code-split-do-wasm` (`2ae58f3`), which branches from `sweatshop/2026-09-24-1506`. Attempt 1 reported committing on that branch, but it didn't exist when I looked. /  / **Why it's still blocked:** `src/playback/accelerationTracker.ts:2` still imports the value `TIMESTEP` from `../sim`. That import pulls `simulator.ts`, and with it Rapier, into the entry chunk. So a dynamic import in `App.tsx` alone changes nothing, and the files that would fix it aren't in the ticket's Primary files. Attempt 1 asked you about this under `## Comments` and there's no answer yet. I added a note there saying attempt 2 hit the same wall. /  / **To unblock it (stage 1):** add these to Primary files, set `Stage: to-implement`, and commit on the session branch: / - `New: src/sim/timestep.ts` / - `src/sim/simulator.ts`, for `TIMESTEP` only (it re-exports it, so what `./sim` exports stays the same) / - `src/playback/accelerationTracker.ts`, for the import line only /  / Attempt 1 measured this change: the entry chunk drops from 2,378 kB to 258 kB, and Rapier moves to its own 2,121 kB chunk that loads later. /  / The beep your memory asks for when a run fails didn't play, because the tool blocked the PowerShell call. /

- 2026-09-24 Proxy decided: add `src/sim/timestep.ts` (new), `src/sim/simulator.ts` (TIMESTEP only) and `src/playback/accelerationTracker.ts` (import line only) to Primary files — criterion 4 cannot hold while `accelerationTracker.ts` imports the value `TIMESTEP` from `../sim`; a grep shows it is the only other value import of the sim module outside `src/sim/` (routing, view and overlay are `import type`), and the change is reversible. Folded into Primary files above. Stage 2's measurement: entry chunk 2,378 kB -> 258 kB, Rapier 2,121 kB loaded later.
