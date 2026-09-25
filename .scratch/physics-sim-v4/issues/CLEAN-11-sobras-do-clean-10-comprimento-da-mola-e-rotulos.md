# CLEAN-11: Sobras do CLEAN-10: `x` da mola em `springAt`, velocidades em `placeChain`, subscrito do painel
Stage: to-review
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
