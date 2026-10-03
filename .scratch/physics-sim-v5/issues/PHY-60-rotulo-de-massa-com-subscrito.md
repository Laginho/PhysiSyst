# PHY-60: Rótulo de massa com subscrito e fora de corpo pequeno
Stage: done
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/render/draw.ts (o `fillText(label)` dos rótulos de massa em ~243 e o rótulo em `drawArrow`)
  - src/render/draw.test.ts
  - src/App.test.ts (só os contextos falsos passados a `getContext`, todos os presentes e os que a sessão vier a acrescentar: `measureText` devolve `{ width: <número> }`; nenhuma asserção, cenário ou expectativa muda)

#### What to build

O rótulo de massa sai literal, com o sublinhado (`m_a`, `m_b`), centrado no corpo; num corpo pequeno (o contrapeso de 0,2 m da polia móvel) ele transborda o contorno e fica ilegível. Os rótulos de vetor já desenham `_` como subscrito (`drawArrow`).

1. O rótulo de massa desenha o subscrito como os de vetor: base na fonte normal, o que vem depois do primeiro `_` na fonte menor e mais baixo. A divisão base/subscrito sai de um helper só, usado pelos dois.
2. Quando a largura medida do rótulo (`ctx.measureText`, base + subscrito) não cabe dentro da caixa do corpo na tela, com margem, o rótulo vai para fora: logo acima e à direita da caixa envolvente do corpo, sem rotação.

#### Acceptance criteria

1. Um corpo com rótulo `m_b` produz um `fillText('m', …)` e um `fillText('b', …)` com a fonte do subscrito; nenhum `fillText` recebe `m_b`.
2. Um corpo cuja caixa na tela é maior que o rótulo medido desenha o rótulo no centro, como hoje.
3. Um corpo cuja caixa na tela é menor que o rótulo medido desenha o rótulo fora da caixa envolvente.
4. Rótulos sem `_` (`m`, `M`) saem como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/draw.test.ts`, com o contexto de canvas falso que o arquivo já usa (o `measureText` dele precisa devolver uma largura controlada): critérios 1 a 3 vermelhos hoje. O 4 passa hoje e vai junto.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 5, "o m_b está bem ruim").

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-60-rotulo-massa-asked-20261003-0051`): PHY-60 implementado, mas marcado `blocked` por escopo. /  / - Subscritos e posicionamento externo prontos. / - 27 testes focados, lint, typecheck e build passaram. / - Restam sete falhas causadas por canvases falsos em `src/App.test.ts`. /  / Posso incluir esse arquivo para corrigir os dois retornos de `measureText`? A [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “the implementer may touch those files and nothing else”; ele está fora dos `Primary files`. /  / Trabalho preservado nos commits `0426c42` e `9ece33d`.

- 2026-10-03 Proxy decided: sim, `src/App.test.ts` entra, restrito aos dois `getContext` falsos (gravador do PHY-59 ~l.270 e `recordCanvas` ~l.2325), só para `measureText` devolver `{ width: <número> }`; nenhuma asserção, cenário ou expectativa muda; commit test-only próprio; o stage 2 retoma do branch `phy/PHY-60-rotulo-massa-asked-20261003-0051` (0426c42, 9ece33d) sem refazer nada — as sete falhas são um `TypeError` de harness (proxy devolve `undefined` para `measureText`), não regressão: as asserções desses testes filtram por cor de vetor ou por `lineTo`, e o critério 2 exige `measureText`; corrigir isso em `draw.ts` com `?.width ?? 0` seria dobrar produção a um double, não cabe.

- 2026-10-03 Foreman: o branch `phy/PHY-60-rotulo-massa-asked-20261003-0051` foi renomeado para `asked/phy60-rotulo-massa-20261003-0051` (mesmos commits `0426c42`, `9ece33d`), porque o driver procura o branch do ticket por `*/PHY-60-*`, achava o nome antigo e lia o `Stage: blocked` dele. Para retomar como o proxy decidiu: criar o branch do ticket `phy/PHY-60-rotulo-de-massa-com-subscrito` a partir da sessão e trazer dele as mudanças em `src/` de `0426c42` (teste) e `9ece33d` (código), com o ticket vindo da sessão; não trabalhar direto no branch `asked/`.

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-60-rotulo-de-massa-com-subscrito-asked-20261003-0318`): PHY-60 preservado no commit `c01e01a`, com `Stage: blocked`. /  / Subscritos e posicionamento externo funcionam: 27 testes focados passam. Gate: 1009 passam, 6 falham por outros quatro canvases falsos sem `measureText`. Lint, typecheck e build passam. /  / Posso corrigir esses quatro doubles, sem alterar asserções? /  / O ticket autoriza apenas dois; a [skill ticket-flow](C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige: “the implementer may touch those files and nothing else”. O proxy configurado está indisponível neste runtime.

- 2026-10-03 Proxy decided: sim, os quatro doubles novos também entram — a regra passa a ser por tipo, não por contagem: todo contexto falso passado a `getContext` em `src/App.test.ts` (hoje seis, ~l.279, ~2331, ~2752, ~2857, ~3075, ~3102, e qualquer outro que a sessão acrescente) pode ganhar `measureText` devolvendo `{ width: <número> }`, e nada mais nesse arquivo muda; o `beforeEach` com `getContext: () => null` fica como está — os quatro são o mesmo `TypeError` de harness do primeiro pedido (o Proxy cai em `target[key] ?? (() => {})`, `measureText` devolve `undefined`, `.width` quebra em draw.ts:247), as asserções deles leem `translate`/`stroke`, não texto, e a contagem "dois" descrevia o arquivo antes de PHY-64..66 serem mergeados, não uma escolha de design. O próximo stage 2 retoma de `c01e01a` (`676ad3f` teste em draw.test.ts, `33084dc` test-only nos dois primeiros doubles, `c01e01a` só `draw.ts` + ticket) sem refazer nada: cria `phy/PHY-60-rotulo-de-massa-com-subscrito` a partir da sessão, traz as mudanças em `src/` desses três commits, acrescenta um commit test-only com os quatro doubles restantes, roda o gate e vai a `to-review`.

- 2026-10-03 Foreman: os commits da tentativa 2 (`676ad3f`, `33084dc`, `c01e01a`) estão no branch `asked/phy60-rotulo-massa-20261003-0318` (renomeado pelo mesmo motivo do anterior).

#### Stage 2 continuation (2026-10-03, completed)

- Resumed on the ticket branch from session `sweatshop/2026-10-02-2210`, restoring only source patches from `676ad3f`, `33084dc`, and `c01e01a`; retained the expanded contract from the session.
- Callers checked: App.tsx paint invokes drawScene for editor/playback and drawArrow for vector overlays. Existing recovered coverage includes empty/fixed bodies, bare symbols, measured-width boundaries, rotated rectangles, circles, and triangles.
- Red reverified before production changes: draw.test.ts had 6 failed / 21 passed (literal m_a/m_b instead of separate glyph runs; measured overflow expected false to be true). Tests committed as `5f9f9c2`.
- Canvas harness corrections committed separately as `fbf6828` (original two doubles) and `9458cd7` (remaining four). Only measureText return values changed; no assertions or scenarios changed.
- Identical implementation and regression tests recovered; mutation evidence below is preserved from `c01e01a` / `9ece33d`, not rerun in this continuation.
- Mutation evidence (all restored):
  - Centered base/subscript test: forcing `junction = 0` failed with `expected 444 to be close to 450` (1 failed / 26 skipped).
  - External rectangle (0 rad): `outside = false` failed with `expected 441 to be greater than 456`.
  - External rectangle (pi/4): same mutation failed with `expected 440.70710678118655 to be greater than 458.485281`.
  - External circle (0.7 rad): same mutation failed with `expected 440.7648421872845 to be greater than 456`.
  - External triangle (pi/2): same mutation failed with `expected 448 to be greater than 450`.
  - Measured-width/margin test: same mutation failed with `expected false to be true` (combined run: 5 failed / 3 passed / 19 skipped).
  - Bare rectangle and triangle tests: changing mass font to 18 px failed both with `expected 'italic 18px system-ui, sans-serif' to be 'italic 16px system-ui, sans-serif'` (3 failed / 5 passed / 19 skipped, including centered-label test).
- Green: all 27 focused rendering tests passed. Full gate: 31 files passed, 1024 tests passed; lint, typecheck, and build passed.
- Initial sandbox suite: 1009 passed / 15 failed, all failures from Chromium DevTools connection/disconnection. The full suite passed with normal Chromium permissions.
- Build retains the existing chunk-size warning. Final diff and whitespace checked: only authorized source files and ticket changed; production commit does not touch tests.
- Stage 2 complete; ready for the separate stage-3 review.

#### Stage 3 documentation correction (2026-10-03)

- Standards review found one stale description in `CONTEXT.md`: mass labels were described as always inside the body. Updated it to include external placement when the measured label does not fit. This is the documentation-only exception allowed by ticket-flow; no production code or test changed.
- Independent Spec review found all four numbered criteria satisfied and no introduced regression or scope creep. Both recorded Proxy decisions were checked: the initial two canvas doubles and the subsequent authorization for every fake canvas context in `src/App.test.ts`; all six edits only supply `measureText` widths.
- Review gate: 31 test files passed, 1024 tests passed; lint, typecheck and build passed. The existing build chunk-size warning remains.

#### Resolution (2026-10-03)

Verdict: Approve

- Standards: one stale domain-description finding, corrected in `90a805e`; no remaining findings. `CONTEXT.md` now describes labels inside or beside the body. The review checked the entire diff and commit separation: `5f9f9c2` contains regression tests, `fbf6828` and `9458cd7` only repair canvas doubles, and production commit `8117855` changes no tests. No unrelated refactoring or source changes.
- Spec: zero findings. Criteria 1-4 are satisfied: base/subscript runs and smaller lowered suffix; combined measured-width centering; upright placement above/right of rotated screen bounds when the label plus margin does not fit; preserved bare symbols for fitting bodies. Mass and vector labels use the same first-underscore splitter. Both `Proxy decided` entries were reviewed: the original two-double authorization and the expansion to all canvas doubles; the resulting six `App.test.ts` edits only provide numeric text metrics.
- Files: `src/render/draw.ts`, `src/render/draw.test.ts`, `src/App.test.ts`, plus the stale-documentation correction in `CONTEXT.md` and ticket/ledger bookkeeping.
- Red-green proof: stage 2 recorded 6 failed / 21 passed before implementation and 27 / 27 focused tests green afterward. All eight added cases have mutation failures recorded above. Review confirmed that `draw.ts` and `draw.test.ts` are unchanged from `c01e01a` / `9ece33d`, so the recovered evidence still targets identical production and test code; mutations were not rerun in stage 3.
- Gate rerun during review: `npm test` passed 31 files and 1024 tests (45.25 s); `npm run lint`, `npm run typecheck`, and `npm run build` all exited 0. The existing >500 kB chunk-size warning remains. Final whitespace and scope checks passed. Only documentation changed after the gate.
- Rebase onto `sweatshop/2026-10-02-2210` was already up to date; merged locally without squash as `dce6726`. No conflicts or source changes occurred during integration. Ticket closed with its ledger entry in this commit; no PR or push in the session-branch flow.
