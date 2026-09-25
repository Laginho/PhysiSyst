# CLEAN-11: Sobras do CLEAN-10: `x` da mola em `springAt`, velocidades em `placeChain`, subscrito do painel
Stage: done
Status: needs-triage
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`springAt`, `chainAxis`, `placeChain`)
  - `src/App.tsx` (a leitura da mola com massa)

#### What to build

Três notas do eixo Standards do review do CLEAN-10, nenhuma coberta por critério:

1. `springAt` calcula o comprimento `x = hypot(pb − pa)` e devolve só `dx = x − x₀`; `chainAxis` e `placeChain` reconstroem `x` como `dx + s.x0`, 1 ulp fora do `hypot` numa fração dos doubles. `springAt` passa a devolver `x` também e os dois usam-no.
2. `placeChain` chama `pointVelocity` duas vezes para as velocidades das pontas que `springAt` já devolve em `v` (o CLEAN-10 fez isso só em `chainAxis`).
3. O painel escreve `{t('readout.springForce')},{i + 1}`, repetindo a regra de subscrito de `vectorLabels` (`,n` quando o símbolo tem `_`, senão `_n`); uma troca de catálogo dessincroniza painel e setas sem teste que acuse.

#### Acceptance criteria

1. `springAt` devolve `x`; `chainAxis` e `placeChain` não somam `s.x0` a `dx`; nenhum número dos testes do PHY-30 e do CLEAN-09 muda
2. `placeChain` parte de `v` de `springAt`, sem chamar `pointVelocity`; nenhum número dos testes do PHY-30 e do CLEAN-09 muda
3. O rótulo do painel da mola com massa sai da mesma regra que o das setas (a função que `vectorLabels` usa, exportada ou movida para um lugar que o painel importa); o teste `F_el,1 e F_el,2 (PHY-30, CLEAN-10)` continua verde sem mudar de texto
4. Gate verde

#### Verification

    npx vitest run src/sim src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo para os itens 1 e 2: os do PHY-30 e do CLEAN-09 já pinam os números. Item 3: se a regra for extraída como função, um teste unitário dela em `src/render/overlay.test.ts` (ou onde `vectorLabels` já é testado) pinando `F_el` → `F_el,2` e `T` → `T_2`; vermelho porque a função ainda não existe.

## Comments

- 2026-09-24 Aberto pelo review do CLEAN-10 (stage 3). Os três itens são judgement calls do eixo Standards, fora do escopo que o CLEAN-10 listava para `simulator.ts` (`chainAxis`, `pushChain`).
- 2026-09-24 Nota do eixo Spec do CLEAN-10, sem critério aqui porque pede uma decisão de desenho: `vectorLabels` numera as setas por tipo na cena inteira e pula corpos fixos, enquanto o painel numera por vínculo. Com a parede fixa a única seta desenhada lê `F_el` e o painel `F_el,1`/`F_el,2`; com duas molas com massa as setas da segunda leem `F_el,3`/`F_el,4`. A corda tem o mesmo desvio (`T₁`/`T₂` por perna no painel, `T_n` por cena nas setas). Qual convenção vence é do stage 1: se entrar aqui, ganha arquivo em Primary files e critério.
- 2026-09-24 Stage 2 (implementação). Commits: `2e5536c` (teste, vermelho: `numberedSymbol is not a function`), `5f709ca` (código, sem arquivo de teste). `src/render/overlay.ts` entra no diff porque o critério 3 manda exportar a regra de `vectorLabels` de onde ela mora: `numberedSymbol(symbol, n)` exportada ali, `vectorLabels` e o painel em `App.tsx` a chamam. Gate: 30 arquivos, 684 testes verdes; lint, typecheck e build ok.
  Registro de mutações (cada uma aplicada sozinha e revertida):
  - M1 `numberedSymbol` com `;` no lugar de `,` → 4 vermelhos: `numberedSymbol (CLEAN-11)`, `vectorLabels > two of a kind`, `vectorLabels > spring with mass (PHY-30)` e, no DOM, `App.test.ts > com mₛ > 0, a leitura mostra F_el,1 e F_el,2 … (PHY-30, CLEAN-10)`. O painel passa pela função.
  - M2 `placeChain`: `chain.p = t * x * 1.5` → 7 vermelhos em `acceptance.test.ts > with mass (PHY-30)` (períodos, F_b − F_a, equilíbrio vertical, os dois carry do CLEAN-09, decremento amortecido). Com `× 1.01` fica verde: as tolerâncias (2–3%) pinam a posição dos nós, não o bit.
  - M3 `chainAxis`: ponta b em `x * 1.01` → 6 vermelhos nos mesmos testes do PHY-30/CLEAN-09.
  - M4 `placeChain`: `ub = dot(v[0], u)` → **verde** (140/140 em `src/sim` + `App.test.ts`). Nenhum teste põe a cadeia com as pontas se afastando ao longo do eixo; as velocidades dos nós no assentamento não estão pinadas. A troca do item 2 é idêntica bit a bit (`v[i]` é `pointVelocity(rigid, now[i])`, a mesma chamada de antes), então o critério 2 vale, mas o buraco fica: candidato a `CLEAN-*` se alguém quiser pinar `chain.w`.

#### Resolution (2026-09-24)

Verdict: Approve

**Decision.** Merged into `sweatshop/2026-09-24-1853` (`b20394f`, `--no-ff`). Every criterion met on the contract as written; no small fix needed. The branch sat directly on the session tip (`ba4a8d9`), so the rebase was a no-op and the gate below is the merged tree.

**Files.** `src/sim/simulator.ts`, `src/App.tsx`, `src/render/overlay.ts` (code, `5f709ca`); `src/render/overlay.test.ts` (test, `2e5536c`). Test-first shape holds: the test commit touched only the test file and this ticket; the code commit touched no test file.

**Findings.**

- Criterion 1: `springAt` computes `x = hypot(…)`, `dx = x − x₀` and returns both; `chainAxis` builds end b as `x − lag·vb`, `placeChain` seats nodes at `t·x`. No `dx + s.x0` left in `src/sim/simulator.ts`; the remaining `s.x0` uses (`chainTensions`' per-link rest length, the binding build) are not the pattern. `src/sim/acceptance.test.ts` is not in the diff, so the PHY-30 / CLEAN-09 numbers are unchanged by construction.
- Criterion 2: `placeChain` takes `v` from `springAt` and projects `v[0]`, `v[1]` on `u`; no `pointVelocity` call left in it. Bit-identical to before (`springAt`'s `v[i]` is the same `pointVelocity(rigid, now[i])` call).
- Criterion 3: `numberedSymbol(symbol, n)` exported from `src/render/overlay.ts`, called by `vectorLabels` and by the panel in `App.tsx`. The DOM test title and body in `src/App.test.ts` are untouched (not in the diff). `F_s` also carries `_`, so en-US reads `F_s,1`/`F_s,2` as before.
- Criterion 4: gate green, below.
- Primary files: `src/render/overlay.ts` is not listed, but criterion 3 names it by function ("a função que `vectorLabels` usa, exportada ou movida"), and exporting from where the rule lives is the smaller of the two options the criterion offers. Stage-1 omission, not a stage-2 breach; noted so the next `CLEAN-*` written from a review lists the file its own criterion implies.
- Standards, judgement call, not fixed: the panel keeps its own "bare symbol when mₛ = 0, numbered when > 0" branch beside `vectorLabels`' `keys.length < 2 ? symbol : numberedSymbol(…)`. The two branches also differ in which forces render, so folding them saves under five lines. Left as is.
- Test gap, parked in CLEAN-12: M4 (`ub = dot(v[0], u)`) stays green, so nothing pins the node velocities `placeChain` seats. Not a criterion here.
- The per-scene vs per-constraint numbering question under `## Comments` stays with stage 1; nothing in this diff touches it.
- No `Proxy decided` lines on this ticket.

**Mutations re-run by the review** (each applied alone with the Edit tool, `npx vitest run src/sim src/App.test.ts src/render/overlay.test.ts`, reverted with `git checkout -- src`):

- M1 `numberedSymbol` `;` for `,`: 4 failed | 174 passed — `numberedSymbol (CLEAN-11)`, `vectorLabels > two of a kind`, `vectorLabels > spring with mass (PHY-30)`, `App.test.ts > … F_el,1 e F_el,2 … (PHY-30, CLEAN-10)`.
- M2 `placeChain` `t * x * 1.5`: 7 failed | 171 passed, all in `acceptance.test.ts > with mass (PHY-30)`.
- M3 `chainAxis` end b `x * 1.01`: 6 failed | 172 passed, same block.
- M4 `placeChain` `ub = dot(v[0], u)`: 178 passed, as recorded.

**Gate** (on `905837f`, identical tree to the merge): `npm test` 30 files, 684 tests passed; `npm run lint` clean; `npm run typecheck` clean; `npm run build` ✓ (the usual chunk > 500 kB warning).
