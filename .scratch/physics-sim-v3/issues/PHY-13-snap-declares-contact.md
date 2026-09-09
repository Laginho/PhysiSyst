# PHY-13: Snap declara Contato
Stage: to-review
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
