# CLEAN-04: ADR-0004 descreve a corda em pedaços da polia com massa; resíduos do PHY-25 fora dos Primary files
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md`
  - `src/scene/index.ts` (comentário de cabeçalho, linhas 16-19)
  - `src/sim/simulator.ts` (só comentários e o laço de `resetForces` em `step()`; nenhuma mudança de comportamento)
  - `CONTEXT.md` (glossário)

#### What to build

O PHY-25 trocou o mecanismo da corda quando uma polia do caminho tem massa sem tocar no documento que o descreve. Achados do review do PHY-25 (2026-09-24), todos fora dos Primary files daquele ticket ou sem critério que os cubra:

1. `docs/adr/0004-*.md` diz "one mechanism covers every rope, with or without pulleys", "ropes have no collider" e "Gauss–Seidel with a single iteration". Hoje `step()` despacha em `rope.grips.length`: uma polia com massa é um corpo Rapier próprio (disco, translação travada, `gravityScale 0`, colisor esfera de massa `M` em grupo de colisão 0, `I = ½MR²`), recolocado no eixo por `placeDisks` antes de cada leitura; num Corpo dinâmico a massa vai como colisor pontual sem contato no eixo (`setMassProperties(M, 0, 0)` deslocado para a âncora, eixos paralelos). A corda vira `Piece[]` entre `Grip[]`; cada pedaço tem comprimento fixo e as trações resolvem juntas (`K` matriz `J M⁻¹ J′ᵀ` entre pedaços, `solveLinear` com pivoteamento, `tautTensions` como active-set: pedaço que iria a `T < 0` afrouxa e o resto re-resolve). O não-deslizamento fica em nível de posição: cada disco guarda uma marca (`share`) que reparte o arco entre os dois pedaços e gira com o disco (`gripShares`, `wrapAngle`, teto |Δθ| < π por passo). `resetTorques` nos discos a cada passo (`resetForces` não limpa torque; PHY-34 para os corpos). Com `carry`, `replaceScene` leva o giro dos discos do mundo vivo e `regrip` recalcula as marcas para cada pedaço voltar ao seu comprimento. A tabela Measured não tem as famílias do PHY-25 (Atwood com `M = 2`, polia móvel com massa, carry): os números estão nos `## Comments` e na Resolution do ticket.
2. `src/scene/index.ts:18-19` ainda diz "Until PHY-25 they also reject a pulley mass". O codec aceita `mass ≥ 0` desde `82c1395`.
3. `correctPieces` reproduz a projeção na corda que `correctRope` marca com `ponytail:` (perda de energia, ADR Consequences); o marcador falta no pedaço.
4. `step()` limpa `userForce` dos corpos tocados pela corda mas não dos discos: `applyPulls` soma força no ponto tangente do disco a cada passo e ela acumula sem efeito (translação travada). Incluir os discos no laço de `resetForces` ou anotar por que não. Sem mudança de trajetória: a suíte do PHY-25 continua verde bit a bit.
5. `CONTEXT.md` não tem `grip`, `piece`, `share`/`mark` — termos novos do simulador. Registrar ou renomear.

#### Acceptance criteria

1. O ADR-0004 descreve o mecanismo de pedaços que `pullPieces`/`correctPieces`/`regrip` implementam hoje, diz por que o caminho escalar continua separado (critério 4 do PHY-25: `mass` ausente ou 0 bit a bit igual ao PHY-24) e a tabela Measured ganha as famílias do PHY-25
2. O comentário de `src/scene/index.ts` diz só o que o codec rejeita hoje
3. `correctPieces` leva o marcador `ponytail:` da projeção, ou aponta para o de `correctRope`
4. Os discos entram no `resetForces` de `step()` (ou um comentário diz por que não), e `npx vitest run src/scene/codec.test.ts src/sim` fica verde sem mudar nenhum número
5. `CONTEXT.md` registra ou descarta os termos `grip`, `piece`, `share`
6. Gate verde

#### Verification

    npx vitest run src/scene/codec.test.ts src/sim
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum: docs, comentários e um reset sem efeito observável. O critério 4 se prova pela suíte existente verde.

## Comments

- 2026-09-24 Aberto pelo review do PHY-25 (stage 3). Os itens 1 e 2 estavam anotados pela etapa 2 em `## Comments` do PHY-25 como fora dos Primary files; nenhum é critério daquele ticket, então o PHY-25 fechou como está.
- 2026-09-24 Stage 2 feito. Sem commit de teste (o ticket não pede nenhum), então `implementing` não aparece: o único commit leva direto a `to-review`.
  - (1) ADR-0004: introdução diz que `step()` despacha em `rope.grips.length`; nova seção "Pulleys with mass (PHY-25)" (disco, grips/pieces, share e o teto < π, `K` matriz + `tautTensions`, torques, carry/`regrip`) e o parágrafo sobre por que o caminho escalar fica separado (critério 4 do PHY-25, bit a bit); Consequences corrigem "single iteration" (pedaços de uma corda juntos, cordas entre si não) e "no collider" (colisores do disco em grupo 0). Tabela Measured ganha as famílias do PHY-25, medidas com o simulador de produção (probe descartável, mesmas cenas de `acceptance.test.ts`, janela de 60 passos após 30): Atwood `M = 2` `a` −0,001%, `T₁`/`T₂` 0,016%/0,015%, path 0,074 mm; com carry −0,002%, 0,013%/0,014%, 0,074 mm; polia móvel `M = 2`, `m₂ = 2`: `a` −0,003%, `T` da perna do contrapeso 0,029%, path 0,006 mm. Os números não estavam nos Comments do PHY-25 (lá só há saídas de mutação), por isso a medição.
  - (2) `src/scene/index.ts`: a massa da polia é opcional, finita e ≥ 0.
  - (3) `correctPieces`: `ponytail:` apontando para o de `correctRope`.
  - (4) Os discos entram no reset: `resetForces` ao lado do `resetTorques` já existente. Bit a bit: hash SHA-256 de `readStates` + `readConstraints` em 120 passos de Atwood `M = 2` e da polia móvel `M = 2`, com um `replaceScene` com carry no passo 40 — `6f0f0d86…2117d` antes e depois da mudança; com `resetTorques` removido, `d82770e2…fef28` (o hash enxerga o disco). `npx vitest run src/scene/codec.test.ts src/sim`: 156 passed.
  - (5) `CONTEXT.md`: `grip`/`piece`/`share` descartados como termos de domínio (vocabulário do solver, definido no ADR-0004), listados em _Avoid_ da Polia; a entrada ganha o fato de domínio: a corda não desliza na polia com massa e a tração difere de cada lado.
  - (6) Gate: 29 arquivos, 549/549 testes; lint, typecheck limpos; build ✓ (aviso de chunk > 500 kB, pré-existente).

#### Resolution (2026-09-24)

Verdict: Approve

Stage 3 review of `c922372` (one commit, no test files touched; the ticket asks for none). Every claim of the new ADR section was checked against `src/sim/simulator.ts`:

- ✅ 1 — ADR-0004: intro says `step()` dispatches on `rope.grips.length`; section "Pulleys with mass (PHY-25)" matches the code (disk `lockTranslations` + `setGravityScale(0)`, ball collider `setMass(M)` group 0, mount collider `setMassProperties(M, 0, 0)` at the anchor, `share` starting at `arc.sweep / 2`, `wrapAngle` and the < π ceiling, `K` matrix via `ropeInvMass(p, a)`, `tautTensions`/`solveLinear`, `rope.tension = max`, `regrip` on carry). The scalar-path paragraph cites PHY-25 criterion 4. Measured table gains the three PHY-25 families plus the bit-for-bit row.
- ✅ 2 — `src/scene/index.ts` header now states the codec rule as `codec.ts:200-203` enforces it (optional, finite, ≥ 0).
- ✅ 3 — `correctPieces` carries a `ponytail:` marker pointing at `correctRope`; ADR Consequences say so.
- ✅ 4 — disks get `resetForces` next to `resetTorques`, with the comment on why (translation locked). Stage 2 recorded the SHA-256 hash of 120 steps unchanged before/after. `src/scene/codec.test.ts src/sim` green inside the full gate.
- ✅ 5 — `CONTEXT.md`: `grip`/`piece`/`share` placed under _Avoid_ of Pulley with the pointer to ADR-0004; the domain fact (no slip, tension differs per side) added to the entry.
- ✅ 6 — Gate on the branch tip: 29 files, 549/549 tests; lint and typecheck clean; build ✓ (pre-existing chunk-size warning).

Primary files respected; no proxy decisions. Rebase not needed (branch sat on the session tip). Merged `--no-ff` into `sweatshop/2026-09-24-1853` as `bafb035`.
