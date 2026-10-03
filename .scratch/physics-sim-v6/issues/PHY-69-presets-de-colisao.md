# PHY-69: Presets de colisão elástica e inelástica
Stage: blocked
Status: ready-for-agent
Blocked by: PHY-68
Review: agent
Difficulty: normal

- Primary files:
  - src/presets/index.ts (`TREE` :14-20, builders como `projectileLaunch` ~:121-131, lista de presets :287-300)
  - src/presets/presets.test.ts (`load`, `body`, `run` ~:254-302 como helpers)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`tree.mecanica.dinamica.colisoes`, `preset.collision-elastic.*`, `preset.collision-inelastic.*`)

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

- 2026-10-03 Stage 2: PHY-68 está `done` na base `sweatshop/2026-10-03-1618`. Costura: catálogo público de presets → codec → simulador real. Consumidores examinados: `galleryGroups`, `presetById`, `createPresetScene` e seus usos em `App.tsx`; nenhum muda de assinatura. Casos de fronteira: e = 1, e = 0,5, esfera inicialmente parada e chão sem par declarado. Testes existentes preservam os presets anteriores, persistência e traduções.
- Red antes de produção: `npm test -- src/presets/presets.test.ts`: 5 failed / 23 passed (28). Catálogo esperava 14 e recebeu 12; tópico `colisoes` ausente; `missing preset collision-elastic` e `missing preset collision-inelastic`.

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: uma família de dois presets (e = 1 e e = 0,5), esferas iguais de 1 kg, uma parada; sem par com o chão; forma fechada e = 1 → 0 e 3, e = 0,5 → 0,75 e 2,25; tolerância 3% como o teste frontal existente; tópico 'colisoes' em dinâmica.

- Implementados builder único `collision(e)`, presets nas posições 1/2 e traduções pt-BR/en. `npm test -- src/presets/presets.test.ts src/i18n/i18n.test.ts`: 57 passed (57).
- Mutate-verify dos três testes novos (`npm test -- src/presets/presets.test.ts -t 'PHY-69'`): posição do preset elástico alterada de 1 para 2 → teste `lists elastic then inelastic...` falhou com `position: expected 1, received 2`; restituição do builder substituída por `e * 0` → `collision-elastic round-trips...` falhou com `expected 1.5 to be less than or equal to 0.09`; `collision-inelastic round-trips...` falhou com `expected 0.75 to be less than or equal to 0.0225`. Resultado: 3 failed / 25 skipped (28). Todas as mutações revertidas antes do gate.
- Bloqueio de escopo: o teste DOM existente `src/App.test.ts:1850`, `agrupa por nó na ordem do livro, com os presets na ordem declarada, e só nós com preset aparecem`, fixa todos os grupos da galeria e precisa incluir `{ node: 'Mecânica / Dinâmica / Colisões', presets: names('collision-elastic', 'collision-inelastic') }` antes de MHS. Esse arquivo/costura não consta dos Primary files. Solicitação para stage 1: autorizar apenas a atualização dessa expectativa e seu mutate-verify, mantendo os critérios atuais. Proxy localizado em `~/.claude/agents/proxy.md`, mas seu modelo `opus` não está disponível entre os agentes deste runtime; nenhuma decisão foi atribuída ao proxy.
- Gate: primeira execução restrita teve 16 falhas, 15 por conexão/desconexão do Chromium. Reexecução fora do ambiente restrito: **1060 passed / 1 failed (1061), 30 arquivos passed / 1 failed (31)**; única falha é a expectativa da galeria descrita acima. Os três testes novos passam com produção restaurada. Não promover a `to-review` antes de corrigir essa expectativa com o escopo autorizado e repetir o gate.
- Validações restantes: `npm run lint`, `npm run typecheck` e `npm run build` passaram (exit 0). Build emitiu apenas aviso de chunks maiores que 500 kB. Diff revisado, limitado aos Primary files e ao registro deste ticket; testes seguem somente no commit vermelho `ebbcdfe`.
