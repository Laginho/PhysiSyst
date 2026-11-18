# PHY-68: Restituição no simulador por fatores por corpo
Stage: done
Status: ready-for-agent
Blocked by: PHY-67
Review: human
Difficulty: hard

- Primary files:
  - src/sim/simulator.ts (`assignPairFrictions` ~:683-782 como modelo; `colliderDescFor` ~:784-804 com `setRestitution(0)` :800; aros de polia ~:909-916; `build` ~:844-988 onde os avisos são coletados)
  - src/sim/acceptance.test.ts (teste de esferas frontais ~:325-396 como modelo; fica intacto)
  - src/sim/contacts.test.ts (testes de `assignPairFrictions` como modelo)
  - docs/adr/0005-restitution-on-contact-pairs.md (novo)
  - docs/adr/0003-friction-on-contact-pairs.md (referenciado, não editado)

#### What to build

O Rapier só tem restituição por colisor mais uma regra de combinação. O `e` do par (PHY-67) vira um fator `r` por corpo com a regra **Multiply**: `e_par = r_a · r_b`. Corpo sem nenhum par com `e` declarado tem `r = 0`, então toda colisão não declarada continua inelástica como hoje.

Solve (função pura `assignPairRestitutions(scene)` ao lado de `assignPairFrictions`, mesma forma de retorno `{ factor, useMinFallback, warnings }`): arestas = pares declarados com `e > 0`; sistema linear em espaço log, `log r_a + log r_b = log e`, resolvido componente a componente como o atrito (potenciais com uma incógnita livre por componente bipartida; componente com ciclo ímpar tem solução única). Corpos fora de toda aresta ficam com `r = 0`. Um par declarado com `e = 0` cujos dois corpos têm `r > 0` pelo solve é conflito. Qualquer conflito ou inconsistência → fallback: `r` de cada corpo = máximo de `e` entre seus pares (0 sem pares), regra **Min** em todos os colisores, e um aviso em inglês cru no molde do de atrito: `'contact e-graph has inconsistent constraints; restitution degraded to per-body max with Min rule'`.

`colliderDescFor` troca `setRestitution(0)` por `setRestitution(r)` e `setRestitutionCombineRule(useMinFallback ? Min : Multiply)`. Aros de polia continuam com `0` e Min: Rapier aplica a regra de maior valor no enum (Multiply 2 > Min 1), e `0 · x = 0`.

ADR-0005, curto, no formato dos anteriores: contexto (Rapier sem restituição por par, JS sem modificação de contato), decisão (fatores por corpo, Multiply, `r = 0` por padrão, fallback Min + aviso), consequências (exato quando solúvel; pares não declarados entre corpos com `e` em outros pares herdam `r_a · r_b`, desvio residual aceito como no ADR-0003).

#### Acceptance criteria

1. `assignPairRestitutions` para dois corpos com par `e = 0.5` e um terceiro sem par devolve `r` tal que `r_a · r_b = 0.5` (±1e-9) e `r_c = 0`, `useMinFallback = false`, sem avisos.
2. Para A–B `e = 0.5` e A–C `e = 1`, devolve fatores com `r_a·r_b = 0.5` e `r_a·r_c = 1` (±1e-9).
3. Para A–B `e = 1`, B–C `e = 1`, A–C `e = 0` (conflito), devolve `useMinFallback = true`, `r = {1, 1, 1}` e exatamente um aviso.
4. Cena sem nenhum `e` declarado devolve `r = 0` em todos os corpos, sem fallback nem avisos.
5. Simulação, g = 0, duas esferas iguais (m = 1, r = 0.5) frontais com v = +3 e 0: com `e = 1` as velocidades finais são 0 e 3 (±3%); com `e = 0.5`, 0.75 e 2.25 (±3%); com `e = 0`, ambas 1.5 (±3%). Momento conservado em todos (±3%).
6. Esfera (m = 1) caindo de 2 m sobre o chão com um par esfera–esfera `e = 1` declarado com outra esfera distante, mas sem par com o chão: a velocidade vertical depois do impacto com o chão é ≤ 5% da velocidade de chegada (continua inelástico).
7. O teste de esferas frontais existente em `acceptance.test.ts` passa sem alteração.
8. `docs/adr/0005-restitution-on-contact-pairs.md` existe e referencia a 0003.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/contacts.test.ts`: critérios 1 a 4 chamando `assignPairRestitutions` direto; vermelhos hoje porque a função não existe.
- `src/sim/acceptance.test.ts`: critérios 5 e 6 com cenas inline no molde do teste de esferas frontais (velocidade por força de lançamento ou `vx` direto); vermelhos hoje porque todo colisor tem restituição 0. Chamam o simulador direto; não é costura de DOM.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy). Bruno decidiu: fatores por corpo com Multiply, `r = 0` sem par declarado, exato quando solúvel, fallback + aviso.
- Proxy decided: solve em espaço log; fallback = máx por corpo com regra Min (mantém pares não declarados em 0 e acerta o preset de colisão mesmo sem o solve); ADR-0005 referenciando a 0003; aviso em inglês cru como os existentes.
- Planner: Rapier 0.20 não tem limiar de velocidade para restituição; bola com `e = 1` quica para sempre. Aceito, vai para o FINAL_REPORT no PHY-74.

#### Stage 2 — 2026-10-03

- Costuras: `assignPairRestitutions` direto e `createSimulator`/`step`/`readStates`, conforme o contrato. Chamadores examinados: `colliderDescFor` é usado por `buildWorld`; construtor e `replaceScene` usam esse mesmo build e propagam seus avisos. O App apresenta os avisos do simulador. Atrito permanece independente; os avisos das duas soluções são concatenados. Aros de polia mantêm restituição zero e Min.
- Casos cobertos: par isolado, corpo sem aresta positiva, componente bipartida, ciclos par e ímpar solúveis, ciclo par inconsistente, zero explícito e `e` ausente em conflito, grafo vazio, colisões frontais com 0/0,5/1 e chão não declarado. O teste frontal anterior está intacto. ADR-0005 registra mecanismo, fallback e desvio residual aceito.
- Testes de fatores em `c293613`: vermelho por função inexistente, 10 falhas e 2 aprovados. Implementação em `a4efdef`: 12/12 aprovados. Testes físicos em `f4817a9`: 2 falhas (`e = 1` e `e = 0.5`), 2 aprovados, 226 não selecionados antes da integração. Verde após integração: 242/242 nos dois arquivos.
- Mutate-verify dos fatores: somar 1 a cada fator devolvido fez falhar os 10 testes novos (2 anteriores passaram). Log: `%TEMP%/phy68-mutate-factors.log`.
- Mutate-verify físico por teste: trocar `desc.setRestitution(restitution)` por `desc.setRestitution(0)` fez falhar os casos `e = 1` (erro 1,49999988 > 0,09) e `e = 0.5` (erro 0,74999988 > 0,0225): 2 falhas, 2 aprovados, 226 não selecionados. Log: `%TEMP%/phy68-mutate-inelastic.log`.
- Trocar a mesma chamada por `desc.setRestitution(1)` fez falhar `e = 0.5` (erro 0,75 > 0,0225), `e = 0` (erro 1,5 > 0,045) e o chão não declarado (velocidade 6,212995 > 0,310650): 3 falhas, 1 aprovado, 226 não selecionados. Log: `%TEMP%/phy68-mutate-elastic.log`. Todas as mutações foram restauradas antes do gate.
- Primeira tentativa do gate no sandbox: 1042 aprovados e 15 falhas de conexão/desconexão do Chromium DevTools em testes preexistentes. Log: `%TEMP%/phy68-gate.log`. Reexecução fora do sandbox para validar o gate completo.
- Gate final fora do sandbox: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0; 31 arquivos, 1057 testes aprovados, lint/typecheck/build aprovados. Log: `%TEMP%/phy68-gate-unsandboxed.log`. Diff revisado e `git diff --check` limpo; nenhum artefato gerado incluído. Limitação prevista: pares não declarados entre dois corpos com fatores positivos podem herdar restituição; fallback é aproximado, conforme ADR-0005. Stage 2 encerrado; revisão independente pendente.

#### Stage 3 — correção documental (2026-10-03)

- Corrigida a entrada Collision em `CONTEXT.md`, que ainda dizia que a integração estava pendente e prometia restituição zero para todo par não declarado. Agora referencia ADR-0005 e registra a herança aceita entre dois fatores positivos. O comentário de `assignPairFrictions` também passa a qualificar restituição zero como padrão. Nenhum comportamento ou teste alterado; documentação tornada obsoleta pela implementação é uma correção pequena permitida pelo fluxo.

#### Stage 3 review (2026-10-03)

Verdict: Reopen — regressão R1: fator finito no JavaScript transborda no Rapier e a colisão perde todo o momento (S2-implícito).

Base: `sweatshop/2026-10-03-1618` (`cf261da`); HEAD de implementação revisado: `ef9e24d`. Primeira revisão, diff inteiro e quatro commits examinados; Standards e Spec em sub-agentes independentes. Rebase sobre a sessão sem conflitos. Correção documental pequena em `bd4c89b`, também revisada; nenhuma alteração de comportamento ou de testes feita na etapa 3.

##### Standards

- Achado documental corrigido em `bd4c89b`: glossário Collision ainda anunciava integração futura e garantia zero em todo par não declarado; comentário do atrito tratava restituição zero como absoluta. Ambos agora descrevem o mecanismo e seu padrão corretamente. A correção em `CONTEXT.md`, fora dos Primary files, é a exceção documental explícita do fluxo.
- Observação de processo, sem reabertura: `c293613`, `a4efdef`, `f4817a9` e `ef9e24d` têm corpo de mensagem vazio, embora os assuntos citem PHY-68. A seção Commits and closing da skill pede corpo com motivo e ID. Não é uma quebra de Primary files, test-first ou uma regressão; histórico preservado.
- Primary files e test-first aprovados: `c293613` precede o solve em `a4efdef`; `f4817a9` precede a integração em `ef9e24d`; commits de produção não alteram testes. Logs de mutação existentes conferidos: os dez testes de fatores e os quatro físicos falham sob as mutações registradas na etapa 2. Nenhum smell de baseline exige ação; os dois solvers independentes seguem a costura aprovada.

##### Spec

**P2 — ❌ R1: `Number.isFinite` aceita fatores que o Rapier não representa.** Em `src/sim/simulator.ts:835`, o solve só verifica a finitude em JavaScript; `:878` transfere o fator a `setRestitution`. O grafo solúvel A–B `e = 1e-40`, B–C `e = 1` produz `{ A: 1, B: 9.999999999999985e-41, C: 1.0000000000000016e40 }`, sem fallback nem aviso. O coeficiente de C chega ao Rapier como `Infinity`. Isso contraria a intenção "exato quando solúvel", mas a razão mecânica da reabertura é a regressão demonstrada de conservação do momento, mesmo com os oito critérios numerados atendidos. É distinta da herança aceita de restituição entre pares não declarados.

Reprodução pelo módulo real, sem mocks nem edição de produção: `version = 1`, `g = 0`, sem forças; três círculos de massa 1, raio 0,5 e rotação 0. A é fixo em `(100, 100)`; B é dinâmico em `(-2, 0)`, `vx = 3`; C é dinâmico em `(0, 0)`, parado. Contatos A–B `e = 1e-40` e B–C `e = 1`, ambos `muS = muK = 0`. O codec aceita a cena; seu único aviso é o já existente sobre `g = 0`, nenhum sobre `e`. Executar 120 chamadas de `step()`:

| Produção | v_B,x | v_C,x | Momento total x | Avisos do simulador |
| --- | --- | --- | --- | --- |
| Base `cf261da` | 1.4999998807907104 | 1.5000001192092896 | 3 | nenhum |
| Implementação `ef9e24d` / correção documental `bd4c89b` | 0 | 0 | 0 | nenhum |

O agente principal repetiu a comparação com o simulador da base carregado por `git show` e transpilação apenas em memória. Também repetiu a transferência direta ao Rapier: fator JavaScript finito `1.0000000000000016e40` → restituição lida `Infinity`. Runner: `%TEMP%/phy68-review-overflow-probe.mjs`; saída: `%TEMP%/phy68-review-overflow.log`. Da raiz, executar `Get-Content -Raw -LiteralPath (Join-Path $env:TEMP 'phy68-review-overflow-probe.mjs') | node --input-type=module`. O runner contém a cena completa e compara base e produção atual sem alterar arquivos do repo.

- Critério 1 ✅ Par isolado com produto 0,5; corpo sem aresta em zero; sem fallback ou avisos.
- Critério 2 ✅ Produtos 0,5 e 1 na componente bipartida.
- Critério 3 ✅ Conflito com zero, fatores `{1, 1, 1}` e um aviso; ausência de `e` também coberta.
- Critério 4 ✅ Grafo vazio, fatores zero, sem fallback ou avisos.
- Critério 5 ✅ Casos frontais `e = 1`, `0.5` e `0` com velocidades e momento dentro das tolerâncias.
- Critério 6 ✅ Chão não declarado continua inelástico apesar do par elástico distante.
- Critério 7 ✅ Teste frontal anterior preservado e aprovado.
- Critério 8 ✅ ADR-0005 existe e referencia ADR-0003.
- `Proxy decided` da etapa 1 conferido: solve em log, máximo por corpo com Min no fallback, aviso cru em inglês e ADR-0005 referenciando 0003 estão implementados. O desvio residual aceito e o quique indefinido com `e = 1` permanecem decisões documentadas, sem novo requisito nesta revisão.

##### Alcance e validação

- Chamadores examinados: `assignPairRestitutions`, `colliderDescFor` → `buildWorld`, construtor, `createSimulator`, `replaceScene` e publicação de avisos no App. Caminhos de falha: ciclos inconsistentes, conflito com zero/ausência, resultados exponenciais não representáveis, fallback global e limpeza transacional do mundo. Interações: atrito e seus avisos independentes, cenas legadas, corpos fixos, velocidades iniciais, chão e aros de polia em zero/Min.
- Não examinados experimentalmente além do gate: edição manual no browser e restituição positiva combinada com cordas/molas ativas.
- Gate de revisão fora do sandbox: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0; **31 arquivos e 1057 testes aprovados**, lint/typecheck/build aprovados. Log: `%TEMP%/phy68-review-gate.log`. O probe adicional demonstra R1 apesar desse verde. `git diff --check` limpo; nenhum artefato gerado incluído.
- Pendente para a etapa 2: escrever teste de regressão na costura pública existente e corrigir R1, garantindo que os fatores transferidos ao Rapier sejam representáveis ou que a degradação use o fallback com aviso. Precisa de teste novo, portanto não é correção pequena permitida ao revisor. Critérios e Primary files não foram reescritos.
- Totais por eixo: Standards — 2 achados (documentação corrigida e metadados históricos não bloqueantes), nenhum smell acionável; Spec — 1 regressão P2 pendente. `Stage: to-implement`, sem merge e sem linha PHY-68 no ledger; a retomada continua nesta mesma branch e trata R1.

#### Stage 2 — R1 retry (2026-10-03)

- Existing approved seam: `createSimulator`/`step`/`readStates` in `acceptance.test.ts`. Callers checked: restitution factors reach `colliderDescFor` through `buildWorld`, shared by construction and `replaceScene`; warnings propagate through both. The guard must check Rapier's f32 range, including positive values rounding to zero, while leaving ordinary factors unchanged.
- Red regression: `npx vitest run src/sim/acceptance.test.ts -t 'overflows Rapier f32'`: 1 failed, 230 skipped. With the review's A-B `1e-40`, B-C `1` scene, momentum error was 3, exceeding 0.09. No production changes in this test commit.
- Fix: test representability with `Math.fround` before accepting solved factors; overflow or rounding to zero uses the existing whole-scene Min fallback and warning. ADR-0005 now names the f32 boundary. Ordinary factor values and the existing fallback mapping remain unchanged.
- Mutate-verify for `preserves collision momentum when a solved restitution factor overflows Rapier f32`: replaced `Math.fround(value)` with `value` in production; the focused command above failed with `AssertionError: expected 3 to be less than or equal to 0.09` at the momentum assertion (1 failed, 230 skipped). Mutation restored. The two focused files passed 243/243 tests with the fix.
- Final gate: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0 outside the sandbox; 31 files and 1058 tests passed; lint, typecheck and build passed. Build retains its large-chunk warning. Final diff checked: only the approved test, solver, ADR and ticket; original frontal test unchanged, no generated artifacts. R1 is ready for independent stage-3 review; the documented approximate fallback remains a limitation.

#### Stage 3 — correção documental da re-revisão (2026-10-03)

- Movido o bloco de retomada R1 para depois da revisão que o originou, preservando o conteúdo e a ordem de anexação do histórico exigida por `docs/agents/issue-tracker.md`. Nenhum código ou teste alterado.

#### Resolution (2026-10-03)

Verdict: Approve

Re-revisão de R1 e do delta `5cd4de3..c911516`, com o diff completo contra a base da sessão `cf261da` como contexto. Standards e Spec executados em sub-agentes independentes. Os oito critérios continuam aprovados; R1 está resolvido.

##### Standards

- Um achado documental corrigido em `69b3fcc`: o bloco de retomada R1 precedia o histórico existente, contrariando `docs/agents/issue-tracker.md` ("Comments and conversation history append to the bottom"). Foi movido sem alterar o conteúdo, o código ou os testes.
- Observação histórica não bloqueante preservada: os quatro commits originais têm corpos vazios. Observação nova não bloqueante: `23ed641` e `c911516` explicam o motivo no corpo, mas citam PHY-68 somente no assunto; a seção Commits and closing de `ticket-flow` pede motivo e ID no corpo. Histórico preservado; isso não viola Primary files ou test-first nem demonstra regressão.
- Separação test-first correta: `23ed641` altera teste e ticket; `c911516` altera solver, ADR e ticket, sem testes. Delta dentro dos Primary files; teste frontal anterior intacto. ADR-0005 documenta a fronteira f32. Nenhum smell acionável ou novo achado em código anteriormente revisado.

##### Spec

- Zero achados atuais; R1 resolvido. `Math.fround(value)` verifica o fator antes da transferência ao Rapier e aciona o fallback existente com um aviso quando ele transborda ou arredonda para zero.
- Probe independente do simulador real, carregando TypeScript apenas em memória: `5cd4de3` produz `vB = vC = 0`, momento total 0 e nenhum aviso; `c911516` produz `vB = 0`, `vC = 3`, momento total 3 e exatamente o aviso previsto. Reprodução repetida pelo agente principal e pelo eixo Spec.
- Limites conferidos pelo eixo Spec: fator subnormal `1.401298464324826e-45` e fator próximo do máximo f32 `3.4028234663852844e38` permanecem aceitos; `3.402823600000016e38`, `2^-151` e `Number.MIN_VALUE` acionam fallback com um aviso. Grafos comuns, ciclos ímpares, cenas legadas e conflito com zero permanecem idênticos à versão anterior. `replaceScene` publica o aviso de R1 e o limpa ao receber cena normal.
- Critérios 1–8 continuam atendidos, sem requisito parcial ou ampliação de escopo. A linha `Proxy decided` foi novamente conferida: solve em log, máximo por corpo com Min, aviso cru em inglês e ADR referenciando 0003. Herança de restituição entre pares não declarados, fallback aproximado e quique indefinido com `e = 1` permanecem decisões aceitas.

##### Prova, gate e integração

- Arquivos: solver e integração de restituição em `src/sim/simulator.ts`, testes em `src/sim/contacts.test.ts` e `src/sim/acceptance.test.ts`, ADR-0005, atualização do glossário em `CONTEXT.md` e histórico deste ticket. Nesta re-revisão só foi corrigida a ordem documental do histórico.
- Prova red-green conferida: teste de R1 em commit próprio, anterior à correção; vermelho com erro de momento `3 > 0.09`, 1 falha e 230 não selecionados. O ticket registra a mesma falha sob a mutação de produção `Math.fround(value)` para `value`, restaurada antes do gate. O teste usa `createSimulator`/`step`/`readStates`, sem mocks. Verde com a correção: 243/243 nos dois arquivos focados na etapa 2 e 1058/1058 no gate independente desta revisão.
- Gate independente: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0 fora do sandbox; **31 arquivos e 1058 testes aprovados**, lint/typecheck/build aprovados. Permanece o aviso conhecido de chunk grande do Vite. Depois do gate, apenas metadados do ticket foram alterados; o tree integrado foi comparado à branch revisada e é idêntico. `git diff --check` limpo; nenhum artefato gerado incluído.
- Chamadores e interações reexaminados: fator → `colliderDescFor` → `buildWorld`, construção e `replaceScene`, propagação e limpeza de avisos, fatores ordinários, subnormais e transbordamento. O alcance da primeira revisão está registrado acima. Passe manual de navegador e colisões elásticas com cordas/molas ativas não foram repetidos além do gate.
- Integração: `69b3fcc` integrado sem squash em `sweatshop/2026-10-03-1618`, merge `7da3bfc`; `Review: human` fica para a PR da sessão conforme o fluxo. `Stage: done` e ledger registrados juntos no fechamento local.
- Limitação prevista: fallback é aproximado e pode alterar pares declarados com zero; pares não declarados entre dois fatores positivos podem herdar restituição, conforme ADR-0005.

Totais por eixo: Standards — 1 achado documental corrigido, 2 observações de metadados não bloqueantes, 0 smells acionáveis; Spec — 0 achados atuais, R1 resolvido.

#### Achado de integração — edição de e (2026-10-04, review de PHY-75)

- `src/playback/routing.ts` compara a identidade do par e μs/μk, mas não e. Probe somente de leitura, chamando `routeDocChange` de produção com uma cena de chão/bola cujo único delta é e: 0 → 1, retornou `{"kind":"live","ops":[]}`.
- Pela leitura de `editDoc`, do efeito de documento e de `syncWorld` no App, após boot e antes do primeiro passo na ponta com cursor null, essa rota atualiza o documento sem reconstruir ou alterar os fatores do mundo. Reiniciar/reabrir a cena ou outra reconstrução aplica o e salvo. A inferência de UI não foi repetida manualmente no navegador nesta revisão.
- O código de routing é idêntico na base `4edff74` e na PHY-75 `763a3eb`. A PHY-75 passou seus nove critérios: o quique é contratado por `updateContact → createSimulator` direto, e o DOM contrata salvar o valor no documento. A integração da edição com o mundo existente permanece uma pendência do mecanismo de restituição.
- Encaminhamento ao planner: transformar esta nota em ticket próprio para a classificação da edição de e e sua prova pelo App. Este registro fica em Comments; o contrato e a resolução anterior de PHY-68 permanecem como publicados.
