# PHY-16: Tela de carregamento com personalidade
Stage: implementing
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
2. Estado visível "booting" mostra o overlay até o boot resolver; o overlay não bloqueia a edição de cena — o aluno pode montar a cena enquanto a física chega — ❌ **caiu na 2ª revisão (2026-09-11):** o badge durante `booting` está correto; o que cai agora é o overlay de `error` (`inset: 0`, opaco, sem `pointerEvents`), que sobrevive a um boot bem-sucedido disparado por play/passo/atalho — a cena roda por baixo dele e a edição no canvas fica morta sem saída. Ver o bloco de revisão no fim.
3. 10 chaves `loading.msg.01`…`loading.msg.10` nos dois catálogos, com o texto da tabela da spec (o dono do produto pode cortar; se cortar, o `count` acompanha)
4. Chaves para a mensagem de erro e o botão "tentar de novo" nos dois catálogos
5. Função pura `messageAt(seed, tick, count)` → índice: determinística, cobre todos os índices ao longo de `count` ticks, nunca devolve o mesmo índice em dois ticks consecutivos
6. Rotação a cada 1,5 s via timer que é limpo quando o overlay some
7. Falha no boot mostra o erro fixo e o botão; clicar reexecuta o boot (o retry já é suportado pelo boot compartilhado) — ❌ **caiu na 2ª revisão (2026-09-11):** a superfície única de erro está certa; o que cai é a saída do estado de erro — só o botão "tentar de novo" move `bootState`, e `togglePlay`/`stepOnce` chamam `ensureSim()` direto, rebootam com sucesso e deixam `bootState` em `error`. Ver o bloco de revisão no fim.
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

## Revisão stage 3 (2026-09-11) — reaberto

Portão verde (`npm test && npm run lint && npm run typecheck && npm run build`,
exit 0) e a separação dos commits está correta: `ccb8f7c` é só teste, os commits
de código não tocam em arquivo de teste, e o log mutate-verify bate com o
protocolo do `AGENTS.md`. Nada disso é o problema — os dois achados abaixo são de
comportamento, e ambos precisam de teste novo, então não cabem em fix pequeno.

### O que falta (só isto)

1. **Critério 2 — o overlay bloqueia a edição no canvas.** Ver o ❌ no critério.
   O teste que diz cobrir isso clica em `retângulo` na paleta, que fica *fora* do
   overlay: ele passa com o canvas inteiro morto. **Cuidado com o fix óbvio:** só
   pôr `pointerEvents: 'none'` no overlay deixa o aluno arrastar corpos que ele
   não enxerga, porque o fundo é `rgba(250, 251, 252, 0.92)` — praticamente
   opaco. Decidir a direção antes de codar: overlay translúcido de verdade,
   overlay que não cobre o canvas inteiro, ou assumir que arrastar espera o boot
   e corrigir o critério. Se a escolha for a terceira, isto vira mudança de
   critério e sobe para o stage 1, não se resolve aqui.
   O teste novo tem que exercitar o seam de ponteiro do canvas durante `booting`
   (não um botão de paleta), e mutate-verify conforme o `AGENTS.md`.

2. **Critério 7 — duas superfícies de erro.** Ver o ❌ no critério. O fix mora em
   `src/App.tsx` (o par `ensureSim`/`bootOnce`), dentro dos Primary files. O
   teste `shows a fixed error with a retry button…` precisa passar a afirmar que
   o texto cru da exceção **não** aparece.

### Notas, não bloqueiam (não viram critério)

- `LOADING_MESSAGE_COUNT = 10` é literal copiado à mão, e o `10` se repete em
  `App.test.ts`. O critério 3 já assume que isso é manual ("se cortar, o `count`
  acompanha"), então não é violação — mas derivar o `count` do catálogo mataria
  a chance de alguém cortar uma piada e o aluno ver `loading.msg.10` cru na tela.
  `t(\`loading.msg.${…}\`)` é a única chave dinâmica do repo: é o único lugar onde
  um off-by-one escapa do `tsc` e do `i18n.test.ts`.
- `bootOnce` faz `setMessageTick(0)` com o mesmo `bootSeedRef`, então todo retry
  repete a mesma ordem de piadas desde a primeira. A spec sorteia o índice
  inicial uma vez por sessão, o que o código cumpre; re-sortear no retry seria
  só simpático.
- `useRef(Math.floor(Math.random() * 0x7fffffff))` re-sorteia a cada render e
  joga fora. Inofensivo, mas é ruído.
- `.claude/launch.json` (entrada `preview`) ficou sujo na árvore e não está nos
  Primary files. Não entrou em nenhum commit — não deixar entrar neste ticket.

## Reabertura — correções stage 2 (2026-09-11)

Os dois achados da revisão (critério 2 e critério 7) resolvidos, com teste
novo em cada um, mutate-verified, e reverificação live em browser.

### Critério 2 — overlay não bloqueia mais o canvas

Direção escolhida: **overlay não cobre o canvas inteiro.** Enquanto
`bootState === 'booting'`, a piada aparece num badge pequeno (ancorado no
topo, `maxWidth: 80%`) em vez do antigo `inset: 0` sobre a caixa toda —
`pointerEvents: 'none'` nesse badge é seguro precisamente porque ele não
esconde o canvas por baixo (o cuidado do critério: pointer-events:none
sozinho, num overlay opaco cobrindo tudo, deixaria o aluno arrastar corpos
que não enxerga). O estado `error` continua com o overlay cheio, opaco e
capturando ponteiro — só o botão "tentar de novo" precisa ser clicável, e a
spec não pede edição de cena durante uma falha de boot.

Teste novo: `App.test.ts`, "shows the loading overlay while booting, without
blocking canvas pointer events". `canvas.dispatchEvent(...)` não serve para
provar isto — o jsdom despacha o evento direto no nó alvo, sem hit-testing
real por posição/z-order, então um clique no `<canvas>` "funcionaria" mesmo
com um overlay cobrindo tudo num browser de verdade. O teste em vez disso lê
o próprio nó do overlay (`loadingOverlay(host)`, o único irmão do
`<canvas>` na caixa) e afirma `style.pointerEvents === 'none'` e
`style.inset !== '0'` — o mecanismo real que decide, num browser, se o
clique atravessa até o canvas.

Mutate-verify (`npx vitest run src/App.test.ts -t "without blocking canvas pointer events"`):

1. Removido `pointerEvents: 'none'` do badge. Vermelho:
   `expected '' to be 'none'`.
2. Reintroduzido `inset: 0` no badge (badge voltando a cobrir a caixa
   inteira). Vermelho: `expected '0' not to be '0'`.

### Critério 7 — uma só superfície de erro

Causa raiz: o caminho de rejeição de `ensureSim` chamava `fail(e)`, que
seta `simError` com o texto cru da exceção — em paralelo à mensagem fixa do
overlay. Como `simRef.current` só é escrito no braço de sucesso do boot
(nunca resetado depois), esse caminho de rejeição só é alcançável **antes**
de qualquer boot bem-sucedido — `playbackRef.current.status` não pode ser
outra coisa que `'paused'` nesse ponto (nada chama `dispatch({type:'play'})`
sem um `sim` resolvido). O `advance(..., {type:'pause'})` dentro de `fail`
era portanto um no-op nesse caminho: a chamada inteira a `fail(e)` foi
removida do braço de rejeição, deixando o overlay como única superfície.

Teste alterado: `App.test.ts`, "shows a fixed error with a retry button on
boot failure…" ganhou `expect(host.textContent).not.toContain('boom')`.

Mutate-verify (`npx vitest run src/App.test.ts -t "shows a fixed error with a retry button"`):

1. Reinstalado `fail(e)` no braço de rejeição. Vermelho: o texto cru `'boom'`
   volta a aparecer via o painel `simError` — `expected '...boom' not to
   contain 'boom'`.

### Verificação live em browser (critérios 2, 7, 9 — reverificação)

`npm run dev`, mesma técnica de atraso/falha artificial e local em
`ensureSim` da rodada anterior (nunca commitado — `git diff --stat` limpo
depois de cada reversão, confirmado acima).

- **Overlay não bloqueia (critério 2)**: com atraso artificial de 4 s,
  recarregar mostrou o badge "Renormalizando o infinito…" confinado ao topo
  do canvas. Arrastei um corpo (retângulo) para outra posição enquanto o
  badge ainda estava visível — o corpo moveu (painel "leitura — retangulo"
  confirmou a posição nova, (10.06, 9.73) m) e ficou selecionado, prova de
  que o ponteiro chegou ao canvas por baixo do badge.
- **Primeiro play instantâneo (critério 9)**: boot completou (badge sumiu
  do texto da página), cliquei "▶ reproduzir" e o botão virou "⏸ pausar" na
  mesma interação, sem atraso perceptível.
- **Uma só superfície de erro (critério 7)**: com o boot forçado a rejeitar
  sempre, recarregar mostrou só "não foi possível carregar o motor de
  física" + "tentar de novo" — sem o painel "erro de simulação" e sem o
  texto cru da exceção (`falha simulada de boot`) em lugar nenhum da
  página. Cliquei "tentar de novo": mesma superfície única reaparece, sem
  duplicata.

### Gate

`npm test && npm run lint && npm run typecheck && npm run build` — exit 0,
458 testes verdes.

## Revisão stage 3 (2026-09-11, 2ª rodada) — reaberto

Os dois achados da 1ª rodada estão genuinamente resolvidos, e os testes novos
exercitam o seam certo: o badge de `booting` deixa o ponteiro passar
(`loadingOverlay(host)` lê o nó real do overlay, não um botão de paleta), e o
caminho de rejeição de `ensureSim` não seta mais `simError` — a análise de
alcançabilidade que justifica remover `fail(e)` inteiro confere (`simRef.current`
só é escrito no braço de sucesso, então o `advance(..., 'pause')` era no-op ali).
Portão verde (`npm test && npm run lint && npm run typecheck && npm run build`,
exit 0, 458 testes). Separação dos commits correta: `ccb8f7c` e `ca95d86` só
tocam arquivo de teste, os commits de código não tocam nenhum. O log
mutate-verify bate com o protocolo do `AGENTS.md`.

Cai por um terceiro achado, da mesma forma dos dois primeiros: a transição de
estado mora só no `bootOnce`, não no boot compartilhado por onde todo mundo passa.

### O que falta (só isto)

1. **Critérios 2 e 7 — o overlay de erro sobrevive a um boot bem-sucedido.**
   `bootState` só é escrito por `bootOnce`. `togglePlay` e `stepOnce`
   (`src/App.tsx:904`, `:910`, e os atalhos de teclado que passam por eles)
   chamam `ensureSim()` direto. Depois de uma falha, `simBootRef.current` fica
   `null`, então apertar ▶ dispara um segundo boot — que resolve — e a simulação
   começa a rodar com `bootState` ainda em `error`.

   Provado com um teste descartável (rodado e apagado, árvore limpa): com a
   primeira tentativa rejeitada, clicar ▶ deixa na tela ao mesmo tempo
   "tentar de novo" e "⏸ pausar", `createSimulator` chamado 2 vezes, e o texto
   "não foi possível carregar o motor de física" ainda presente. Como esse
   overlay é `inset: 0`, opaco e **sem** `pointerEvents: 'none'`, a edição no
   canvas fica morta — a mesma falha do critério 2 da 1ª rodada, por outra porta,
   e agora permanente (a piada some sozinha, o erro não).

   O fix mora nos Primary files (`src/App.tsx`, o par `ensureSim`/`bootOnce`). A
   forma barata é a mesma dos outros dois achados: a transição desce para
   `ensureSim`, por onde os três chamadores passam, em vez de ficar no
   `bootOnce`. Teste novo exercitando o seam de play durante `error`, e
   mutate-verify conforme o `AGENTS.md`.

### Notas, não bloqueiam (não viram critério)

- `expect(overlay.style.inset).not.toBe('0')` só pega a shorthand `inset`: uma
  regressão escrita como `top/right/bottom/left: 0` passaria. Apertar a asserção
  é de graça enquanto o arquivo estiver aberto.
- O esquema de chave `loading.msg.NN` é montado por aritmética de string em dois
  lugares (`App.tsx` e `App.test.ts`), e `LOADING_MESSAGE_COUNT = 10` é um
  terceiro ponto a editar quando o dono do produto cortar uma piada. Continua
  coberto pelo critério 3 ("se cortar, o `count` acompanha") — mas é a única
  chave dinâmica do repo, invisível para o `tsc` e para o `i18n.test.ts`.
- `messageAt` reconstrói a permutação inteira (mulberry32 + Fisher-Yates) a cada
  render para escolher 1 de 10 strings, e a semente nasce de `Math.random()` no
  mount, nunca persistida — o determinismo que o PRNG compra é consumido só pelo
  próprio teste. Funciona e está testado; é mais máquina do que o critério 5 pede.
- `bootOnce` não é "once": o botão de retry chama de novo. O nome confunde.
- `vi.mock('./sim')` é de arquivo inteiro, então nenhum dos 23 testes antigos de
  `App.test.ts` exercita mais o boot real do wasm. Documentado no ticket e
  defensável, mas a cobertura de integração daquele caminho saiu.
- `.claude/launch.json` continua sujo na árvore e fora dos Primary files. Não
  entrou em nenhum commit — não deixar entrar neste ticket.

## Comments
