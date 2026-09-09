# 02: Snap declara Contato

**What to build:** Quando o aluno arrasta um Corpo e o snap o encosta em um vizinho (rampa, chão, outro bloco, círculo), soltar o mouse cria o Contato entre os dois no doc, com μs = μk = 0. O par aparece no painel de contatos sem aviso nem destaque; o aluno digita μ só se o enunciado der. Re-encostar dois corpos que já têm Contato não duplica. Afastar o corpo depois não remove o Contato. O padrão do botão "adicionar contato" do painel também passa a ser μ = 0, para que exista um único padrão (ADR-0002: idealização padrão, realismo opt-in).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O resolver de snap devolve, além do Corpo ajustado, a identidade do vizinho vencedor; nulo quando não houve snap ou o snap está desligado (função continua pura, testada em `contactSnap.test.ts`: rampa, chão, círculo, fora da tolerância, múltiplos → o mais próximo)
- [ ] A operação de doc que adiciona Contato aceita μ opcional e seu padrão é μs = μk = 0; o antigo padrão 0.3/0.25 não existe mais em lugar nenhum (testes em `doc.test.ts`)
- [ ] O Contato é criado no pointer-up do arraste de movimento, nunca durante o movimento (espelho em `App.test.ts`: uma sequência move→move→up com snap adiciona exatamente um par)
- [ ] Rejeição por par duplicado é no-op silencioso (espelho: re-snap não altera `contacts`)
- [ ] Afastar o corpo após o snap mantém o Contato (espelho)
- [ ] Soltar o corpo na lixeira após snap remove o corpo e não deixa Contato pendente (a remoção com dependentes já cobre; um teste pina)
- [ ] Verificação live em browser: bloco encostado na rampa por snap, μ digitado no par recém-criado, play, bloco fica parado ou desce com a aceleração `g(sinα − μk·cosα)`
- [ ] Nenhum texto novo em i18n; se algum for necessário, entra nos dois catálogos
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
