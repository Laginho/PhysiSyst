# PHY-32: Code-split do Rapier
Stage: done
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

- 2026-09-24 Stage 2 (Opus 5.5). `TIMESTEP` moved to `src/sim/timestep.ts`. `simulator.ts` re-exports it, so `./sim` exports the same names. `accelerationTracker.ts` imports it from `../sim/timestep`. `App.tsx` imports only types from `./sim` and loads the simulator with `import('./sim')` inside `ensureSim`. A failed chunk fetch rejects through the same boot-failure branch, so "tentar de novo" also covers it.
  - **Chunk sizes (criteria 1, 2, 5), `npm run build`, uncompressed:**

    | | Entry chunk | Rapier chunk |
    |---|---|---|
    | Before | 2,377.76 kB (from attempt 1) | none, inlined in the entry chunk |
    | After | `index-*.js` 257.65 kB (gzip 80.02 kB) | `sim-*.js` 2,120.89 kB (gzip 805.50 kB), loaded later |

    The >500 kB warning still prints. Vite 8's warning doesn't name the chunk, but the Rapier chunk is the only one over 500 kB.
  - **Harness (criterion 3):** `App.test.ts` has a new `settleSimImport()` that runs `vi.dynamicImportSettled()` inside `act`. Three loading-screen tests call it before reading the `createSimulator` mock. Without it they fail, because the mock is now called a few microtasks after mount. No new test. Mutation check: I commented out `void ensureSim()` in the mount effect, and all 5 `loading screen (PHY-16)` tests went red. The first was `expected "vi.fn()" to be called 1 times, but got 0 times`, two got `resolveBoot is not a function`, and the two error-panel tests got `expected '…' to contain 'não foi possível carregar o motor de …'`. After the revert they are green again.
  - **Live check (criterion 5):** ran `vite preview` on `dist/` in headless Chrome over CDP, with `Fetch` holding back `assets/sim-*.js`. While it was held, the canvas, 18 buttons and the loading badge had rendered, `first-contentful-paint` was at 448 ms, and the only script loaded was `index-CgkX8v4T.js`. After the chunk was released, the badge went away and there was no error panel. Clicking "▶ reproduzir" changed the button to "⏸ pausar", and after 1.5 s the canvas pixels had changed.
  - **Gate:** `npm test` 28 files, 478/478 passed. `npm run lint`, `npm run typecheck` and `npm run build` were clean.
  - The harness commit didn't set `Stage: implementing`, so the stage goes from `to-implement` straight to `to-review` in this commit.

#### Resolution (2026-09-24)

Verdict: Approve

Merged into `sweatshop/2026-09-24-1506` as `fd3ee2d` (no-ff). Branch `phy/PHY-32-code-split-do-wasm`, commits `8672038` (harness, own commit), `230c07a` (code), `e4a14c2` (review fix).

**Findings**

- Criteria 1–2, 4–6: hold. Build on the merged tree: `index-*.js` 257.65 kB (gzip 80.02), `sim-*.js` 2,120.89 kB (gzip 805.50); the >500 kB warning is the Rapier chunk only. Static value imports of `./sim` on the entry path: none (`App.tsx` and `accelerationTracker.ts` are type-only or go through `./sim/timestep`).
- Criterion 3: holds. The five PHY-16 tests are green; stage 2 recorded the `void ensureSim()` mutation with five red outputs, which satisfies mutate-verify for the harness change.
- Criterion 5: stage 2's live check is recorded above (first paint with the sim chunk held back, play after release). Not repeated here.
- Small fix (`e4a14c2`, `src/App.tsx` only): the comment on the dynamic import said retry covers a failed chunk fetch. It does not: browsers cache a failed module fetch in the module map, so a second `import()` rejects without a network round-trip. Comment reworded, no behaviour change.
- Parked in `CLEAN-01` (outside Primary files, so neither a small fix nor this ticket's reopen): `vite:preloadError` reload listener in `main.tsx`; a lint rule pinning criterion 4 (today only convention keeps `../sim` value imports out of the entry path); `index.ts` re-exporting `TIMESTEP` from `./timestep` directly; the two boot-failure tests still waiting on a 5-microtask loop instead of `settleSimImport()`.
- Proxy decided (2026-09-24): three files joined Primary files so criterion 4 could hold. Named here for the session PR.
- Test-first separation: `diff --stat` of `8672038` touches `src/App.test.ts` only; `230c07a` touches no test file.

**Gate (merged tree, before the docs commit)**

    npm test        28 files, 478/478 passed
    npm run lint    clean
    npm run typecheck clean
    npm run build   index 257.65 kB, sim 2,120.89 kB, one >500 kB warning (Rapier chunk)
