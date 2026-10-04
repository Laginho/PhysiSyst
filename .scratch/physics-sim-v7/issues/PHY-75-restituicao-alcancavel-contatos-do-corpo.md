# PHY-75: Restituição alcançável e contatos no painel do corpo
Stage: to-implement
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

- 2026-10-04 Stage 1 (planner, grilling confirmado pelo Bruno em outro chat). Bruno decidiu: retrofit dos presets com o par com o chão (μ = 0, e = 0), comportamento igual; `ContactsPanel` sai; seção "contatos de m_a" no painel do corpo, par alcançável dos dois lados; parceiro em `<select>` (dinâmicos pelo rótulo de massa, fixos como "fixo: retângulo 1"); sem `e` padrão por cena.
- Planner: rótulo fixo sempre numerado, `n` entre os fixos da mesma forma na ordem do documento, forma pelas strings da paleta; `<select>` só com parceiros ainda não pareados. O "≈" na aceleração analítica de queda livre e projétil antes do primeiro passo é consequência de `isHeld` e fica.
