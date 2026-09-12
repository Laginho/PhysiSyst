# PHY-16: Tela de carregamento com personalidade
Stage: to-review
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

O mock de `./sim` em `App.test.ts` (`vi.mock('./sim', ...)` com `createSimulator`
substituído por um fake sem física real) não existia antes deste ticket — foi
necessário para controlar deterministicamente quando o boot resolve/rejeita
(a promessa de wasm real não dá para pausar em vermelho nem simular falha em
`vi.mocked(...).mockRejectedValueOnce`). Nenhum teste existente checa física
real (posição simulada, gravidade), só estado de doc/UI, então o fake é
transparente para os 23 testes anteriores — todos continuam verdes, só mais
rápidos (sem esperar o boot real do wasm).

## Mutate-verify (App.test.ts, seam DOM/integração)

Cada mutação abaixo foi aplicada em `src/App.tsx`, rodada isoladamente (`npx
vitest run src/App.test.ts -t "<nome>"`), confirmado vermelho pelo motivo
certo, depois revertida. `loadingMessage.test.ts` chama a função de produção
direto — sem registro aqui, por protocolo.

1. **"boots the simulator on mount..."** — o `useEffect` de mount deixou de
   chamar `bootOnce()`. Vermelho: `createSimulator` chamado 0 vezes em vez de
   1 — `expected "vi.fn()" to be called 1 times, but got 0 times`.
2. **"shows the loading overlay while booting..."** — a condição do overlay
   virou `{false && bootState !== 'ready' && (...)}` (nunca renderiza).
   Vermelho: nenhuma das 10 piadas aparece no texto da página —
   `expected false to be true`.
3. **"rotates the message every 1.5s and clears the timer..."** — o cleanup
   do `useEffect` do timer (`return () => clearInterval(id)`) foi removido.
   Vermelho: `clearInterval` nunca chamado ao ficar pronto —
   `expected "clearInterval" to be called at least once`.
4. **"shows a fixed error with a retry button..."** — o `onClick` do botão
   "tentar de novo" virou um no-op (`() => {}`), sem chamar `bootOnce`.
   Vermelho: `createSimulator` chamado 1 vez em vez de 2 após o clique —
   `expected "vi.fn()" to be called 2 times, but got 1 times`.

## Verificação live em browser (critério 9)

`npm run dev` via preview do editor. O boot real (wasm já em cache do Vite)
resolve rápido demais para observar visualmente, então cada verificação abaixo
usou um atraso/falha temporários e locais em `ensureSim` (nunca commitados —
conferido com `git diff --stat` limpo depois de cada reversão) só para dar
tempo de olhar o estado intermediário; o código revertido é o mesmo dos
commits acima.

- **Overlay durante o boot (1, 2, 3)**: com um atraso artificial de 4 s,
  recarregar a página mostrou o overlay confinado à caixa do canvas
  ("Discutindo se g é 9,8 ou 10…"), com a paleta e os painéis laterais
  intactos e clicáveis. Cliquei "retângulo" enquanto o overlay ainda mostrava
  outra piada ("Considerando a vaca esférica…") e o corpo foi criado
  normalmente (painel "leitura — retangulo-2" apareceu) — a edição de cena
  não fica bloqueada.
- **Rotação (6)**: com o mesmo atraso, aguardei ~2 s a mais e a piada exibida
  mudou (rotação ativa); quando o boot completou, o overlay desapareceu por
  completo (sem piada nem qualquer resquício no texto da página).
- **Primeiro play instantâneo (1)**: após o boot completar, cliquei
  "▶ reproduzir" e o botão virou "⏸ pausar" no mesmo lote de ação, sem
  atraso perceptível.
- **Falha simulada + retry (4, 7)**: com a primeira tentativa de boot forçada
  a rejeitar, recarregar mostrou "não foi possível carregar o motor de
  física" com o botão "tentar de novo"; cliquei o botão e, com a segunda
  tentativa liberada para suceder, o overlay saiu do estado de erro,
  rebootou (nova piada, "Renormalizando o infinito…") e completou
  normalmente — cena inteira visível e interativa de novo, sem erro no
  console.

Sem teste jsdom para o timing real do boot (jsdom não carrega wasm real) —
coberto só pela verificação live acima; os testes automatizados cobrem a
lógica de estado (booting/ready/error) com o `./sim` mockado.

## Comments
