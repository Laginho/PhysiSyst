# PHY-71: Leituras de energia e momento no painel
Stage: done
Status: ready-for-agent
Blocked by: PHY-70
Review: agent
Difficulty: normal

- Primary files:
  - src/i18n/index.ts (`fmtNum` novo), src/i18n/i18n.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`readout.*` :132-146)
  - src/App.tsx (fieldset de leitura ~:2056-2120; `toFixed` em :575, :1836, :2062-2109; `displayedScene`/quadro exibido ~:836-839)
  - src/App.test.ts
  - src/sim/energy.ts (consumido)

#### What to build

O painel de leitura (220 px) ganha energia e momento, calculados pelo módulo do PHY-70 a partir do quadro exibido (o do cursor do slider ou o vivo), nunca de um cálculo próprio no `App`.

Formatação: `fmtNum(n: number, digits: number, lang: Lang): string` em `src/i18n/index.ts`, sobre `toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })`. Toda leitura nova usa `fmtNum`, e os `toFixed` existentes do painel (posição, |v|, |a|, componentes, F_el, Δx, T, velocidade de reprodução, L da corda) trocam para `fmtNum` com as mesmas casas, para o painel inteiro usar vírgula em pt-BR como o `t = 1,23 s` do slider. Avisos do simulador não mudam.

Bloco do corpo selecionado: dentro do `<details>` "ver mais" existente, três linhas novas depois das componentes: `E_c`, `E_pg`, `|p|` (J, J, kg·m/s).

Bloco "sistema", fieldset novo abaixo do de leitura, sempre visível (legenda `t('readout.system')` 'sistema' / 'system'): `E_c`, `E_pg`, `E_el` (só quando a cena tem molas), `E_mec` em negrito, `|p|`; um `<details>` com `p_x`, `p_y`. Sem corpos não fixos, mostra `t('readout.noData')`.

Chaves novas: `readout.system`, `readout.kinetic` ('E_c'), `readout.potential` ('E_pg'), `readout.elastic` ('E_el'), `readout.mechanical` ('E_mec'), `readout.momentum` ('|p|'), `readout.momentumX`, `readout.momentumY`. Símbolos como texto plano, como `F_el` hoje.

#### Acceptance criteria

1. `fmtNum(1.5, 2, 'pt-BR')` é `'1,50'`; `fmtNum(1.5, 2, 'en')` é `'1.50'`; `fmtNum(-0.004, 2, 'pt-BR')` é `'-0,00'` ou `'0,00'` (sem lançar).
2. Em pt-BR, nenhuma leitura do painel (posição, |v|, |a|, F_el, Δx, T, velocidade) contém `.` como separador decimal; em en, nenhuma contém `,`.
3. Com um corpo selecionado e um quadro com estado, o "ver mais" mostra `E_c`, `E_pg` e `|p|` com os valores de `bodyEnergy` daquele quadro, duas casas.
4. O bloco "sistema" existe sem corpo selecionado e mostra `E_c`, `E_pg`, `E_mec` e `|p|` de `systemEnergy`; `E_el` aparece só quando `scene.constraints` tem mola; `E_mec` é a linha em negrito.
5. Com o slider num registro anterior, os valores do sistema são os daquele registro (mudam ao mover o slider com a simulação pausada).
6. Chaves novas em pt-BR e en; paridade verde.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/i18n/i18n.test.ts`: critério 1 chamando `fmtNum` direto; vermelho hoje porque não existe.
- `src/App.test.ts`, com o simulador falso e o `requestAnimationFrame` controlado que o arquivo já usa: critérios 2 a 5; vermelhos hoje (não há bloco sistema, e o painel usa ponto). Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha. Testes existentes que fixam `'1.00'` e afins em pt-BR são ajustados no mesmo commit.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: linhas do corpo no "ver mais" e bloco "sistema" sempre visível com E_mec em negrito (220 px obrigam a divisão); `fmtNum` substitui também os `toFixed` existentes — um painel, uma convenção; símbolos em texto plano como F_el.

- Stage 2: inspected the polling readout, recorded/live frame selection, RopePanel and all toFixed consumers. Tests use the approved fmtNum and App DOM seams; edge cases include frame zero, no selection, empty and fixed-only scenes. Existing decimal expectations migrate with the tests. Initial focused red: fmtNum is not a function; body position received (6.10, 4.00), expected (6,10, 4,00); system fieldset absent; spring system reading empty.

- Test harness correction: the fixed/empty parameter was declared but its fixture conversion was missing after a CRLF-sensitive edit. Added the conversion in a separate test-only commit. Proved red by removing the production non-fixed-body guard: both cases fail, expected sem leitura, received E_mec: 0,00 J (2 failed / 4 passed in the PHY-71 focus). Restored production passes both.


#### Stage 2 implementation (2026-10-03)

- Added fmtNum and eight matching catalog keys; migrated all App readout toFixed calls, including rope length and both speed labels. Selected-body energy stays inside the existing details; the system fieldset is independent of selection, conditionally includes spring energy, emphasizes mechanical energy, and puts momentum components in details.
- The existing 100 ms poll calls the PHY-70 functions with the displayed scene and the selected recorded/live frame's states, constraints and pulleys. It uses the actual recorded state at cursor zero, even though drawing uses the document pose there. No energy formulas were duplicated in App; the magnitude of momentum is derived from the returned vector.
- Final focused green: 2 files, 6 passed / 160 skipped. Initial red before implementation: 6 failed / 160 skipped. Existing tests for spring force, extension, rope tensions, rope length, playback, scene replacement and historical readouts retain their assertions with localized decimals.

##### DOM mutate-verify evidence

All mutations were applied to production, run against the new PHY-71 tests, and restored before further work:

| New test | Production mutation | Red output |
| --- | --- | --- |
| localizes body, component and speed readings | fmtNum returns toFixed instead of toLocaleString | Expected (6,10, 4,00) m; received (6.10, 4.00) m. Focus: 4 failed / 2 passed (also fails direct fmtNum and energy formatting). |
| shows body energy inside more and system energy without selection | selected body energy forced to null | Expected E_c: 1,39 J inside details; received only velocity/acceleration. 1 failed / 5 passed. |
| uses recorded body and spring energy while paused, including frame zero | always use liveFrameRef instead of the cursor's record | Expected E_c: 0,04 J at frame 4; received E_c: 1,39 J from frame 10. 1 failed / 5 passed. |
| same historical-energy test | pass [] instead of the frame constraints to systemEnergy | Expected E_el: 0,05 J; received E_el: 0,00 J. 1 failed / 5 passed. |
| shows no data for a fixed system | remove scene.bodies.some(b => !b.fixed) guard | Expected sem leitura; received E_mec: 0,00 J. Both edge cases fail (2 failed / 4 passed). |
| shows no data for an empty system | same non-fixed-body guard removal | Expected sem leitura; received E_mec: 0,00 J. Both edge cases fail (2 failed / 4 passed). |

- Direct fmtNum mutation: toFixed returns 1.50 instead of expected 1,50. The original missing-export red is in the test-only commit.
- Sandbox gate: 1063 passed / 15 failed, all 15 failures are Chromium DevTools connection/disconnection errors. Retried the complete gate outside the sandbox.

- Final gate outside the sandbox: 32 test files / 1078 tests passed; lint, typecheck and build all exit 0. Existing Vite large-chunk warning remains. Final diff review and git diff --check passed; only Primary files and this ticket changed. Tests remain in separate commits (034cb48, dc7bf42), with no tests in the production commit. No manual visual session was performed; the existing Chromium layout suite passed. Ready for independent stage 3; no merge or push in stage 2.

#### Resolution (2026-10-03)

Verdict: Approve

Os seis critérios escritos passam para quadros vivos e gravados válidos. Merge local sem squash `e484370` na sessão `sweatshop/2026-10-03-1618`; a árvore do merge é idêntica à implementação validada `68957e2`. Este fechamento registra `Stage: done`, resolução e ledger juntos. O achado abaixo fica no CLEAN-30 para stage 1: os critérios não definem a leitura enquanto o mundo aguarda reconstrução, e a revisão não acrescenta uma política ao contrato.

##### Standards

Uma revisão independente encontrou um problema de correção em `src/App.tsx:976-982`: a leitura nova não verifica `pendingRebuildRef`. Após uma troca de cena cujo `replaceScene` falha, `resetRecording` chama `captureFrame`, que pode recuperar estados da cena anterior via `sim.readStates()`. A energia então combina o documento novo com esses estados antigos. O achado foi associado à coerência das leituras e à cobertura de regressões do quality gate do AGENTS.md. Corrigir esse caminho exige um teste de DOM; não é um pequeno fix permitido ao stage 3.

Nenhuma violação de Primary files ou da separação entre testes e produção; nenhum smell acionável. `034cb48` e `dc7bf42` contêm somente testes e o ticket; `68957e2` contém somente produção e o ticket. O segundo commit corrige o harness, conforme a exceção explícita do fluxo.

##### Spec

Uma revisão independente aprovou todos os critérios para quadros válidos e classificou o mesmo achado como lacuna fora dos critérios numerados. A cinemática existente continua correta nesses caminhos; o comportamento da energia sem estado válido para o documento atual precisa de contrato próprio, registrado em CLEAN-30.

1. ✅ `fmtNum`: precisão, pt-BR/en e arredondamento perto de zero cobertos diretamente.
2. ✅ Todos os `toFixed` de leitura do App migrados com as mesmas casas, incluindo componentes, molas, cordas e as duas etiquetas de velocidade.
3. ✅ Energia do corpo vem de `bodyEnergy` do quadro escolhido, dentro do details existente, com duas casas.
4. ✅ Sistema independente da seleção, calculado por `systemEnergy`; E_el condicionado à presença de mola, E_mec em strong, componentes de p no details e ausência de dados em cenas vazias/fixas.
5. ✅ Estados, vínculos e polias do registro escolhido, incluindo zero; seek pausado modifica os valores e preserva o mundo vivo.
6. ✅ Oito chaves presentes nos dois catálogos; testes de paridade verdes.

##### Inspeção e verificação independente

- Examinados: todos os hunks e consumidores de `fmtNum`/RopePanel; polling do corpo e sistema; captureFrame/showFrame/resetRecording; edição estrutural e ao vivo; reset, importação, troca de cena/preset, boot/retry e falhas de rebuild; seek, replay e limite de gravação; cenas vazias/fixas; presença de molas e agregação de polias. Não houve passe visual manual nem perfil de desempenho; a suíte existente de layout em Chromium passou.
- A linha `Proxy decided` do stage 1 foi conferida: energias do corpo no details, sistema sempre visível, E_mec em negrito, símbolos em texto plano e uma convenção numérica para as leituras existentes. Não foi alterada.
- Gate executado antes da revisão e novamente após rebase sem mudanças: **32 arquivos / 1078 testes passed**; lint, typecheck e build exit 0. Permanece o aviso existente de chunk maior que 500 kB.
- Reexecutadas as cinco mutações documentadas, na produção real, uma por vez: formatter com toFixed → **4 failed / 2 passed / 160 skipped**; energia do corpo nula → **1 failed / 5 passed / 160 skipped**; quadro vivo em vez do histórico → **1 failed / 5 passed / 160 skipped**; estados de mola omitidos → **1 failed / 5 passed / 160 skipped**; guard de corpos não fixos removido → **2 failed / 4 passed / 160 skipped**. Os vermelhos repetiram as saídas do stage 2. Arquivos restaurados byte a byte em finally; foco restaurado **6 passed / 160 skipped**.
- Sondagens temporárias de DOM confirmaram o CLEAN-30: editar y de 4 para 5 em t0 mostra posição (6,00, 5,00), mas E_pg permanece 40,00 J com m=1/g=10; troca de cena que falha mostra velocidade 2,00 m/s, mas E_c=12,50 J e |p|=5,00 da cena anterior. Asserções diagnósticas: **2 failed / 135 skipped**; instrumentação restaurada antes do gate final. Os valores 50,00 J e 2,00 J usados nas sondagens mostram a inconsistência, não impõem uma política de fallback ao novo ticket.
- Nenhuma mudança permanente de produção ou teste nesta revisão. `git diff --check` verde; sem expansão do contrato do PHY-71. Standards: **1 achado de correção**; Spec: **1 achado de cleanup, 0 critérios reprovados**. Ambos apontam para a coerência das leituras enquanto não há mundo válido, preservados separadamente acima.
