# PHY-69: Presets de colisão elástica e inelástica
Stage: done
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

- 2026-10-03 Stage 2 concluído na retomada: gate completo **1072 passed (1072), 32 arquivos passed (32)**; lint, typecheck e build com exit 0. Execução fora do sandbox após a execução focada restrita apresentar 2 desconexões do Chromium (186 passed / 2 failed); nenhuma falha no gate final. Build mantém o aviso de chunk acima de 500 kB.
- Diff final revisado contra a base da sessão: somente Primary files e histórico do ticket; nenhuma alteração de produção adicional nesta retomada. Teste da galeria isolado em `77c3b01`, com vermelho por mutação registrado abaixo e verde no gate completo. Implementação e provas anteriores preservadas em `ebbcdfe` / `7debab0`; merge `f65b776` incorpora a autorização do planner e o PHY-70 já concluído. Pronto para stage 3, sem revisão ou merge de encerramento nesta sessão.

- 2026-10-03 Retomada stage 2: integrada a base da sessão, preservando os commits `ebbcdfe` e `7debab0` e a autorização do planner. Atualizada somente a linha autorizada da expectativa da galeria.
- Mutate-verify da expectativa DOM `agrupa por nó na ordem do livro, com os presets na ordem declarada, e só nós com preset aparecem`: substituído temporariamente `src/presets/index.ts` pela versão da base `sweatshop/2026-10-03-1618` (sem os presets de colisão). `npm test -- src/App.test.ts -t 'agrupa por nó na ordem do livro'`: **1 failed / 130 skipped (131)**, `AssertionError` em `src/App.test.ts:1851`, grupo esperado `Mecânica / Dinâmica / Colisões` com `Colisão elástica` e `Colisão inelástica` ausente do recebido. Produção restaurada integralmente após o vermelho.

- 2026-10-03 Stage 2: PHY-68 está `done` na base `sweatshop/2026-10-03-1618`. Costura: catálogo público de presets → codec → simulador real. Consumidores examinados: `galleryGroups`, `presetById`, `createPresetScene` e seus usos em `App.tsx`; nenhum muda de assinatura. Casos de fronteira: e = 1, e = 0,5, esfera inicialmente parada e chão sem par declarado. Testes existentes preservam os presets anteriores, persistência e traduções.
- Red antes de produção: `npm test -- src/presets/presets.test.ts`: 5 failed / 23 passed (28). Catálogo esperava 14 e recebeu 12; tópico `colisoes` ausente; `missing preset collision-elastic` e `missing preset collision-inelastic`.

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: uma família de dois presets (e = 1 e e = 0,5), esferas iguais de 1 kg, uma parada; sem par com o chão; forma fechada e = 1 → 0 e 3, e = 0,5 → 0,75 e 2,25; tolerância 3% como o teste frontal existente; tópico 'colisoes' em dinâmica.

- Implementados builder único `collision(e)`, presets nas posições 1/2 e traduções pt-BR/en. `npm test -- src/presets/presets.test.ts src/i18n/i18n.test.ts`: 57 passed (57).
- Mutate-verify dos três testes novos (`npm test -- src/presets/presets.test.ts -t 'PHY-69'`): posição do preset elástico alterada de 1 para 2 → teste `lists elastic then inelastic...` falhou com `position: expected 1, received 2`; restituição do builder substituída por `e * 0` → `collision-elastic round-trips...` falhou com `expected 1.5 to be less than or equal to 0.09`; `collision-inelastic round-trips...` falhou com `expected 0.75 to be less than or equal to 0.0225`. Resultado: 3 failed / 25 skipped (28). Todas as mutações revertidas antes do gate.
- Bloqueio de escopo: o teste DOM existente `src/App.test.ts:1850`, `agrupa por nó na ordem do livro, com os presets na ordem declarada, e só nós com preset aparecem`, fixa todos os grupos da galeria e precisa incluir `{ node: 'Mecânica / Dinâmica / Colisões', presets: names('collision-elastic', 'collision-inelastic') }` antes de MHS. Esse arquivo/costura não consta dos Primary files. Solicitação para stage 1: autorizar apenas a atualização dessa expectativa e seu mutate-verify, mantendo os critérios atuais. Proxy localizado em `~/.claude/agents/proxy.md`, mas seu modelo `opus` não está disponível entre os agentes deste runtime; nenhuma decisão foi atribuída ao proxy.
- Gate: primeira execução restrita teve 16 falhas, 15 por conexão/desconexão do Chromium. Reexecução fora do ambiente restrito: **1060 passed / 1 failed (1061), 30 arquivos passed / 1 failed (31)**; única falha é a expectativa da galeria descrita acima. Os três testes novos passam com produção restaurada. Não promover a `to-review` antes de corrigir essa expectativa com o escopo autorizado e repetir o gate.
- Validações restantes: `npm run lint`, `npm run typecheck` e `npm run build` passaram (exit 0). Build emitiu apenas aviso de chunks maiores que 500 kB. Diff revisado, limitado aos Primary files e ao registro deste ticket; testes seguem somente no commit vermelho `ebbcdfe`.
- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-69-presets-de-colisao-asked-20261003-1743`): PHY-69 implementado e commitado, mas marcado `blocked`. /  / - Presets elástico/inelástico e traduções adicionados. / - Testes novos verificados por mutação. / - Gate: 1060 passaram; 1 falhou por expectativa antiga da galeria. Lint, typecheck e build passaram. / - Commits: `ebbcdfe`, `7debab0`. /  / Autoriza atualizar essa expectativa em [src/App.test.ts](/D:/Desktop/Projects/PhysiSyst/src/App.test.ts:1850)? /  / A [ticket-flow](/C:/Users/Lage/.agents/skills/ticket-flow/SKILL.md) exige “the implementer may touch those files and nothing else”; esse arquivo está fora dos `Primary files`, e o proxy configurado está indisponível.
- Proxy decided: sim, atualizar a expectativa fixada da galeria em src/App.test.ts, só inserindo a entrada 'Mecânica / Dinâmica / Colisões' na ordem do livro, em commit test-only próprio (vermelho contra a base da sessão); retomar da branch `asked/phy69-presets-colisao-20261003-1743` (`ebbcdfe`, `7debab0`) — o teste enumera todos os nós com preset, então o critério 1 o quebra por construção; é consequência do contrato, não defeito dele, e a edição é de uma linha e reversível.

#### Stage 3 review (2026-10-03)

Verdict: Approve

- Base fixada: `2009208` (`sweatshop/2026-10-03-1618`); implementação revisada em `42aa1f8`. `git rebase --rebase-merges sweatshop/2026-10-03-1618` concluído sem conflitos e sem alteração do diff. Revisões Standards e Spec realizadas por agentes separados, em paralelo; gate executado pelo revisor principal.

##### Standards

- Um achado documental corrigido: `README.md` ainda anunciava doze cenas. A linha agora anuncia quatorze e inclui os presets de colisão elástica/inelástica. Correção permitida pela regra do ticket-flow para documentação tornada obsoleta pelo ticket, sem mudança de comportamento ou necessidade de novo teste.
- Nenhuma outra violação documentada ou smell identificado. Diff de produção e testes limitado aos Primary files. `ebbcdfe` é o commit de testes vermelho, anterior à produção de `7debab0`; esse commit de produção não toca testes. `77c3b01` contém exclusivamente a expectativa DOM autorizada e histórico do ticket; `f65b776` integra a base da sessão sem ampliar o escopo.

##### Spec

1. ✅ Nó `mecanica/dinamica/colisoes`, posições 1/2 e ordem da galeria corretos.
2. ✅ Preset elástico simulado até 3 s, com |vx₁| ≤ 0,09 e vx₂ = 3 ± 3%.
3. ✅ Preset inelástico simulado até 3 s, com vx₁ = 0,75 ± 3% e vx₂ = 2,25 ± 3%.
4. ✅ Ambos conservam momento horizontal 3 ± 3% e mantêm |vy| ≤ 0,05 para cada esfera.
5. ✅ Ambos fazem round-trip pelo codec; o helper `load` simula a cena decodificada. Os 14 presets também passam na verificação existente de round-trip, simulação e ausência de avisos inesperados.
6. ✅ Cinco chaves novas presentes em pt-BR/en; paridade e presença de chaves derivadas do catálogo passaram no gate.

- Builder único `collision(e)` coincide com a cena aprovada: chão padrão, esferas de 1 kg e raio 0,5 em x = 3/8 e y = 0,5, vx inicial 3/0, g = 9,81, forças vazias e somente o Contact entre esferas. Nenhum requisito ausente, implementação incorreta ou ampliação de escopo.
- Consumidores examinados: `galleryGroups`, `nodeLabelKeys`, `presetById`, `createPresetScene`, renderização/abertura/restauração/materialização dos presets em `App.tsx`, codec e construção dos colisores no simulador. Caminhos de falha examinados: ID de preset ausente, referências inválidas/avisos do codec e falha/rollback de persistência. Interações examinadas: idiomas, ordenação, cenas persistidas, velocidade inicial, atrito zero e restituição Multiply com fator zero no chão. Fronteiras e = 1/e = 0,5 e esfera inicialmente parada cobertas pelos testes reais. Nenhum E2E adicional específico de abrir/copiar/editar os dois presets foi executado; os fluxos reutilizam consumidores existentes, revisados por leitura e cobertos pela suíte geral.
- Decisões do planner examinadas: `Proxy decided` sobre a família física, tolerâncias e tópico, coerente com o builder e ADR-0005; `Proxy decided` autorizando somente a linha da expectativa DOM, incorporada aos Primary files e aplicada em commit test-only separado. Nenhuma decisão pendente.
- Provas vermelho/verde de stage 2 examinadas: catálogo sem os presets → 5 failed / 23 passed (28); mutações de posição e restituição → 3 failed / 25 skipped (28), com falhas específicas registradas acima; retirada dos presets na costura DOM → 1 failed / 130 skipped (131), grupo Colisões ausente. Os testes exercitam produção e simulador reais, sem cópia da lógica. Não houve novo teste nem alteração de produção em stage 3.
- Gate independente de stage 3, após rebase, fora do sandbox para os testes com Chromium: **1072 passed (1072), 32 arquivos passed (32)**; `npm run lint`, `npm run typecheck` e `npm run build` com exit 0. Build mantém somente o aviso existente de chunks maiores que 500 kB. `git diff --check` passou.

#### Resolution (2026-10-03)

Verdict: Approve

- Critérios 1–6 atendidos. Presets de colisão elástica e inelástica integrados à sessão `sweatshop/2026-10-03-1618` pelo merge sem squash `94a9fe3`. Ticket fechado e ledger atualizado no mesmo commit de encerramento.
- Arquivos: `src/presets/index.ts`, `src/presets/presets.test.ts`, `src/i18n/pt-BR.ts`, `src/i18n/en.ts` e a linha autorizada de `src/App.test.ts`. Única correção da revisão: contagem/exemplos da galeria no `README.md`, commit documental `72603d7`.
- Prova vermelho/verde preservada: `ebbcdfe` (5 failed / 23 passed antes da produção), `7debab0` (implementação), `77c3b01` (expectativa DOM em commit separado). Mutações de posição/restituição e retirada dos presets no DOM falharam com as saídas específicas registradas em Comments; produção restaurada e todos os testes verdes no gate independente de stage 3.
- Gate: **32 arquivos passed (32), 1072 testes passed (1072)**; lint, typecheck e build com exit 0. Merge sem conflitos, preservando a árvore validada. Nenhuma mudança de produção ou teste feita pela revisão.
- Ressalva: aviso existente de chunk de build maior que 500 kB; não bloqueia o gate. Limites da inspeção e decisões do planner registrados no review acima.
