# PHY-67: Coeficiente de restituição no Contact e no editor
Stage: implementing
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
