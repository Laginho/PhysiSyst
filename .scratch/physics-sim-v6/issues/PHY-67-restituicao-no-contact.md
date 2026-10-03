# PHY-67: Coeficiente de restituição no Contact e no editor
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/scene/types.ts (`Contact`, ~:70-75)
  - src/scene/codec.ts (`CONTACT_KEYS` :159, parse do contato :184, serialização, `collectWarnings` :374-377)
  - src/scene/codec.test.ts
  - src/editor/doc.ts (`CONTACT_DEFAULTS` :157, `addContact`, `updateContact`)
  - src/editor/doc.test.ts
  - src/App.tsx (`ContactsPanel` ~:463-511, `onPatch`)
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`contacts.*`)
  - CONTEXT.md (entradas Contact e Collision)

#### What to build

Hoje `Contact` é `{a, b, muS, muK}` e toda colisão é inelástica (`setRestitution(0)` em todo colisor, PHY-68 muda isso). Depois deste ticket o par carrega também o coeficiente de restituição da colisão entre os dois corpos: `Contact.e?: number`, ausente = 0.

Campo aditivo-opcional, `SCENE_VERSION` fica 1 (precedente: `particleMode`, `vx/vy`, `pulleys`). O codec aceita `e` no objeto do contato (`CONTACT_KEYS` ganha `'e'`), exige número finito quando presente, e na serialização escreve `e` só quando definido, para cenas da v5 continuarem byte a byte. `collectWarnings` avisa quando `e < 0` ou `e > 1`, no mesmo molde dos avisos de μ negativo.

No editor, `CONTACT_DEFAULTS` passa a `{ muS: 0, muK: 0, e: 0 }` e o `ContactsPanel` ganha um terceiro `NumField`, rótulo `t('contacts.e')` ('e — restituição' / 'e — restitution'), step 0.05, sem clamp (igual aos μ), ligado a `onPatch(c.a, c.b, { e: v })`.

CONTEXT.md: a entrada Contact passa a "carrying that pair's friction coefficients and the coefficient of restitution of their collisions"; a entrada Collision ganha "its restitution is the `e` of the pair's Contact; pairs without a Contact collide with e = 0".

O simulador não muda neste ticket: `e` é lido e escrito, mas ainda não chega ao Rapier.

#### Acceptance criteria

1. `parse` aceita `{a, b, muS, muK, e: 0.5}` e devolve `Contact` com `e: 0.5`; sem a chave, `e` fica `undefined`.
2. `parse` rejeita `e` não numérico ou não finito com erro apontando `contacts[i]`, como `muS` já faz.
3. `serialize(parse(doc))` de um documento v5 sem `e` é byte a byte igual ao original; com `e` presente, a saída contém `e` e `parse` o lê de volta.
4. `collectWarnings` emite um aviso para `e: -0.1` e outro para `e: 1.5`; nenhum para `e: 0`, `e: 1` ou ausente.
5. `addContact(doc, a, b)` cria o par com `e: 0`; `updateContact(doc, a, b, { e: 0.8 })` grava `e: 0.8` sem tocar em `muS`/`muK`.
6. O `ContactsPanel` mostra, por par, um campo com rótulo `t('contacts.e')` depois de μk; editar o campo chama `onPatch` com `{ e }`.
7. `pt-BR.ts` e `en.ts` têm `contacts.e`; o teste de paridade dos catálogos em `i18n.test.ts` continua verde.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: critérios 1 a 4, chamando `parse`, `serialize` e `collectWarnings` direto; vermelhos hoje porque `checkKeys` rejeita `e`.
- `src/editor/doc.test.ts`: critério 5 chamando `addContact`/`updateContact` direto; vermelho hoje porque `CONTACT_DEFAULTS` não tem `e`.
- `src/App.test.ts`: critério 6 com o simulador falso que o arquivo já usa. Costura de DOM: registrar no ticket a mutação aplicada e a saída vermelha.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy). Bruno decidiu: `e` no `Contact` existente, padrão 0, versão 1 mantida; CONTEXT.md atualizado.
- Proxy decided: `NumField` sem clamp + aviso suave fora de [0,1], espelhando os campos de μ; `e` serializado só quando definido mantém a v5 byte a byte.

#### Stage 2 — 2026-10-03

- Costuras e chamadores inspecionados: `parse`/`serialize` usados por persistência, importação/exportação, presets e inicialização do simulador; `collectWarnings` pelo App; `addContact` pelo painel e pelo snap no pointer-up; `updateContact` pelo `ContactsPanel`. Casos cobertos: campo ausente, zero explícito, limites 0/1, valores não finitos/não numéricos, fora da faixa, par invertido, preservação do atrito, dos outros pares e do documento original. O override explícito de μ em `addContact` mantém o comportamento anterior.
- Testes separados da implementação em commits: codec `57757f7` (12 falhas esperadas, 119 passaram), documento `88f7ef0` (1 falha esperada, 50 passaram), DOM `32e5f2c` (1 falha esperada, 130 não selecionados). O teste DOM usa `src/App.test.ts`, expressamente previsto em “Tests stage 2 writes”.
- Verificação verde focada: codec 131/131, documento 51/51, DOM 1/1 (130 não selecionados).
- Mutate-verify direto: substituir leitura/validação de `e` por zero e alargar os limites dos avisos fez falhar os testes de parse, ausência e avisos; mudar o default para 1 e descartar `patch.e` fez falhar os dois testes do documento. Resultado conjunto: 24 falhas, 158 passaram. Somar 1 ao `e` lido e inverter a condição de aviso verificou também os casos zero e sem aviso: 8 falhas, 8 passaram, 115 não selecionados. Todas as mutações foram restauradas.
- Mutate-verify DOM, teste `shows restitution after kinetic friction for each pair and persists edits without clamping`: em `ContactsPanel`, trocar `onPatch(c.a, c.b, { e: v })` por `onPatch(c.a, c.b, { muK: v })`. Saída vermelha: `1 failed | 130 skipped`; esperado `{ e: 0.8, muK: 0.25 }`, recebido `{ e: 0.5, muK: 0.8 }`, em `src/App.test.ts:278`. Mutação restaurada. O vermelho original detectou também a ausência do campo: esperava 6 inputs para dois pares, recebeu 4.
- `serialize` já omite propriedades indefinidas via JSON; não exigiu alteração. `SCENE_VERSION` continua 1. Integração de restituição no simulador permanece para PHY-68, como previsto.
- Gate final: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0. 31 arquivos de teste, 1043 testes aprovados; lint, typecheck e build aprovados. Vite avisou sobre chunk acima de 500 kB (simulador). `git diff --check` limpo; diff revisado, sem alterações no simulador nem artefatos gerados versionados.

#### Stage 3 — Review (2026-10-03)

**Standards:** um achado de documentação, corrigido: o comentário da política SOFT em `src/scene/index.ts` omitia o aviso para restituição fora de [0, 1]. Correção pequena autorizada pela regra de documentação desatualizada de `ticket-flow`, sem mudança de comportamento nem teste novo. Nenhum achado de código ou de separação entre commits de teste e implementação. `src/App.test.ts` está expressamente autorizado em “Tests stage 2 writes”.

**Spec:** nenhum achado. Critérios:

1. ✅ `e` finito é preservado; campo ausente continua ausente.
2. ✅ `e` não numérico ou não finito é rejeitado com erro em `contacts[i]`.
3. ✅ Cenas v5 mantêm os bytes canônicos sem `e`; campo definido faz round-trip; versão 1 preservada.
4. ✅ Avisos para valores fora de [0, 1], nenhum para 0, 1 ou ausência.
5. ✅ Adição padrão com `e: 0`; patch ordenado preserva atrito, outros pares e documento original.
6. ✅ Campo traduzido depois de μk, step 0,05, ausência exibida como 0, callback `{ e }`, sem clamp e com o bloqueio de edição existente.
7. ✅ `contacts.e` nos dois catálogos e testes de paridade verdes.

- Chamadores, falhas e interações examinados: persistência/hidratação, importação/exportação, comparação de bytes para dirty e autosave, cópia de presets, histórico e bloqueios de playback, adição pelo painel e pelo snap, guards de par duplicado/invertido/auto/dangling, override explícito de μ, patch imutável, `NumField`, renderização dos avisos e consumo de atrito pelo simulador. Nenhuma alteração de runtime fora do contrato. Passe manual de navegador não realizado nesta revisão; os testes Chromium do gate passaram.
- A linha `Proxy decided` sobre campo sem clamp, aviso suave e serialização opcional foi examinada e corresponde ao código e aos testes. A restituição no Rapier continua reservada ao PHY-68.
- Gate independente da revisão: 31 arquivos, 1043 testes aprovados; lint, typecheck e build aprovados, exit 0. A primeira execução no sandbox teve 15 falhas de conexão/desconexão do Chromium DevTools (1028 passaram); a execução completa fora do sandbox passou. Logs em `%TEMP%/phys67-review-gate-20261003.log` e `%TEMP%/phys67-review-gate-unsandboxed-20261003.log`.
- Mutate-verify repetido com as mutações do Stage 2: leitura/validação de `e` substituída por zero, limites de aviso alargados, default 1 e descarte de `patch.e`: 24 falhas, 158 passaram. Leitura de `e` acrescida de 1 e condição inteira do aviso invertida: 8 falhas, 8 passaram, 115 não selecionados. Logs em `%TEMP%/phys67-review-mutate-direct-20261003.log` e `%TEMP%/phys67-review-mutate-boundaries-20261003.log`.
- Mutate-verify DOM repetido, teste `shows restitution after kinetic friction for each pair and persists edits without clamping`: callback `onPatch(c.a, c.b, { e: v })` trocado por `{ muK: v }`; `1 failed | 130 skipped`, em `src/App.test.ts:278`, esperado `{ e: 0.8, muK: 0.25 }`, recebido `{ e: 0.5, muK: 0.8 }`. Log em `%TEMP%/phys67-review-mutate-dom-20261003.log`. Todos os arquivos mutados foram restaurados byte a byte e o diff de produção ficou vazio. Verde após restauração: codec/documento 182/182, DOM 1/1 (130 não selecionados).

#### Resolution (2026-10-03)

Verdict: Approve

- Decisão: sete critérios atendidos. Standards: um achado de documentação corrigido em `617d930`; Spec: zero achados. Nenhuma correção de runtime necessária na revisão.
- Arquivos: tipo e codec de Contact, operações do documento, `ContactsPanel`, catálogos pt-BR/en, testes de codec/documento/DOM, `CONTEXT.md` e comentário da política SOFT em `src/scene/index.ts`.
- Prova red-green: commits de testes anteriores à implementação e mutações repetidas na revisão, detalhadas acima. Vermelhos: 24 falhas no codec/documento, 8 falhas nos limites e 1 falha no callback DOM; após restauração, 182 testes diretos e o teste DOM passaram.
- Gate final depois da correção documental e do rebase: `npm test && npm run lint && npm run typecheck && npm run build`, exit 0; 31 arquivos, 1043 testes aprovados, lint/typecheck/build aprovados. Log em `%TEMP%/phys67-review-final-gate-20261003.log`. Permanece o aviso conhecido do Vite para o chunk do simulador acima de 500 kB.
- Integração: branch revisada `617d930` integrada sem squash em `sweatshop/2026-10-03-1618`, merge `c0a639f`. Fechamento e ledger no mesmo commit na sessão.
- Limitação prevista: o editor e o codec armazenam `e`; sua aplicação nas colisões do simulador será entregue pelo PHY-68.
