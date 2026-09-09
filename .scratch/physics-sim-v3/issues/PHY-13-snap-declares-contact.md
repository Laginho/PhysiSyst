# PHY-13: Snap declara Contato
Stage: to-implement
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/editor/contactSnap.ts` (resolver devolve também o vizinho vencedor)
  - `src/editor/contactSnap.test.ts`
  - `src/editor/doc.ts` (`CONTACT_DEFAULTS`, `addContact`)
  - `src/editor/doc.test.ts`
  - `src/App.tsx` (pointer-up do arraste de movimento)
  - `src/App.test.ts`

#### What to build

Quando o aluno arrasta um Corpo e o snap o encosta em um vizinho (rampa, chão, outro bloco, círculo), soltar o mouse cria o Contato entre os dois no doc, com μs = μk = 0. O par aparece no painel de contatos sem aviso nem destaque; o aluno digita μ só se o enunciado der. Re-encostar dois corpos que já têm Contato não duplica. Afastar o corpo depois não remove o Contato. O padrão do botão "adicionar contato" do painel também passa a ser μ = 0, para que exista um único padrão (ADR-0002: idealização padrão, realismo opt-in).

#### Acceptance criteria

1. O resolver de snap devolve, além do Corpo ajustado, a identidade do vizinho vencedor; nulo quando não houve snap ou o snap está desligado, e a função continua pura
2. A operação de doc que adiciona Contato aceita μ opcional e seu padrão é μs = μk = 0; o antigo padrão 0.3/0.25 não existe mais em lugar nenhum
3. O Contato é criado no pointer-up do arraste de movimento, nunca durante o movimento: uma sequência move→move→up com snap adiciona exatamente um par
4. Rejeição por par duplicado é no-op silencioso — re-snap não altera `contacts`
5. Afastar o corpo após o snap mantém o Contato
6. Soltar o corpo na lixeira após snap remove o corpo e não deixa Contato pendente
7. Verificação live em browser: bloco encostado na rampa por snap, μ digitado no par recém-criado, play, bloco fica parado ou desce com a aceleração `g(sinα − μk·cosα)`
8. Nenhum texto novo em i18n; se algum for necessário, entra nos dois catálogos
9. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
10. Gate verde

#### Verification

    npx vitest run src/editor/contactSnap.test.ts src/editor/doc.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/contactSnap.test.ts`, no resolver puro: rampa, chão, círculo, fora da tolerância, múltiplos candidatos → o mais próximo. Vermelho porque o resolver ainda não devolve a identidade do vizinho.
- `src/editor/doc.test.ts`, em `addContact`/`CONTACT_DEFAULTS`: vermelho porque o padrão ainda é 0.3/0.25 e μ não é parâmetro.
- `src/App.test.ts`, no espelho do pointer: um par por arraste (critério 3), no-op no re-snap (4), Contato sobrevive ao afastamento (5), lixeira não deixa par pendente (6). Vermelhos porque o pointer-up ainda não cria Contato.

## Comments

#### Review (2026-09-09) — reopened

Produção está certa; os testes de App não são. O gate está verde (405/405, lint,
typecheck, build) e a verificação live confere, mas três dos quatro testes novos
de `src/App.test.ts` sobrevivem a mutações óbvias do código que dizem cobrir —
falha do protocolo mutate-verify do `AGENTS.md`.

- 1 ✓ resolver devolve `neighborId`, nulo fora de tolerância e com snap desligado, função pura
- 2 ✓ `CONTACT_DEFAULTS = { muS: 0, muK: 0 }`, `mu` opcional em `addContact`
- 3 ⚠️ o comportamento está certo (um par por arraste, criado no pointer-up), mas nenhum teste prende a metade "nunca durante o movimento": movendo o `addContact` para dentro do updater do `onPointerMove` a suíte inteira segue verde (405/405). O par único não distingue as duas implementações — a guarda de duplicado esconde a diferença. O observável que distingue: encostar no meio do arraste e **soltar longe** → nenhum Contato
- 4 ❌ o teste "re-snapping the same pair is a silent no-op" nunca re-encosta nada. `dragCaixaTo` sempre faz pointerdown em `screen(9, 3)`, a posição **original** da `caixa`; depois do primeiro arraste o corpo está em ≈(9, 0.78) e o pointerdown não acerta corpo nenhum, então o 2º e o 3º arrastes são no-ops e o `toEqual` passa por vacuidade. Prova: desligando a guarda de duplicado de `addContact` (`if (dup && false)`), `src/App.test.ts` continua 11/11 verde — só o `doc.test.ts` antigo falha. Um probe que agarra o corpo onde ele está (`screen(9, 0.78)`) pega a mutação: `['rampa ↔ bloco', 'caixa ↔ chao', 'caixa ↔ chao']`
- 5 ❌ mesmo defeito: o "afastar" do teste "moving the body away afterward keeps the Contact" é um no-op, o teste não exercita afastamento nenhum
- 6 ✓ o teste da lixeira agarra o corpo na posição real (`screen(9, 0.75)`) e vale
- 7 ✓ live em browser (dev server, cena demo limpa): arrastar `caixa` sobre a hipotenusa da `rampa` encaixa em `rotation = 0.5236` (30°) e `position = (5.6195, 2.3784)`, e cria `caixa ↔ rampa` com μs = μk = 0 no painel, sem aviso. Digitando μs = μk = 0.3 e dando play: `|a| = 2.36 m/s²`, vetor `(-2.04, -1.18)` — exatamente `g(sin30° − 0.3·cos30°) = 2.357` descendo a rampa
- 8 ✓ nenhum texto de i18n mudou
- 9 ❌ mutate-verify falhou para os três testes acima
- 10 ✓ gate verde

O que falta (só arquivos de teste; `src/App.tsx`, `contactSnap.ts` e `doc.ts` não precisam mudar):

1. `dragCaixaTo` tem de agarrar o corpo onde ele está agora, não onde nasceu — parametrizar a origem do arraste (ou ler a posição do painel) e reescrever os testes dos critérios 4 e 5 para arrastes de verdade
2. Um teste para a metade "nunca durante o movimento" do critério 3: pointermove que encosta, pointermove que sai da tolerância, pointerup longe → `contacts` intacto
3. Mutate-verify cada um: guarda de duplicado desligada e `addContact` movido para o `onPointerMove` têm de ficar vermelhos

Nota, não bloqueia: `src/scene/demo.ts` e `src/presets/index.ts` ainda trazem
pares com μ = 0.3/0.25 e 0.3/0.2 escritos à mão, e `persistence.test.ts:543`
afirma esses valores. Não é "o padrão antigo" (o padrão agora é 0/0), são cenas
autorais — mas se a intenção do critério 2 era que a cena demo também nascesse
idealizada, isso é outro ticket, fora dos Primary files deste.
