# CLEAN-29: testes para as três regras do CLEAN-25 que nenhum critério cobre
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/scene/ropePath.test.ts (bloco `ropePath, unwound sweep (PHY-54)`, dentro de `ropePath, kept wrap direction (PHY-45)`: três testes novos com `CLEAN-29` no nome)
  - src/scene/ropePath.ts (`release`: só as mutações do critério 5, aplicadas e revertidas, nunca commitadas)

#### What to build

Três testes que fixam três regras que o CLEAN-25 implementou em `release` (`src/scene/ropePath.ts`) e que nenhum critério testa, como a revisão do CLEAN-25 (merge `6f5cdf1`) anotou: (1) uma polia solta sozinha numa perna fica no meio dela (`t = 1/2`); (2) o espaçamento `t = k/(n + 1)` na ordem de `via` vale também na perna entre duas polias em que a corda ainda está presa, não só nas pernas das pontas; (3) o `arcs[i].start` de uma polia solta é o ângulo do centro até a junção dela (decisão do proxy de 2026-10-02 no CLEAN-25). As três regras valem hoje, conferidas no stage 1 com `ropePath` chamada direto (Comments); nenhuma é um achado.

Nenhum código de produção muda. Como os testes fixam comportamento que já existe, eles nascem verdes: o vermelho deste ticket vem por mutação de `release`, nunca por um commit de código. A regra test-first do `ticket-flow` se aplica assim: o commit só de testes leva `Stage: implementing` e já é verde; o stage 2 aplica cada mutante do critério 5 à produção, roda os testes, registra a saída vermelha em Comments e reverte antes de commitar qualquer coisa; `Stage: to-review` vai num segundo commit, só do ticket, com os registros e o gate verde. Não há commit de código, e o `git diff --stat` do branch não toca `src/scene/ropePath.ts` (critério 4).

A costura é uma só: `ropePath` chamada direto, no mesmo bloco dos testes do PHY-54 e do CLEAN-25, reaproveitando `expectPoint`. É também a mais alta possível: a posição da junção é invisível a toda costura acima dela por construção (comprimento, puxões, comprimento das peças e energia não dependem de `t`, o motivo pelo qual o CLEAN-25 ficou só na geometria), e o canvas não desenha arco de varredura negativa (PHY-56), então nem uma costura de DOM vê o `start`. Nada em `acceptance.test.ts`, nenhuma cena.

Medido no stage 1, com cópias de `ropePath.ts` fora do repositório: os três mutantes do critério 5 sobrevivem aos 25 testes de hoje de `ropePath.test.ts`. É o motivo do ticket.

**Fora do escopo:** o CLEAN-28 (a escolha do caminho da corda num lugar só), que corre em paralelo e pode acrescentar código ao lado de `scenePath` em `ropePath.ts`; não toca `release`, e este ticket não commita produção.

#### Acceptance criteria

1. Uma polia solta só: `ropePath(a, b, [polia], [−1], [−0,5])` com a = (−3, 2), b = (−1, 2), centro (0, 0), R = 1 (a geometria do teste do PHY-54 "a loose pulley whose center projects past an end", que só confere que a junção fica dentro da perna). A junção (`segments[0].to`, igual a `segments[1].from`) é (−2, 2) a 10⁻⁹: o meio da perna. (A projeção do centro cai em t = 1,5; limitada a ¾ daria (−1,5; 2): a geometria separa a regra da antiga.) `arcs[0].sweep` segue negativo.
2. Na mesma leitura, `arcs[0].start` é igual, a 10⁻⁹, a `atan2(junção.y − centro.y, junção.x − centro.x)`, com a junção lida do próprio `path` devolvido (`segments[0].to`), não de um t fixo: o teste da regra 3 é independente da regra 1, e só o mutante (c) o derruba. (Hoje o valor é 3π/4.)
3. Quatro polias R = 1, centros (−6, 0), (−1, −3), (3, −3), (6, 0); `keep = [−1, −1, −1, −1]`; `sweeps = [undefined, −0,5, −0,5, undefined]`; a = (−7, −5), b = (7, −5). A corda passa por cima da primeira e da última; as duas do meio estão soltas na perna entre elas, de (−6, 1) a (6, 1):
   1. há 5 segmentos; `segments[1].to` = `segments[2].from` = (−2, 1) e `segments[2].to` = `segments[3].from` = (2, 1), a 10⁻⁹ (t = 1/3 e 2/3 na ordem de `via`; as projeções dos centros dariam (−1, 1) e (3, 1));
   2. `arcs[i].center` é o centro da polia i de `via`; `arcs[1].sweep` e `arcs[2].sweep` são negativos; `arcs[0].sweep` e `arcs[3].sweep` são π/2 a 10⁻⁹;
   3. o comprimento é 22 + π a 10⁻⁹, igual ao de `ropePath(a, b, [polia 0, polia 3], [−1, −1])`;
   4. `arcs[1].start` e `arcs[2].start` são iguais, a 10⁻⁹, ao `atan2` do centro de cada uma até a junção dela lida do próprio `path` (`segments[1].to` e `segments[2].to`). (Hoje os dois valem `atan2(4, −1)`.)
4. Nenhum commit do ticket toca `src/scene/ropePath.ts` nem outro arquivo de produção: `git diff --stat main...HEAD -- src` lista só `src/scene/ropePath.test.ts`. O commit só de testes nasce verde, porque o comportamento já existe; o vermelho deste ticket é o do critério 5.
5. Mutate-verify (`AGENTS.md`). Os testes chamam `ropePath` direto, mas não há commit vermelho que os fixe, então o registro é obrigatório: o stage 2 aplica cada mutante a `release` em `src/scene/ropePath.ts`, roda `npx vitest run src/scene/ropePath.test.ts -t CLEAN-29`, registra em Comments a saída vermelha e reverte antes de qualquer commit. Cada mutante tem que deixar vermelho o teste da sua regra; os outros testes podem cair junto ou não (o (a) também derruba o da regra 2, e está certo).
   - (a), regra 1: `const t = (i - first + 1) / (last - first + 2)`. Vermelhos: critério 1 (junção em (−2,333; 2)) e 3.1 ((−3, 1) e (0, 1)). Verdes: 2 e 3.4, porque o `start` segue a junção que se moveu.
   - (b), regra 2: `const t = leg > 0 && leg < idx.length ? 0.5 : (i - first + 1) / (last - first + 1)` (a perna entre polias engatadas põe toda junção no meio). Vermelho: 3.1 (as duas junções em (0, 1), segmento do meio nulo). Verdes: 1, 2, 3.4.
   - (c), regra 3: `start: Math.atan2(center.y - joint.y, center.x - joint.x)`. Vermelhos: 2 (−π/4 em vez de 3π/4) e 3.4 (−1,326 em vez de 1,816). Verdes: 1 e 3.1–3.3.
6. Os testes existentes ficam verdes sem mudar tolerância nem texto.
7. Gate verde: `npm test && npm run lint && npm run typecheck && npm run build`.

#### Verification

    npx vitest run src/scene/ropePath.test.ts -t CLEAN-29
    npx vitest run src/scene/ropePath.test.ts
    git diff --stat main...HEAD -- src
    npm test && npm run lint && npm run typecheck && npm run build

O `git diff --stat` lista só `src/scene/ropePath.test.ts`. O gate precisa de um Chromium na máquina (`CHROME_BIN` aponta para ele quando está fora dos caminhos padrão), por causa dos testes de layout do `AGENTS.md`.

## Tests stage 2 writes (own commit, red)

- `src/scene/ropePath.test.ts`, bloco `ropePath, unwound sweep (PHY-54)`, chamando `ropePath` direto e reaproveitando `expectPoint`, três `it` com `CLEAN-29` no nome, um por regra: critério 1 (uma polia solta: junção no meio), critério 2 (a mesma leitura: `start` derivado da junção do `path`), critério 3 (quatro polias, as duas do meio soltas na perna entre as engatadas). Os três nascem verdes: a regra já está em `release` desde o CLEAN-25. O commit só de testes leva `Stage: implementing`; o vermelho vem das três mutações do critério 5, aplicadas e revertidas sem commit, uma por regra, com a saída registrada em Comments; `Stage: to-review` vai num segundo commit, só do ticket. Não há commit de código.

## Comments

- 2026-10-02 Aberto pelo foreman a pedido do Bruno, a partir da recomendação 6 do relatório `docs/relatorios/2026-10-02-sweatshop-sonnet-5.5-opus-5.5-2`. A revisão do CLEAN-25 (merge `6f5cdf1`) aprovou todos os critérios, mas registrou três regras do ticket que estão implementadas em `src/scene/ropePath.ts` e que nenhum critério testa: (1) uma polia solta sozinha fica no meio da perna (`t = 1/2`); (2) o espaçamento `t = k/(n + 1)` vale também entre duas polias em que a corda ainda está presa; (3) o `arcs[i].start` de uma polia solta não muda (decisão do proxy de 2026-10-02 no CLEAN-25). Nada foi commitado além deste ticket. Como são testes de comportamento que já existe, o vermelho vem por mutação, não antes do código; cabe ao stage 1 nomear as mutações e o bloco de testes.
- 2026-10-02 Stage 1. Probes fora do repositório, produção intocada. As três regras valem na main: regra 1, junção em (−2, 2) na geometria do critério 1; regra 2, junções em (−2, 1) e (2, 1) na do critério 3, 5 segmentos, arcos na ordem de `via`, comprimento 22 + π igual ao da construção sobre as duas engatadas (diferença 4·10⁻¹⁵); regra 3, `start` = 3π/4 e `atan2(4, −1)`. Nenhum chamador lê o `start` de uma polia solta: `draw.ts:326` pula arcos de varredura negativa (PHY-56); o simulador lê `start` só de grips presos (`gripShares`, `correctPieces`) ou no reengate (`regripGrips`), quando a varredura já é ≥ 0 e a polia já voltou à construção dentro de `release`. Os três mutantes do critério 5 foram medidos em cópias de `ropePath.ts` e sobrevivem aos 25 testes de hoje de `ropePath.test.ts`; o mutante espelho (`joint = to + t·(from − to)`) foi descartado porque os quatro testes do CLEAN-25 já o derrubam na perna das pontas. Probes apagados, nada commitado.
- 2026-10-02 Proxy decided: commit 1 só de testes com `Stage: implementing`, nascido verde; commit 2 só do ticket com `Stage: to-review`, os registros dos mutantes em Comments e o gate verde — a tabela de estágios mantém as duas transições separadas, e um commit 2 só do ticket passa na checagem do stage 3 de "nenhum arquivo de teste depois do commit só de testes".
- 2026-10-02 Proxy decided: `src/scene/ropePath.ts` entra em Primary files com o escopo "só as mutações do critério 5, revertidas, nunca commitadas", e o critério 4 exige que o `git diff --stat` do branch não mostre mudança nesse arquivo — a fronteira tem que dizer que o stage 2 o toca, e só um critério deixa o stage 3 reprovar mecanicamente uma mudança de produção commitada.
- 2026-10-02 Proxy decided: a regra 3 ganha teste, com o ângulo esperado calculado a partir da junção que o próprio `path` devolve (`atan2` da junção de `segments` menos o centro), não de um t = 1/2 fixo — isso deixa o teste da regra 3 independente da regra 1, e só o mutante (c) o derruba, não o (a).
- 2026-10-02 Proxy decided: três mutantes, um por regra, sem o mutante da projeção limitada — os testes do CLEAN-25 já o derrubam (mutante (a) daquele ticket, registrado lá).
- 2026-10-02 Proxy decided: três `it`, um por regra, cada um com `CLEAN-29` no nome; o critério pede que cada mutante derrube o teste da sua regra, e os outros podem cair junto — um teste por regra faz do vermelho de cada mutante o registro daquela regra.
- 2026-10-02 Proxy decided: `Blocked by: none` — o CLEAN-29 não commita produção; os testes dele ficam no bloco do PHY-54 e os do CLEAN-28 no bloco de `scenePath`; um conflito sai barato e as regras de rebase do stage 3 o resolvem.
- 2026-10-02 Proxy decided: `Difficulty: normal`, `Review: agent` — testes de comportamento existente numa função só, mutantes medidos de antemão.
