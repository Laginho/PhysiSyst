# PHY-31: Presets em árvore e os oito presets de vínculo
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-24, PHY-26
Review: agent

- Primary files:
  - `src/presets/index.ts`, `src/presets/presets.test.ts`
  - `src/App.tsx`, `src/App.test.ts` (galeria agrupada)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`, `src/i18n/i18n.test.ts`

#### What to build

A galeria de presets fica organizada como o livro do aluno: área → parte → tópico, seguindo o *Tópicos de Física* (spec, mapa de cobertura). Cada preset declara seu nó e sua posição no tópico, em dificuldade crescente. A galeria mostra só nós que têm preset. Nome, descrição e rótulos dos nós vêm do i18n. Os quatro presets atuais são realocados e entram oito novos, com valores que reproduzem as famílias de aceitação.

| Preset | Nó |
|---|---|
| Cunha empurrada (atual) | Mecânica / Dinâmica / Princípios |
| Bloco na rampa (atual) | Mecânica / Dinâmica / Atrito entre sólidos |
| Projétil oblíquo, Queda livre (atuais) | Mecânica / Dinâmica / Movimentos em campo gravitacional uniforme |
| Máquina de Atwood | Mecânica / Dinâmica / Princípios |
| Bloco na mesa com bloco pendurado (μₖ) | Mecânica / Dinâmica / Princípios |
| Polia móvel | Mecânica / Dinâmica / Princípios |
| Pêndulo em volta completa | Mecânica / Dinâmica / Resultantes tangencial e centrípeta |
| Pêndulo simples | Ondulatória / MHS |
| Massa-mola horizontal | Ondulatória / MHS |
| Massa-mola vertical | Ondulatória / MHS |
| Massa-mola amortecida | Ondulatória / MHS |

A ordem dentro de cada tópico é decisão do implementador, em dificuldade crescente; a curadoria fina fica para a etapa própria no fim da mecânica.

#### Acceptance criteria

1. Todo preset declara área, parte (quando houver) e tópico existentes na árvore do código, e uma posição; não há duas posições iguais no mesmo tópico
2. A árvore do código contém só os nós usados por algum preset
3. Nome, descrição e rótulos de nó vêm do i18n; nenhum texto de preset fica fixo no código; paridade nos dois catálogos
4. A galeria agrupa por nó, na ordem do livro, com os presets na ordem declarada; nós sem preset não aparecem
5. Os 12 presets parseiam, fazem round-trip e simulam sem aviso inesperado
6. Cada preset novo reproduz o número principal da sua família na tolerância do ticket de física correspondente (ex.: Atwood, `a`; pêndulo simples, período)
7. Criar cena a partir de preset continua funcionando (nome da cena no idioma atual)
8. Testes novos no `App.test.ts` com mutação e saída vermelha registradas
9. Gate verde

#### Verification

    npx vitest run src/presets src/i18n src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/presets/presets.test.ts`: nós, posições, round-trip, número de cada família (1, 2, 5, 6). Vermelho porque os presets não têm nó e os oito novos não existem.
- `src/i18n/i18n.test.ts`: chaves de preset e de nó nos dois catálogos (3).
- `src/App.test.ts`: galeria agrupada, nós vazios ausentes (4, 7).

## Comments
