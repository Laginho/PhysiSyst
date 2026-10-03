# PHY-69: Presets de colisão elástica e inelástica
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-68
Review: agent
Difficulty: normal

- Primary files:
  - src/presets/index.ts (`TREE` :14-20, builders como `projectileLaunch` ~:121-131, lista de presets :287-300)
  - src/presets/presets.test.ts (`load`, `body`, `run` ~:254-302 como helpers)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`tree.mecanica.dinamica.colisoes`, `preset.collision-elastic.*`, `preset.collision-inelastic.*`)
  - src/App.test.ts (só a expectativa fixada em `agrupa por nó na ordem do livro…`, describe 'galeria em árvore (PHY-31)': inserir a entrada `Mecânica / Dinâmica / Colisões` com `names('collision-elastic', 'collision-inelastic')` na ordem do livro, entre `campo gravitacional uniforme` e `Ondulatória / MHS`; nada mais nesse arquivo)

#### What to build

Dois presets novos no tópico novo `colisoes` (mecânica → dinâmica): `collision-elastic` (posição 1, `e = 1`) e `collision-inelastic` (posição 2, `e = 0.5`). Um builder só, parametrizado por `e`.

Cena: `groundBody()` como nos outros presets; dois círculos de 1 kg, r = 0,5, apoiados no chão (y = raio), `esfera-1` em x = 3 com `vx = 3`, `esfera-2` em x = 8 parada; um `Contact` `{a: 'esfera-1', b: 'esfera-2', muS: 0, muK: 0, e}`; nenhum par com o chão (par não declarado → atrito 0 e r = 0 automaticamente, então as esferas deslizam sem girar e não quicam no chão). g padrão.

Nomes: 'Colisão elástica' / 'Elastic collision', 'Colisão inelástica' / 'Inelastic collision'; descrições de uma linha com o valor de `e`.

#### Acceptance criteria

1. `TREE` tem `{area: 'mecanica', part: 'dinamica', topic: 'colisoes'}` e os dois presets apontam para ele com posições 1 e 2.
2. `collision-elastic`: depois da colisão (por volta de t = 2 s; ler em t = 3 s), `esfera-1` tem |v_x| ≤ 0,09 e `esfera-2` tem v_x = 3 ± 3%.
3. `collision-inelastic`: em t = 3 s, `esfera-1` tem v_x = 0,75 ± 3% e `esfera-2` v_x = 2,25 ± 3%.
4. Em ambos, o momento total em x em t = 3 s é 3 ± 3% e |v_y| de cada esfera ≤ 0,05 (não quicou no chão).
5. `parse(serialize(buildScene()))` roda sem erro para os dois (como os outros presets já testam).
6. Chaves i18n presentes em pt-BR e en; paridade dos catálogos verde.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/presets/presets.test.ts`: critérios 1 a 5 com `load`/`run`; vermelhos hoje porque os presets não existem. Chamam o simulador direto; não é costura de DOM.
- `src/i18n/i18n.test.ts`: critério 6 já é coberto pela paridade existente.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: uma família de dois presets (e = 1 e e = 0,5), esferas iguais de 1 kg, uma parada; sem par com o chão; forma fechada e = 1 → 0 e 3, e = 0,5 → 0,75 e 2,25; tolerância 3% como o teste frontal existente; tópico 'colisoes' em dinâmica.

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-69-presets-de-colisao-asked-20261003-1743`): PHY-69 implementado e commitado, mas marcado `blocked`. /  / - Presets elástico/inelástico e traduções adicionados. / - Testes novos verificados por mutação. / - Gate: 1060 passaram; 1 falhou por expectativa antiga da galeria. Lint, typecheck e build passaram. / - Commits: `ebbcdfe`, `7debab0`. /  / Autoriza atualizar essa expectativa em [src/App.test.ts](/D:/Desktop/Projects/PhysiSyst/src/App.test.ts:1850)? /  / A [ticket-flow](/C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige “the implementer may touch those files and nothing else”; esse arquivo está fora dos `Primary files`, e o proxy configurado está indisponível.
- Proxy decided: sim, atualizar a expectativa fixada da galeria em src/App.test.ts, só inserindo a entrada 'Mecânica / Dinâmica / Colisões' na ordem do livro, em commit test-only próprio (vermelho contra a base da sessão); retomar da branch `asked/phy69-presets-colisao-20261003-1743` (`ebbcdfe`, `7debab0`) — o teste enumera todos os nós com preset, então o critério 1 o quebra por construção; é consequência do contrato, não defeito dele, e a edição é de uma linha e reversível.
