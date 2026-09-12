# PHY-16: Tela de carregamento com personalidade
Stage: done
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
2. Estado visível "booting" mostra o overlay até o boot resolver; o overlay não bloqueia a edição de cena — o aluno pode montar a cena enquanto a física chega — ✅ (caiu nas duas revisões; corrigido na 2ª reabertura, ver o bloco no fim)
3. 10 chaves `loading.msg.01`…`loading.msg.10` nos dois catálogos, com o texto da tabela da spec (o dono do produto pode cortar; se cortar, o `count` acompanha)
4. Chaves para a mensagem de erro e o botão "tentar de novo" nos dois catálogos
5. Função pura `messageAt(seed, tick, count)` → índice: determinística, cobre todos os índices ao longo de `count` ticks, nunca devolve o mesmo índice em dois ticks consecutivos
6. Rotação a cada 1,5 s via timer que é limpo quando o overlay some
7. Falha no boot mostra o erro fixo e o botão; clicar reexecuta o boot (o retry já é suportado pelo boot compartilhado) — ✅ (caiu nas duas revisões; corrigido na 2ª reabertura, ver o bloco no fim)
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

## Reabertura 2 — correções stage 2 (2026-09-11)

O terceiro achado (critérios 2 e 7, overlay de erro sobrevivendo a um boot
disparado por play) resolvido na raiz, com teste novo, mutate-verified, e
reverificação live.

### A causa, e por que os três achados têm a mesma forma

As transições de `bootState` moravam no `bootOnce`, que era só **um** dos
caminhos de boot. `togglePlay`, `stepOnce` e os atalhos de teclado chamam
`ensureSim()` direto; depois de uma falha `simBootRef.current` fica `null`,
então apertar ▶ começava um segundo boot que resolvia com `bootState` ainda em
`error` — cena rodando atrás de um painel opaco `inset: 0` sem
`pointerEvents: 'none'`, sem saída.

A transição desceu para dentro do `ensureSim`, por onde os quatro chamadores
passam: `'booting'` quando um boot de fato começa (o `??=` virou um `if`
explícito, para saber a diferença entre começar um boot e pegar carona em um já
em voo), `'ready'`/`'error'` nos braços da promessa. `bootOnce` virou
`retryBoot` e agora só reinicia a rotação de piadas — o nome também parou de
mentir (o botão chama mais de uma vez).

Efeito colateral de graça: apertar ▶ depois de uma falha agora volta a mostrar
a piada em vez de congelar no erro, porque o `'booting'` sai do mesmo lugar.

### Teste novo

`src/App.test.ts`, "leaves the error state when a boot triggered by play
succeeds": rejeita o primeiro boot, confere a mensagem fixa, então clica **▶
reproduzir** (não o "tentar de novo") com a segunda tentativa liberada para
suceder, e afirma `createSimulator` chamado 2×, a mensagem de erro fora da
página e `loadingOverlay(host)` inexistente — o canvas sem nenhum irmão por
cima.

Mutate-verify (`npx vitest run src/App.test.ts -t "leaves the error state"`):

1. Removido `setBootState('ready')` do braço de sucesso. Vermelho: o overlay
   continua na tela depois do boot bem-sucedido —
   `expected <div …(1)></div> to be undefined`.
2. Removido `setBootState('error')` do braço de rejeição. Vermelho: a mensagem
   fixa nunca aparece — `expected '…Convencendo o gato de Schrödinger…' to
   contain 'não foi possível carregar o motor de física'`.

### Asserção de cobertura apertada (nota da revisão)

`expect(overlay.style.inset).not.toBe('0')` só pegava a shorthand. Agora o
teste varre `inset/top/right/bottom/left` contra `'0'` **e** `'0px'`: o jsdom
mantém o `inset` (que ele não suporta) cru em `'0'` mas normaliza as longhands
para `'0px'`, então checar só uma das grafias deixa a outra passar — a primeira
versão desta asserção passou com o badge mutado para cobertura total escrita à
moda longa, e foi refeita por causa disso.

Mutate-verify (`npx vitest run src/App.test.ts -t "without blocking canvas pointer events"`):

1. Badge remontado como cobertura total à moda longa
   (`top/right/bottom/left: 0`). Vermelho:
   `expected { edge: 'top', value: '0px' } to not deeply equal …`.
2. Badge remontado com a shorthand (`inset: 0`). Vermelho:
   `expected { edge: 'inset', value: '0' } to not deeply equal …`.

### Semente sorteada uma vez (nota da revisão)

`useRef(Math.floor(Math.random() * 0x7fffffff))` re-sorteava a cada render e
jogava fora. Virou `useState(() => …)` com inicializador preguiçoso: um sorteio
por sessão, que é o que a spec pede. Sem teste novo — comportamento observável
idêntico, e a rotação já é coberta pelos testes de `messageAt`.

### Verificação live em browser (critérios 2, 7, 9)

`npm run dev`. Falha de boot simulada por um toggle local e temporário em
`ensureSim` lido de `sessionStorage` (nunca commitado — `git diff --stat` limpo
depois da reversão, com o `grep` do toggle voltando 0).

- Com `failBoot=1`, recarregar mostrou só "não foi possível carregar o motor de
  física" + "tentar de novo".
- Limpei o toggle e cliquei **▶ reproduzir** (não o retry): a mensagem de erro
  sumiu da página, o botão virou "⏸ pausar" e o canvas apareceu inteiro e
  limpo, cena visível — exatamente o que ficava escondido atrás do painel antes.

### Gate

`npm test && npm run lint && npm run typecheck && npm run build` — exit 0,
459 testes verdes (458 + o novo).

#### Resolution (2026-09-11)

**Decisão: aprovado e mergeado.** Stage 3 não mudou nenhuma linha de código —
merge direto em `main` (`--no-ff`, sem squash), `Stage: done` e a linha do
ledger neste mesmo commit. Terceira rodada de revisão; os três achados das
rodadas anteriores estão fechados e nenhum achado novo derruba um critério.

**Portão**, rodado pelo reviewer antes de qualquer leitura de código
(`npm test && npm run lint && npm run typecheck && npm run build`): exit 0,
**27 arquivos de teste, 459 testes, todos verdes**; lint, `tsc --noEmit` e
build limpos (só o aviso pré-existente de chunk > 500 kB).

**Separação dos commits** conferida commit a commit: `ccb8f7c`, `84ba7f0`,
`ca95d86`, `43a04ef` e `403a3aa` tocam só arquivo de teste (+ o md do ticket);
`6e877fc`, `22a0d8f`, `b1ffb39`, `d75942f`, `89919d0` e `6b775c2` não tocam
nenhum arquivo de teste. `.claude/launch.json` continuou sujo na árvore e não
entrou em commit nenhum — conferido com `git diff-tree` em cada commit da
branch.

**Mutate-verify reexecutado pelo reviewer.** As 10 mutações registradas neste
ticket foram reaplicadas uma a uma em `src/App.tsx`, cada uma rodada isolada
com `-t`, e revertidas (árvore limpa depois de cada uma). Todas voltaram
vermelhas **pelo motivo exato registrado** — nenhuma ficou verde:

| # | Mutação | Vermelho obtido |
|---|---|---|
| 1 | efeito de mount não chama mais o boot | `expected "vi.fn()" to be called 1 times, but got 0 times` |
| 2 | overlay de `booting` nunca renderiza | `expected false to be true` |
| 3 | cleanup do timer de rotação removido | `expected "clearInterval" to be called at least once` |
| 4 | `onClick` do "tentar de novo" vira no-op | `expected "vi.fn()" to be called 2 times, but got 1 times` |
| 5 | badge perde `pointerEvents: 'none'` | `expected '' to be 'none'` |
| 6 | badge volta a `inset: 0` (shorthand) | `expected { edge: 'inset', value: '0' } to not deeply equal …` |
| 7 | badge cobre tudo à moda longa | `expected { edge: 'top', value: '0px' } to not deeply equal …` |
| 8 | braço de sucesso sem `setBootState('ready')` | `expected <div …(1)></div> to be undefined` |
| 9 | braço de rejeição sem `setBootState('error')` | `expected '…' to contain 'não foi possível carregar…'` |
| 10 | `fail(e)` reinstalado no braço de rejeição | `expected '…' not to contain 'boom'` |

Correção no registro, não na evidência: as mutações 1 e 4 estão escritas em
termos de `bootOnce()`, que o commit `89919d0` renomeou/dissolveu (`retryBoot`
+ a transição dentro de `ensureSim`). Foram reexecutadas contra a forma que a
branch de fato entrega — o efeito de mount chamando `ensureSim()` e
`onClick={retryBoot}` — e deram o mesmo vermelho. A evidência vale; só o texto
envelheceu.

**Critério 9 (verificação live) — por que o registro serve.** A preocupação
legítima é que a verificação live da Reabertura 1 antecede o refactor final.
Conferido no diff: `89919d0` mexe só no encanamento do boot mais o nome do
handler do botão (`onClick={bootOnce}` → `onClick={retryBoot}`); o JSX do badge
e do painel de erro é **byte a byte idêntico** ao que foi verificado live.
Os riscos que só o browser pega (timing real do wasm, pintura, hit-test real)
não mudaram, e o que o refactor mudou — as transições de estado — está preso
pelas mutações 8 e 9 em jsdom. A Reabertura 2 ainda reverificou live o par
falha → ▶ play pós-refactor. Critério 9 honestamente atendido; fica só a
observação de que a perna do botão "tentar de novo" foi reverificada em jsdom,
não live, depois da renomeação.

**Critérios 1–11: todos atendidos.** Os 10 textos de piada batem com a tabela
da spec palavra por palavra nos dois catálogos (3); `i18n.test.ts` varre todas
as chaves, então as 12 novas entram na paridade de graça (4, 8).

**Achados das duas revisões paralelas, adjudicados — nenhum derruba critério:**

- *"O overlay virou badge sem emenda de spec"*: a revisão da 1ª rodada listou
  três direções aceitáveis e a 2ª delas era exatamente "overlay que não cobre o
  canvas inteiro". Só a 3ª (assumir que arrastar espera o boot) exigia subir
  para stage 1. A escolha foi a 2ª — dentro do que a revisão autorizou.
- *"Critério 2 vale só em `booting`; o overlay de `error` bloqueia"*: o critério
  tem `booting` como sujeito, e a spec não pede edição de cena durante falha de
  boot. Desde `89919d0` esse estado também não sobrevive a um boot bem-sucedido
  — que era o achado da 2ª rodada, agora fechado.
- *`LOADING_MESSAGE_COUNT` em três lugares / chave dinâmica*: o critério 3
  assume manutenção manual ("se cortar, o `count` acompanha"). Endossado pelo
  critério, não é violação — mas é a terceira revisão seguida que anota isso.
- *`position: 'relative'` na caixa do canvas sem teste nem mutação*: jsdom não
  tem layout, então não há mutação possível ali; está coberto pela verificação
  live ("badge confinado ao topo do canvas"). Afeta onde o badge desenha, não
  se o aluno consegue editar — e as propriedades que decidem isso
  (`pointerEvents`, cobertura) estão presas pelas mutações 5, 6 e 7.
- *`messageAt` é mais máquina que o critério 5 pede*, *`vi.mock('./sim')` é de
  arquivo inteiro*, *`setMessageTick(0)` no retry*: já anotados nas revisões
  anteriores, nenhum contradiz a spec.

## Comments

- **(stage 3, 2026-09-11)** Diagnóstico perdido no braço de rejeição do boot.
  Tirar o `fail(e)` foi certo — era a segunda superfície de erro que a 1ª
  revisão derrubou —, mas o braço hoje nem liga o parâmetro: a exceção do wasm
  é engolida inteira, sem `console.error`, então o aluno vê a mensagem fixa e
  quem for depurar não vê nada. Nenhum critério pede log, então não segurou o
  merge. Cabe num `CLEAN-*` de uma linha em `src/App.tsx`.
- **(stage 3, 2026-09-11)** `LOADING_MESSAGE_COUNT` e a aritmética de
  `loading.msg.NN` seguem manuais, e `t()` cai de volta para a própria chave:
  se o dono do produto cortar uma piada sem baixar o `count`, o aluno lê
  `loading.msg.10` cru na tela — invisível para `tsc`, para o lint e para o
  `i18n.test.ts`. Se stage 1 quiser fechar essa porta, derivar o `count` de
  `allKeys()` filtrado pelo prefixo resolve num lugar só.
