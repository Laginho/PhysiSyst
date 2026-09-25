# PHY-28: Editor II — ferramentas Polia e Corda
Stage: to-review
Status: ready-for-agent
Blocked by: PHY-25, PHY-27
Review: agent

- Primary files:
  - `src/editor/doc.ts`, `src/editor/doc.test.ts` (adicionar, editar e remover polia e corda)
  - `src/editor/hitTest.ts`, `src/editor/hitTest.test.ts` (acertar polia e corda)
  - `src/App.tsx`, `src/App.test.ts`
  - `src/render/draw.ts` (destaque de seleção)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

O aluno monta Atwood, polia móvel e talha à mão. **Polia**: um clique num corpo monta uma polia na âncora do snap, com raio padrão. **Corda**: clique na âncora A, depois nas polias na ordem por onde a corda passa, depois na âncora B (um corpo, não uma polia, termina a corda); Esc cancela. Clicar numa polia ou corda seleciona. Inspetor da polia: raio e massa. Inspetor da corda: o caminho e `L` somente leitura. Delete remove o selecionado com dependentes (remover polia leva as cordas que passam por ela). Tudo desfazível. Com a corda selecionada durante o playback, o painel mostra `T` — ou `T₁`, `T₂`… por segmento quando alguma polia do caminho tem massa — e "frouxa" quando `T = 0` por folga.

#### Acceptance criteria

1. Ferramenta Polia: um clique num corpo cria uma polia na âncora do Anchor snap; clique fora de corpo é ignorado
2. Ferramenta Corda: A → polias → B cria uma corda com `via` na ordem clicada; clicar na mesma polia duas vezes seguidas é ignorado; Esc cancela sem mexer no doc; sem polia e com B = A, nada é criado
3. Inspetor da polia edita raio e massa; inspetor da corda mostra o caminho e `L` (de `ropePath`) sem campo editável
4. Remover polia remove as cordas que passam por ela; remover corpo remove polias montadas, cordas e molas presas e cordas pelas polias removidas; Ctrl+Z restaura tudo de uma vez
5. Clicar em polia ou corda seleciona; Delete remove o selecionado
6. Leitura com corda selecionada: `T`; `T₁`, `T₂`… com polia de massa no caminho; "frouxa" quando for o caso
7. Strings novas nos dois catálogos
8. Verificação live em browser: montar Atwood à mão (teto fixo, polia, dois blocos, corda), play, `T` no painel bate com `2m₁m₂g/(m₁+m₂)`
9. Testes novos no `App.test.ts` com mutação aplicada e saída vermelha registradas em `## Comments` (AGENTS.md)
10. Gate verde

#### Verification

    npx vitest run src/editor src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/doc.test.ts`: operações de polia e corda e a cascata de dependentes (4).
- `src/editor/hitTest.test.ts`: acerto em polia e em segmento de corda (5).
- `src/App.test.ts`, nos espelhos: as duas ferramentas, cancelamento, seleção, Delete, undo, leitura (1, 2, 4, 5, 6). Vermelho porque as ferramentas não existem.

## Comments

- 2026-09-24 (review do PHY-27, stage 3) A seleção no `App.tsx` são duas strings anuláveis (`selectedId`, `selectedSpringId`) com "uma limpa a outra" à mão em seis lugares; polia e corda vão repetir o padrão. CLEAN-06 (bloqueado por este) unifica depois; aqui, seguir o padrão do PHY-27 e limpar as outras seleções em cada ponto que seleciona, inclusive o drop na lixeira em `onPointerUp`, que hoje limpa só o corpo.
- 2026-09-24 (stage 2) Escolhas de implementação, para a revisão:
  - A seleção segue o padrão à mão, como pede o comentário acima, agora com três ids: corpo, vínculo (`selectedSpringId` virou `selectedConstraintId`, que vale para mola e corda, porque as duas vivem em `constraints` com um só espaço de ids) e polia. Todo ponto que seleciona limpa os outros dois, inclusive o drop na lixeira.
  - Uma só `Tool` (mola, polia, corda) no lugar da `SpringTool`; Esc cancela qualquer uma. `armTool` e `finishTool` fazem o que cada botão da paleta e cada ferramenta faziam à mão.
  - Uma polia ganha do corpo em que está montada no clique: ela é desenhada por cima, e uma polia no centro de um bloco pequeno o cobriria inteiro se o corpo ganhasse. O corpo continua ganhando de uma ponta de mola ou corda ancorada nele (a regra do PHY-27), e as linhas são escolhidas onde cruzam o espaço livre. Na ferramenta Corda, uma polia nunca é ponta: antes da âncora A o clique nela é ignorado.
  - Polia nova nasce com raio `0,25 m` (`PULLEY_DEFAULT_RADIUS`), sem massa, na âncora do snap. O inspetor da polia aplica as mesmas travas do painel do corpo e do módulo da força (`minDimension` no raio, `max(0, ·)` na massa), então nenhum valor digitado gera um doc que o codec recusa, sem abrir outra exceção na doutrina do `doc.ts`.
  - `addRope` recusa o que o codec recusa: corpo inexistente, polia inexistente (`error.poliaInexistente`), a mesma polia duas vezes seguidas (`error.poliaRepetida`), corda sem polia com as duas pontas no mesmo corpo. A ferramenta já filtra os dois últimos antes de chamar, então pela interface essas duas mensagens não aparecem.
  - `T₁`, `T₂`… aparecem quando alguma polia de `via` tem `mass > 0` no documento (o critério 6 fala de "polia de massa no caminho"), lidos de `segments`; sem massa, `T` é `tension`. "frouxa" vem de `slack`. Com uma polia selecionada o painel de leitura mostra "sem leitura": o simulador não dá leitura de polia.
  - O inspetor da corda mostra o caminho como `a → polias → b` pelos ids e `L` como texto, de `scenePath(doc, corda).length` (o `ropePath` nas poses do documento).
- 2026-09-24 (stage 2) Mutate-verify dos testes novos do `App.test.ts` (critério 9). Cada mutação em `src/App.tsx`, revertida depois; saída do `npx vitest run src/App.test.ts -t "PHY-28"` (11 testes):
  1. Polia sem snap (`worldToLocal(hit, w)` no lugar de `anchor`) → 2 vermelhos, `expected 'cordacaminho: bloco1 → polia → bloco2…' to contain 'L: 7.885 m'`.
  2. Clique fora de corpo cancela a ferramenta → 1 vermelho ("Polia: um clique…"), `expected undefined to be defined`.
  3. `via` invertido → 1 vermelho, `expected 'cordacaminho: bloco1 → polia → polia-…' to contain 'bloco1 → polia-2 → polia → bloco2'`.
  4. Polia repetida em seguida não ignorada → 1 vermelho ("clicar na mesma polia…"), a corda não nasce (`addRope` recusa) e o painel falta.
  5. Esc sem o ramo da ferramenta → 1 vermelho ("Esc no meio da corda…"), `expected undefined to be defined`. Verde na base: guarda de regressão, como o do PHY-27.
  6. B = A sem polia encerra a ferramenta em vez de ignorar → 1 vermelho ("sem polia, clicar em B = A…"), o painel `corda` falta.
  7. Campo raio gravando massa → 1 vermelho, `expected 0.25 to be 0.3`.
  8. `L` com um `<input>` no painel → 1 vermelho, `expected <input></input> to have a length of +0 but got 1`.
  9. `L` da linha reta, sem as polias → 2 vermelhos, `to contain 'L: 7.885 m'`.
  10. Delete da polia deixa as cordas por ela → passou na primeira versão: a corda com `via` pendente some do canvas (o `scenePath` dela é nulo), então nenhum clique a encontra. O teste passou a criar uma corda nova depois do Delete e a exigir o id `corda` (commit 067f532) e aí `expected undefined to be defined`.
  11. Delete da polia sem passo de undo (`setDoc` no lugar de `commitDoc`) → 1 vermelho, `expected undefined to be defined`.
  12. Delete do corpo só filtra `bodies` → passou na primeira versão, pelo mesmo motivo do 10 (polia sem corpo e corda sem caminho não aparecem). O teste passou a criar polia, corda e mola novas depois do Delete e a exigir os ids sem sufixo (commit 067f532) e aí `expected undefined to be defined`.
  13. Clique na polia nunca seleciona → 5 vermelhos, `Error: missing panel polia` e outros.
  14. Clique na corda nunca seleciona (só `springAtPoint`) → 5 vermelhos.
  15. Delete ignora a polia → 1 vermelho, `expected <fieldset …(1)>…(4)</fieldset> to be undefined`.
  16. Delete da corda leva também a primeira polia → 1 vermelho ("clicar na corda seleciona…"), `expected undefined to be defined`.
  17. `T` por segmento nunca → 1 vermelho, `expected 'leitura — cordapassos: 140…' to contain 'T₁: 12.00 N'`.
  18. `T` por segmento sempre → 1 vermelho, `expected 'leitura — cordapassos: 144…' to contain 'T: 13.08 N'`.
  19. "frouxa" nunca aparece → 1 vermelho, `to contain 'frouxa'`.
  20. Leitura da corda sempre nula → 2 vermelhos, `to contain 'T: 13.08 N'` e `to contain 'T₁: 12.00 N'`.
- 2026-09-24 (stage 2) Verificação live (critério 8), Chromium headless pelo `src/test/browser.ts`, a 1280 px, num teste descartável não commitado: "nova cena" (chão fixo), três retângulos pelo inspetor: teto fixo 4 × 0,5 em (6, 7), bloco `m₁ = 1 kg` 1 × 1 em (5, 3), bloco `m₂ = 2 kg` 1 × 1 em (7, 3). Ferramenta polia com clique em (6,02, 6,78), snap no meio da face de baixo (6, 6,75); raio mudado para 1 no inspetor. Ferramenta corda: bloco 1 perto do meio da face de cima, a polia, bloco 2 idem. Inspetor da corda: `retangulo-2 → polia → retangulo-3`, `L: 9.642 m` (teoria `2 · 3,25 + π · 1` = 9,642). Play com a corda selecionada, leitura a cada 100 ms: `T: 13.08 N` dos passos 2 a 71 (teoria `2m₁m₂g/(m₁+m₂)` = 2 · 1 · 2 · 9,81 / 3 = 13,08 N); no passo 78 `T: 0.00 N` e "frouxa": o bloco 2 chegou ao chão (2,5 m a `g/3` levam ≈ 1,24 s ≈ 74 passos) e o bloco 1 segue subindo, então a corda afrouxa.
- 2026-09-24 (stage 2) Gate: `npm test` 30 arquivos, 642 testes verdes; `npm run lint`, `npm run typecheck` limpos; `npm run build` ok (só o chunk tardio `sim` acima de 500 kB, já documentado no PHY-32).
