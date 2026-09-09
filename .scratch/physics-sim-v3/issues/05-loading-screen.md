# 05: Tela de carregamento com personalidade

**What to build:** Ao abrir o app, o motor de física (wasm) começa a carregar imediatamente, não no primeiro play. Enquanto carrega, um overlay sobre o canvas mostra uma piada de física que troca a cada 1,5 s (10 mensagens, pt-BR e EN, sorteio inicial, nunca repete a anterior). Sem rodapé "sério": a piada é a mensagem. Quando o motor fica pronto, o overlay some e o primeiro play é instantâneo. Se o carregamento falhar, o overlay mostra uma mensagem de erro fixa e um botão "tentar de novo" que reexecuta o boot.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O boot do simulador é disparado no mount do App (o boot compartilhado e idempotente já existe; só o gatilho muda)
- [ ] Estado visível "booting" mostra o overlay até o boot resolver; o overlay não bloqueia a edição de cena (o aluno pode montar a cena enquanto a física chega)
- [ ] 10 chaves `loading.msg.01`…`loading.msg.10` nos dois catálogos, com o texto da tabela da spec (o dono do produto pode cortar; se cortar, o `count` acompanha); paridade em `i18n.test.ts` verde
- [ ] Chaves para a mensagem de erro e o botão "tentar de novo" nos dois catálogos
- [ ] Função pura `messageAt(seed, tick, count)` → índice: determinística, cobre todos os índices ao longo de `count` ticks, nunca devolve o mesmo índice em dois ticks consecutivos (testes unitários)
- [ ] Rotação a cada 1,5 s via timer que é limpo quando o overlay some
- [ ] Falha no boot mostra o erro fixo e o botão; clicar reexecuta o boot (o retry já é suportado pelo boot compartilhado; um teste no espelho pina que a promessa é refeita)
- [ ] Verificação live em browser: recarregar a página mostra o overlay com piada, some quando o motor carrega, e o primeiro play não tem atraso perceptível; simular falha (ex.: bloquear o wasm no devtools) mostra erro e "tentar de novo" funciona
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
