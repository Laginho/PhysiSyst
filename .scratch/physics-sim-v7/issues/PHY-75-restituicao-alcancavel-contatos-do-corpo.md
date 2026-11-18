# PHY-75: Restituição alcançável e contatos no painel do corpo
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/presets/index.ts (`projectileLaunch` :113-137, `collision` :139-151, `freeFall` :153-164)
  - src/presets/presets.test.ts
  - src/App.tsx (`ContactsPanel` :466-515 removido; novo painel de contatos do corpo ao lado de `ForcesPanel`; montagem :2242-2284)
  - src/App.test.ts (testes do `ContactsPanel` reescritos para o painel do corpo)
  - src/render/draw.ts (`massLabels` :47, consumido sem alterar)
  - src/editor/doc.ts (`addContact`, `updateContact`, `removeContact`, `CONTACT_DEFAULTS`, consumidos sem alterar)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`contacts.*`)

#### What to build

Dois problemas com uma causa: o aluno não consegue fazer a bola quicar. `freeFall` e `projectileLaunch` têm `contacts: []` e `collision(e)` só declara `esfera-1 ↔ esfera-2`; pela ADR-0005 o par não declarado com o chão tem fator 0, então o `e` que o aluno digitaria não existe. E o lugar para digitá-lo é o `ContactsPanel` global, que fala em ids e dois `<select>` soltos, longe do corpo que ele está olhando.

**Presets.** `freeFall` ganha `{ a: 'chao', b: 'bola', muS: 0, muK: 0, e: 0 }`; `projectileLaunch`, `{ a: 'chao', b: 'projetil', muS: 0, muK: 0, e: 0 }`; `collision(e)` ganha `chao ↔ esfera-1` e `chao ↔ esfera-2`, ambos `{ muS: 0, muK: 0, e: 0 }`, além do par das esferas. Nada mais muda nos presets: com μ = 0 e e = 0 declarados, o solve da ADR-0003 (Average) e o da ADR-0005 (Multiply) devolvem os mesmos fatores que o par não declarado dava, e as trajetórias de hoje continuam iguais. Consequência aceita: `isHeld` em `accelerationTracker.ts` passa a marcar a aceleração analítica desses presets como aproximada ("≈") antes do primeiro passo, porque agora há um par declarado.

**Painel do corpo.** O `ContactsPanel` global sai (componente, montagem e `contacts.title`). Com um corpo selecionado, abaixo do `ForcesPanel`, um fieldset novo com legenda `t('contacts.of', { label })` ("contatos de {label}" / "contacts of {label}") lista todo par em que o corpo é `a` **ou** `b`, uma linha por par: o rótulo do parceiro, os três `NumField` de hoje (μs, μk, e, step 0,05, sem clamp) ligados a `updateContact(d, c.a, c.b, patch)` na ordem original do par, e o botão ✕ de `removeContact`. Sem par, `t('contacts.empty')`. Abaixo, um `<select>` com os outros corpos ainda não pareados com este, pelo rótulo, e o botão `t('contacts.add')` chamando `addContact(doc, selectedId, partnerId)`; o erro do `addContact` aparece como hoje. Sem parceiro disponível, `<select>` e botão ficam `disabled`. O fieldset inteiro segue `structuralLocked` como o `ContactsPanel` seguia.

**Rótulos.** Corpo dinâmico: o rótulo de massa de `massLabels(doc)` (`m`, `M`, `m_a`, …), texto plano. Corpo fixo: `t('contacts.fixedLabel', { shape, n })` = "fixo: {shape} {n}" / "fixed: {shape} {n}", com `shape` = `t('palette.rectangle' | 'palette.circle' | 'palette.triangle')` e `n` a posição 1-based entre os corpos fixos da mesma forma, na ordem do documento, sempre numerado ("fixo: retângulo 1"). O mesmo rótulo serve para a legenda quando o corpo selecionado é fixo.

Nenhum `e` padrão por cena. O simulador não muda.

#### Acceptance criteria

1. `presetById('free-fall')!.buildScene().contacts` é exatamente `[{ a: 'chao', b: 'bola', muS: 0, muK: 0, e: 0 }]`; `projectile`, `[{ a: 'chao', b: 'projetil', muS: 0, muK: 0, e: 0 }]`; `collision-elastic` e `collision-inelastic` contêm `chao ↔ esfera-1` e `chao ↔ esfera-2` com `muS: 0, muK: 0, e: 0` além do par `esfera-1 ↔ esfera-2` existente. `collectWarnings` continua vazio nos quatro.
2. Para cada um desses quatro presets, 120 passos de `createSimulator(scene)` e 120 passos de `createSimulator({ ...scene, contacts: scene.contacts.filter(c => c.a !== 'chao' && c.b !== 'chao') })` dão `readStates()` iguais para todo corpo (posição, rotação, `linvel`, `angvel` dentro de 1e-9) e `warnings` vazio nos dois.
3. Com `updateContact(scene, 'chao', 'bola', { e: 1 })` sobre o preset `free-fall`, em até 2 s simulados a bola inverte `linvel.y` (passa a positivo) com módulo de pelo menos 0,8 do maior |vy| registrado antes do impacto.
4. No `App`, nenhum fieldset com legenda `t('contacts.title')` existe e, sem corpo selecionado, nenhum campo com rótulo `t('contacts.muS')` está no DOM.
5. Numa cena com `chao` (fixo), `bloco` (retângulo dinâmico) e `bola` (círculo dinâmico) e contatos `chao ↔ bloco` e `bloco ↔ bola`: selecionar `bloco` mostra um fieldset com legenda "contatos de m_a" e duas linhas, rotuladas "fixo: retângulo 1" e "m_b", cada uma com três `<input type="number">` e um botão ✕; selecionar `bola` mostra "contatos de m_b" com uma linha "m_a".
6. Editar o campo `e` da linha "m_a" com `bola` selecionada grava `e: 0.8` no par `{ a: 'bloco', b: 'bola' }` sem tocar em `muS`/`muK` nem inverter `a`/`b`; o ✕ dessa linha remove exatamente esse par.
7. Com `bloco` selecionado na cena do critério 5, o `<select>` de parceiro não tem opção (todos já pareados) e ele e o botão `t('contacts.add')` estão `disabled`; com `bola` selecionada, o `<select>` lista só "fixo: retângulo 1"; clicar em adicionar cria `{ a: 'bola', b: 'chao', muS: 0, muK: 0, e: 0 }` e a linha aparece.
8. O fieldset está `disabled` quando `structuralLocked` (depois do primeiro passo com o cursor fora de 0), como os painéis estruturais.
9. `contacts.of` e `contacts.fixedLabel` existem em pt-BR e en; `contacts.title` não existe em nenhum; o teste de paridade dos catálogos continua verde.

#### Verification

    npm test -- src/presets/presets.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/presets/presets.test.ts`: critérios 1 a 3 chamando `buildScene`, `createSimulator` e `updateContact` direto (Rapier real, como o teste B1 do arquivo); 1 e 3 vermelhos hoje (sem par, a bola gruda); 2 passa hoje de forma trivial e vai junto para pinar a igualdade.
- `src/App.test.ts`: critérios 4 a 8 com o simulador falso; vermelhos hoje (o painel global existe e o do corpo não). Os testes atuais do `ContactsPanel` (ex.: `shows restitution after kinetic friction for each pair…`) são reescritos para a costura nova no mesmo commit. Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.

## Comments

#### Stage 2 — mutate-verify (2026-10-04)

Cada mutação abaixo foi aplicada temporariamente à produção, executada contra o teste indicado e restaurada em `finally`. Os testes do DOM chamam o App real com o simulador falso já usado nesta costura; a edição/remoção é observada pelo documento salvo via `pagehide`/`loadScene`.

| Teste em `src/App.test.ts` | Mutação na produção | Saída vermelha observada |
| --- | --- | --- |
| `has no global contact panel…: populated` | Reintroduzir fieldset global `contatos` na montagem | `expected <fieldset><legend></legend></fieldset> to be undefined` (:317); 2 failed junto com empty |
| `has no global contact panel…: empty` | Mesmo fieldset global, inclusive sem corpos | Mesma assertion (:317); 2 failed no conjunto |
| `shows all and only selected-body pairs…` | Filtrar só `c.a === bodyId` | `expected [ 'm_b' ] to deeply equal [ 'fixo: retângulo 1', 'm_b' ]` (:325); 1 failed |
| `edits restitution from endpoint b…` | Trocar a/b no callback de `updateContact` | `expected [ …(2) ] to deeply equal [ …(2) ]` (:349), e não gravado; 2 failed junto com friction |
| Mesmo teste, remoção | Trocar a/b no callback de `removeContact` | `expected [ …(2) ] to deeply equal [ { a: 'chao', b: 'bloco', …(3) } ]` (:353); 1 failed |
| `edits both friction coefficients independently…` | Trocar a/b no callback de `updateContact` | `expected [ …(2) ] to deeply equal [ …(2) ]` (:364), μs não gravado; 2 failed no conjunto |
| `disables an exhausted partner picker…` | Remover a exclusão dos parceiros já pareados | `expected HTMLOptionsCollection… to have a length of +0 but got 2`; 1 failed |
| `keeps partner choice valid…` | Ignorar escolha, usar sempre o primeiro parceiro | `expected [ { a: 'bola', b: 'chao', …(3) } ] to deeply equal [ { a: 'bola', b: 'bloco', …(3) } ]` (:399); 1 failed |
| `numbers fixed partners by shape…` | Usar `n = 1` para todo corpo fixo | Listas divergem (:422): parede vira `fixo: retângulo 1` em vez de 2; 1 failed |
| `shows an empty, disabled partner picker…` | Remover disabled do seletor e botão sem parceiros | `expected false to be true` (:440); 1 failed |
| `locks the whole body contact fieldset…` | Fieldset ignora structuralLocked (`disabled={false}`) | `expected false to be true` (:451); 1 failed |
| `localizes body and fixed contact labels…` | Rótulo fixo usa id bruto | `expected 'contacts of m_achao✕μs — static frict…' to contain 'fixed: rectangle 1'` (:469); 1 failed |

Os cinco testes antigos de snap usam agora o documento salvo. Mutação de `onPointerUp` omitindo `addContact`: 4 failed, 1 passed, 152 skipped (157); criação falha com `expected 1 to be 2`; re-snap, persistência ao afastar e remoção no lixo falham com `expected [ 'rampa ↔ bloco' ] to include 'caixa ↔ chao'`. Para o quinto (`never creates a Contact mid-drag…`), declarar o contato em `onPointerMove` produz `expected [ 'rampa ↔ bloco', 'caixa ↔ chao' ] to deeply equal [ 'rampa ↔ bloco' ]` (:738); 1 failed, 156 skipped.

Presets, costura direta: remover as quatro declarações com chão gera 4 failed, 35 skipped (39); remover só a da queda livre faz o quique falhar com `expected 0 to be greater than or equal to 9.025222778320312`. Alterar `e` dos pares com chão de 0 para 1 derruba os quatro testes de igualdade de trajetória (4 failed, 35 skipped): queda livre, passo 70, diferença `11.28152847290039`; projétil, passo 74, `5.935490608215332`; colisão elástica, passo 82, `0.16350001096725464`; inelástica, passo 81, `5.960464477539063e-8`, todas acima de `1e-9`.

Green antes das mutações: presets 39 passed (39); casos novos do painel 11 passed, 146 skipped (157). Typecheck também passou. Todas as mutações foram restauradas antes do gate completo.

#### Stage 2 — correção de harness (2026-10-04)

O primeiro gate terminou em 63 failed, 1056 passed (1119), 1 arquivo failed / 32 passed (33). O novo teste de tradução deixava o singleton de idioma em inglês; corrigido com `try/finally` restaurando pt-BR pelo seletor real. As assertions antigas de galeria e de duas recargas de cena observavam ids nas opções do `ContactsPanel` global: agora clicam no corpo do canvas e verificam seu inspetor, preservando a prova do conteúdo carregado. Depois da correção de idioma/galeria, a execução focal terminou em 2 failed, 194 passed (196), isolando as duas assertions de recarga ainda acopladas ao seletor removido. Nenhuma mudança de contrato ou produção para corrigir estes testes.

Nova prova vermelha, após as correções do harness (mutações sempre restauradas):

| Teste adaptado | Mutação na produção | Saída vermelha |
| --- | --- | --- |
| `localizes body and fixed contact labels…` | Rótulo fixo usa id bruto, como na prova anterior | `expected 'contacts of m_achao✕μs — static frict…' to contain 'fixed: rectangle 1'` (:470); 1 failed, 156 skipped |
| `com a terceira cena marcada…` | Inicialização lê conteúdo de `cena-1` mantendo identidade selecionada | `expected undefined to be defined` para inspetor `marca-cena-3` (:1878); 2 failed, 155 skipped junto com reload |
| `trocar de cena persiste…` | Mesma mutação na inicialização do documento | `expected undefined to be defined` para `marca-cena-2` (:1903); 2 failed no conjunto |
| `duplicar um preset cria a cena…` | `openGalleryPreset` usa DEMO_SCENE em vez do builder escolhido | `expected undefined to be defined` para `bloco-1` (:2078); 1 failed, 156 skipped |
| `recusa Delete, Backspace e campos estruturais…` | Fieldset do corpo ignora structuralLocked | `expected false to be true` (:2562); 1 failed, 156 skipped |

Uma tentativa de mutar `switchToScene` sobre o teste de cópia de preset sobreviveu (1 passed, 156 skipped): equivalente para esse cenário, pois duplicar um preset chama `copyOpenPreset`, rebind da identidade que preserva o documento, sem passar por `switchToScene`. A mutação foi descartada e a prova passou a atingir `openGalleryPreset`, que efetivamente determina o documento exibido nesse teste.

Green com harness corrigido e produção restaurada: `npm test -- src/App.test.ts src/presets/presets.test.ts`: 2 arquivos passed; 196 passed (196), sem skips.

#### Stage 2 — handoff (2026-10-04)

- Implementado: quatro presets com contatos de chão μs = μk = e = 0; painel global removido; `BodyContactsPanel` abaixo das forças do corpo selecionado, pares acessíveis por a/b com ordem original preservada; rótulos de massa/fixos e traduções pt-BR/en; parceiros só não pareados, escolha válida após alterações, controles desabilitados sem parceiro e fieldset bloqueado pelo structuralLocked.
- Testes separados da produção: `7ebb83e` (presets, red), `920aa9f` (painel, red), `b96de57` (harness corrigido, nova prova red por mutação). Commit de produção dos presets: `e3a7a05`. Nenhum commit de produção altera testes.
- Gate completo `npm test && npm run lint && npm run typecheck && npm run build`, executado sequencialmente com parada na primeira falha: **33 arquivos passed (33), 1119 passed (1119), sem skips**; lint e typecheck exit 0; build exit 0 (52 módulos). Testes de Chromium incluídos. Build mantém aviso de chunk maior que 500 kB (chunk `sim`, 2136,50 kB).
- Diff final revisado: apenas Primary files e este ticket; simulador, editor/doc e render/draw não alterados; nenhuma dependência, versão de cena ou regra de restituição nova. `git diff --check` passou.
- Consequência prevista mantida: marcador ≈ na aceleração analítica inicial de queda livre/projétil, conforme contrato e débito PHY-86. Etapa 3 ainda pendente; sem merge ou push nesta etapa.

- Red do DOM: `npm test -- src/App.test.ts -t 'selected Body contacts'` (fora do sandbox após timeout de inicialização do worker): 11 failed, 146 skipped (157). Sem seleção: `expected <fieldset …> to be undefined`; leitura/edição/parceiros/fixos/bloqueio: `missing contacts of m_a/m_b/m`; catálogo: `expected undefined to be truthy` para `contacts.of`.

- 2026-10-04 Stage 2: branch criada sobre `sweatshop/2026-10-04-1243`. Costuras aprovadas: builders/createSimulator/updateContact e DOM do App. Callers examinados: abertura/cópia/persistência de presets, snap de contato, update/remove com identidade ordenada, massLabels no desenho; casos de fronteira: nenhum corpo/parceiro, todos pareados, seleção no lado b, seleção fixa, troca de corpo e parceiro removido. `editor/doc.ts` e `render/draw.ts` serão apenas consumidos.
- Red dos presets: `npm test -- src/presets/presets.test.ts -t 'reachable ground restitution'`: 5 failed, 4 passed, 30 skipped (39). Quatro falhas por pares com chão ausentes; quique: `expected 0 to be greater than or equal to 9.025222778320312`.

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: retrofit dos presets com o par com o chão (μ = 0, e = 0), comportamento igual; `ContactsPanel` sai; seção "contatos de m_a" no painel do corpo, par alcançável dos dois lados; parceiro em `<select>` (dinâmicos pelo rótulo de massa, fixos como "fixo: retângulo 1"); sem `e` padrão por cena.
- Planner: rótulo fixo sempre numerado, `n` entre os fixos da mesma forma na ordem do documento, forma pelas strings da paleta; `<select>` só com parceiros ainda não pareados. O "≈" na aceleração analítica de queda livre e projétil antes do primeiro passo é consequência de `isHeld` e fica.
- 2026-10-04 O "≈" antes do primeiro passo fica neste ticket; a correção é débito em PHY-86.

#### Resolution (2026-10-04)

Verdict: Approve

Primeira revisão de `4edff74444d08c0d527c3b6eba3d864bcaec6a18...763a3eb`, base da sessão `sweatshop/2026-10-04-1243`. Standards e Spec executados em sub-agentes independentes; gate e mutações repetidos pelo revisor principal. Os nove critérios estão atendidos. Nenhuma alteração permanente de produção ou teste em stage 3.

##### Standards

- Um achado de metadados não bloqueante: a seção Commits and closing de `ticket-flow` pede motivo e ID no corpo do commit. `7ebb83e`, `e3a7a05`, `920aa9f`, `b96de57` e `763a3eb` explicam o motivo, mas citam PHY-75 apenas no assunto. Histórico preservado; isto não quebra Primary files, test-first nem comportamento existente.
- Zero violações de código e zero smells acionáveis. Mudança local, com reutilização de `massLabels` e das operações do documento; identidade ordenada do par, vocabulário do domínio, acessibilidade do seletor e ADRs 0002/0003/0005 preservados.
- Separação conferida nos stats de cada commit: `7ebb83e`, `920aa9f` e `b96de57` alteram testes/ticket; `e3a7a05` e `763a3eb` alteram produção/ticket, sem tocar testes. Diff dentro dos Primary files e do próprio ticket. Não há linhas `Proxy decided` neste ticket.

##### Spec

Zero achados contra o contrato escrito, sem requisito parcial ou ampliação de escopo.

| Critério | Parecer |
| --- | --- |
| 1 | ✅ Pares exatos com chão nos quatro presets, par existente das esferas preservado e `collectWarnings` vazio. |
| 2 | ✅ Simulador real compara posição, rotação, velocidades e todos os corpos em cada um dos 120 passos, tolerância 1e-9 e avisos vazios. |
| 3 | ✅ `updateContact` seguido de `createSimulator` produz o quique exigido em até 2 s; o teste falha ao retirar o par. |
| 4 | ✅ Painel global removido e nenhum campo de coeficiente sem corpo selecionado. |
| 5 | ✅ Pares pelos dois endpoints, rótulos dos parceiros, três campos numéricos e ✕ abaixo de `ForcesPanel`. |
| 6 | ✅ Edição e remoção pelo endpoint b preservam a/b, coeficientes não editados e os demais pares; valores sem clamp. |
| 7 | ✅ Seletor exclui o próprio corpo e parceiros pareados, desabilita quando esgotado e adiciona o par ordenado com defaults. |
| 8 | ✅ Fieldset inteiro segue `structuralLocked`; passo bloqueia, reset libera. |
| 9 | ✅ Chaves novas nos dois idiomas, `contacts.title` removida e paridade dos catálogos verde. |

Consumidores e interações examinados: abertura, cópia e persistência de presets; autosave/pagehide e recarga da cena escolhida; seleção, mudança/remoção de parceiros, cenas vazias, corpo único e parceiros esgotados; snap/drop, duplicação de par e remoção de dependentes; identidade ordenada de add/update/remove; `massLabels`, fixos por forma/ordem e troca de idioma; transporte, cursor, bloqueio e reset; solves Average/Multiply e marcador inicial ≈ aceito pelo contrato. Caminhos de falha lidos: recusas de `addContact`, documento inválido na persistência, boot/rebuild e guards de edição. Não houve passe visual manual específico do novo painel, repetição em outros navegadores ou novo experimento de restituição positiva com cordas/molas; a suíte geral cobre as costuras existentes.

Achado anterior à base: `src/playback/routing.ts` compara μs/μk, mas omite e. Probe de produção com e: 0 → 1 retorna `{ kind: 'live', ops: [] }`. Pela leitura do App, uma edição só de e após o boot pode manter o fator antigo no mundo até Reiniciar ou reconstruir a cena. O arquivo não muda neste diff; o critério 3 especifica construção direta do simulador e o 6 especifica gravação no documento. A pendência de integração foi registrada sob Comments de PHY-68, para o planner tratar em ticket próprio.

##### Prova vermelho/verde

As 18 mutações registradas foram repetidas isoladamente. Cada arquivo foi restaurado byte a byte em `finally`; `git diff --exit-code -- src/App.tsx src/presets/index.ts` passou depois da execução. Os 17 mutantes distinguíveis falharam pelos motivos registrados em stage 2; o equivalente permaneceu verde pelo mesmo motivo já documentado.

| Mutação repetida | Resultado focal | Evidência vermelha |
| --- | --- | --- |
| Reintroduzir fieldset global | 2 failed / 155 skipped (157) | `expected <fieldset>… to be undefined`, nos casos populated e empty. |
| Listar apenas endpoint a | 1 failed / 156 skipped (157) | Recebido `[ 'm_b' ]`, esperado `[ 'fixo: retângulo 1', 'm_b' ]`. |
| Inverter a/b em updateContact | 2 failed / 155 skipped (157) | Documento divergente nas edições de e e dos coeficientes de atrito. |
| Inverter a/b em removeContact | 1 failed / 156 skipped (157) | O par não é removido do documento salvo. |
| Oferecer parceiros já pareados | 1 failed / 156 skipped (157) | Seletor deveria ter 0 opções, recebeu 2. |
| Ignorar parceiro escolhido | 1 failed / 156 skipped (157) | Criado bola ↔ chao, esperado bola ↔ bloco. |
| Numerar todo fixo como 1 | 1 failed / 156 skipped (157) | Parede aparece como retângulo 1 em vez de 2. |
| Habilitar seletor/botão sem parceiros | 1 failed / 156 skipped (157) | `expected false to be true` no disabled do corpo único. |
| Ignorar structuralLocked no fieldset | 2 failed / 155 skipped (157) | `expected false to be true` no teste novo e no teste estrutural adaptado. |
| Usar id bruto do fixo | 1 failed / 156 skipped (157) | `contacts of m_achao…` não contém `fixed: rectangle 1`. |
| Omitir addContact no pointer-up | 4 failed / 1 passed / 152 skipped (157) | `expected 1 to be 2`; falta `caixa ↔ chao` em re-snap, afastamento e lixo. |
| Declarar contato no pointer-move | 1 failed / 156 skipped (157) | Par extra `caixa ↔ chao` no teste de contato durante arrasto. |
| Inicialização lê cena-1 | 2 failed / 155 skipped (157) | Inspetores marca-cena-3 e marca-cena-2 ausentes. |
| Galeria abre DEMO_SCENE | 1 failed / 156 skipped (157) | Inspetor bloco-1 ausente ao copiar Atwood. |
| Retirar as quatro declarações de chão | 4 failed / 35 skipped (39) | As quatro listas de contatos divergem do contrato. |
| Retirar apenas o par da queda livre | 1 failed / 38 skipped (39) | Quique 0, esperado pelo menos 9.025222778320312. |
| Trocar e do chão de 0 para 1 | 4 failed / 35 skipped (39) | Erros de trajetória nos passos 70/74/82/81: 11.28152847290039, 5.935490608215332, 0.16350001096725464 e 5.960464477539063e-8, todos > 1e-9. |
| Mutar switchToScene no teste de cópia de preset | 1 passed / 156 skipped (157) | Equivalente: cópia usa copyOpenPreset, sem chamar switchToScene. |

Runner temporário: `%TEMP%/phy75-review-runner-2c4d75965fed4205afdb83e368b44198/verify-mutations.mjs`; relatórios por mutante e `summary.json`: `%TEMP%/phy75-review-mutations-qlQRhr/`. Evidência essencial preservada na tabela acima.

##### Gate e integração

- Gate independente antes da revisão: **33 arquivos passed (33), 1119 passed (1119), sem skips**; lint/typecheck/build exit 0. A tentativa no sandbox teve 17 falhas de conexão com Chromium e 1102 aprovados; o gate fora do sandbox resolveu as conexões sem mudança de código.
- Rebase sobre a sessão retornou up to date. Gate completo repetido após restaurar todas as mutações: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0; **33 arquivos passed (33), 1119 passed (1119), sem skips**; lint/typecheck/build exit 0, build com 52 módulos. Chunk sim continua com 2136,50 kB, observação já existente no build.
- Arquivos de produção: presets, App e catálogos; testes: presets e App. Simulador, editor/doc, render/draw e routing permanecem intactos. Diff revisado e `git diff --check` limpo; nenhum segredo, dependência ou artefato gerado incluído.
- Integrado sem squash em `sweatshop/2026-10-04-1243`, merge `5f858c9`. `Stage: done`, este parecer e ledger registrados juntos no fechamento local. A sessão continua responsável pela publicação da PR.
- Limitações conhecidas: marcador ≈ inicial em PHY-86 e pendência pré-existente de aplicar edição de e ao mundo, anotada em PHY-68. Nenhuma altera os nove pareceres de aceitação acima.

Totais por eixo: Standards — 1 observação de metadados, 0 achados bloqueantes e 0 smells acionáveis; Spec — 0 achados, critérios 1–9 aprovados.
