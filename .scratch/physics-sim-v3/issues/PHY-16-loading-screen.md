# PHY-16: Tela de carregamento com personalidade
Stage: to-implement
Status: ready-for-agent
Blocked by: none

- Primary files:
  - New: `src/render/loadingMessage.ts` + `src/render/loadingMessage.test.ts` (a função pura `messageAt`)
  - `src/App.tsx` (boot no mount, estado `booting`, overlay, timer, retry)
  - `src/App.test.ts`
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts` (10 piadas + erro + "tentar de novo")

#### What to build

Ao abrir o app, o motor de física (wasm) começa a carregar imediatamente, não no primeiro play. Enquanto carrega, um overlay sobre o canvas mostra uma piada de física que troca a cada 1,5 s (10 mensagens, pt-BR e EN, sorteio inicial, nunca repete a anterior). Sem rodapé "sério": a piada é a mensagem. Quando o motor fica pronto, o overlay some e o primeiro play é instantâneo. Se o carregamento falhar, o overlay mostra uma mensagem de erro fixa e um botão "tentar de novo" que reexecuta o boot.

#### Acceptance criteria

1. O boot do simulador é disparado no mount do App (o boot compartilhado e idempotente já existe; só o gatilho muda)
2. Estado visível "booting" mostra o overlay até o boot resolver; o overlay não bloqueia a edição de cena — o aluno pode montar a cena enquanto a física chega
3. 10 chaves `loading.msg.01`…`loading.msg.10` nos dois catálogos, com o texto da tabela da spec (o dono do produto pode cortar; se cortar, o `count` acompanha)
4. Chaves para a mensagem de erro e o botão "tentar de novo" nos dois catálogos
5. Função pura `messageAt(seed, tick, count)` → índice: determinística, cobre todos os índices ao longo de `count` ticks, nunca devolve o mesmo índice em dois ticks consecutivos
6. Rotação a cada 1,5 s via timer que é limpo quando o overlay some
7. Falha no boot mostra o erro fixo e o botão; clicar reexecuta o boot (o retry já é suportado pelo boot compartilhado)
8. Paridade pt-BR/EN verde em `i18n.test.ts`
9. Verificação live em browser: recarregar a página mostra o overlay com piada, some quando o motor carrega, e o primeiro play não tem atraso perceptível; simular falha (ex.: bloquear o wasm no devtools) mostra erro e "tentar de novo" funciona
10. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
11. Gate verde

#### Verification

    npx vitest run src/render/loadingMessage.test.ts src/App.test.ts src/i18n/i18n.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/loadingMessage.test.ts`, na função pura: determinismo, cobertura de todos os índices, nunca dois ticks iguais em sequência (critério 5). Vermelho porque a função não existe.
- `src/App.test.ts`, no espelho: boot disparado no mount (1), overlay não bloqueia edição (2), timer limpo quando o overlay some (6), retry refaz a promessa (7). Vermelhos porque o boot hoje só acontece no primeiro play.
- `src/i18n/i18n.test.ts` continua sendo a paridade (8) — não é teste novo.

## Comments
