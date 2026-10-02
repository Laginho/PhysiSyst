# PHY-64: Gravação e slider de tempo com a simulação pausada
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: human
Difficulty: hard

- Primary files:
  - New: src/playback/recording.ts
  - New: src/playback/recording.test.ts
  - src/playback/scheduler.ts (`PlaybackState`, `PlaybackAction`, `advance`), src/playback/index.ts (exports)
  - src/playback/scheduler.test.ts
  - src/App.tsx (`runSteps`, `syncWorld`, `dispatch`, `editDoc`/`canEditDoc`, o intervalo do painel de leitura em ~863, a barra de transporte em ~1573, os campos de g e F)
  - src/App.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts

#### What to build

Hoje o transporte só anda para frente. Depois deste ticket, o app grava cada passo simulado e um slider na barra de transporte navega pela gravação com a simulação pausada.

Cada registro guarda o que a tela já lê: os estados dos corpos (`readStates`), os contatos (`readContacts`), as cordas e molas (`readConstraints`) e a aceleração medida de cada corpo. Não há snapshot do Rapier nem re-simulação: o mundo vivo nunca volta no tempo, fica na ponta da gravação, e o slider só troca o que é desenhado e lido. O registro 0 é o estado antes do primeiro passo. Grava-se um registro por passo de `TIMESTEP` (em 2x, um quadro de 2 passos grava 2 registros), até 600 registros (10 s). Com a gravação cheia, a simulação segue ao vivo e nada mais é gravado.

O cursor do slider mora no estado puro do scheduler (`cursor: number | null`, `null` = ao vivo) e muda pela ação `seek`. A última posição do slider é "ao vivo". Com o cursor num registro, tudo o que a tela mostra vem desse registro: corpos, vetores, contatos, cordas, painel de leitura e a aceleração gravada daquele passo.

Travas, com o cursor fora do ao vivo:
- Edição ao vivo (g, F) bloqueada: os campos ficam desabilitados com a dica "Volte ao fim da gravação para editar", e undo/redo também.
- Com o cursor em t = 0, o editor se comporta como antes do primeiro passo: qualquer edição é aceita e reseta a simulação (gravação apagada, mundo reconstruído do doc).

Até o PHY-65, play ou passo único com o cursor num registro primeiro voltam ao vivo e então agem como hoje. O replay é o PHY-65.

As decisões e quem tomou cada uma estão em `../spec.md`, seção "Player de tempo".

#### Acceptance criteria

1. `recording.ts` exporta `RECORDING_CAP = 600` e uma gravação genérica: começa com um registro (o inicial); `push` acrescenta e devolve `true` enquanto há espaço, e devolve `false` sem mudar nada quando já há `RECORDING_CAP` registros; `at(i)` devolve o registro `i`; `length` é o número de registros; `reset(first)` volta a ter só `first`.
2. No scheduler, a ação `{ type: 'seek', index, length }` (`length` = registros na gravação) pausa e leva o cursor ao índice pedido limitado a `[0, length − 1]`; um `seek` no último índice (`length − 1`) ou além deixa o cursor `null` (ao vivo). `reset` deixa o cursor `null`. `initialPlayback()` tem cursor `null`.
3. No scheduler, `play` e `stepOnce` com o cursor num registro deixam o cursor `null` antes de agir; com o cursor `null`, todas as ações de hoje agem exatamente como hoje.
4. No app, cada passo simulado acrescenta um registro: depois de N passos sem encher, a gravação tem N + 1 registros, inclusive quando um quadro em 2x roda 2 passos.
5. A barra de transporte tem um `<input type="range">` com mínimo 0, máximo = registros − 1, e valor = cursor (ou o máximo, ao vivo). Ao lado, o rótulo `t = <tempo> s` com o tempo do registro mostrado (índice × `TIMESTEP`) em duas casas decimais, vírgula em pt-BR e ponto em en.
6. Mover o slider para o registro i desenha os corpos nas poses do registro i (não nas do mundo vivo), e o painel de leitura do corpo selecionado mostra a posição, a velocidade e a aceleração gravadas no registro i; o contador de passos mostra i.
7. Com o cursor no registro i e uma corda ou mola selecionada, o painel mostra a leitura dela gravada no registro i (`T`, `F_el`, `Δx`), não a do mundo vivo.
8. A aceleração mostrada no registro i é a do passo i (Δv sobre um `TIMESTEP`), nunca uma diferença entre o registro mostrado antes e o atual: saltar do registro 10 para o 200 mostra a aceleração gravada no 200.
9. Mover o slider durante o play pausa a simulação, que continua pausada depois de soltar.
10. Com o cursor num registro i > 0: os campos de g e de F (módulo e direção) estão desabilitados com o título `t('playback.scrubbedEditHint')` ("Volte ao fim da gravação para editar"), undo e redo estão desabilitados, e uma edição ao vivo que chegue ao `editDoc` por outro caminho (arrastar o ponto de força) é recusada.
11. Com o cursor em 0 depois de N > 0 passos, as ferramentas estruturais ficam habilitadas; uma edição aplicada aí reseta a simulação (gravação com um registro só, o do doc editado, `stepsTaken` 0) e o doc fica com a edição.
12. Levar o cursor a 0 não apaga a gravação: voltar o slider ao máximo mostra o ao vivo de novo, com os mesmos registros.
13. Reset e troca de cena apagam a gravação (um registro só, o inicial da cena) e deixam o cursor `null`.
14. Com a gravação cheia, a simulação continua ao vivo além de 10 s, a gravação fica com 600 registros e mover o slider até o fim mostra o mundo vivo.
15. Play e passo único com o cursor num registro voltam ao vivo e então agem como hoje (critério 3).
16. Uma edição estrutural antes do primeiro passo (t = 0, sem gravação além do registro 0) troca o registro 0 pelo estado do doc editado.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/playback/recording.test.ts`: critério 1 chamando o módulo direto; vermelho hoje (o módulo não existe).
- `src/playback/scheduler.test.ts`: critérios 2 e 3 chamando `advance` direto; vermelhos hoje (não há `cursor` nem `seek`). Os casos de cursor `null` do 3 passam hoje e vão juntos.
- `src/App.test.ts`, com o simulador falso (poses diferentes a cada `step`) e o `requestAnimationFrame` controlado que o arquivo já usa: critérios 4 a 16; vermelhos hoje (não há slider). Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 4).
- 2026-10-02 Stage 1 (planner, grilling com proxy). Bruno decidiu: slider só no já simulado; edição ao vivo bloqueada com o slider para trás; t = 0 libera a edição estrutural; registro = o que a tela lê, sem snapshot nem re-simulação; um registro por passo; limite de 10 s, ao encher a simulação segue ao vivo sem gravar; `recording.ts` puro e cursor no scheduler com `seek`; fatiamento em PHY-64, PHY-65 (replay) e PHY-66 (voltar um passo).
- Planner: a última posição do slider é "ao vivo"; cursor em t = 0 aceita qualquer edição e reseta (o mundo vivo está na ponta, não em t = 0); até o PHY-65, play e passo com o cursor num registro voltam ao vivo; a leitura de aceleração ao vivo passa a ser Δv sobre um `TIMESTEP`, porque o mundo é lido a cada passo.
- Proxy decided: tudo acompanha o slider, inclusive o painel; a aceleração é a gravada daquele passo — uma diferença sobre um salto do slider seria um número sem sentido físico.
- Proxy decided: tempo como "t = 1,23 s", contador de passos continua — duas casas bastam a 1/60 s.
- Proxy decided: reset e troca de cena apagam a gravação, levar o slider a t = 0 não — voltar a t = 0 é navegar, não descartar.
- Proxy decided: `<input type="range">` nativo, um passo = um registro, na barra de transporte à direita dos botões — o nativo já resolve teclado e acessibilidade, e é onde um player de vídeo põe o slider.
- Proxy decided: arrastar o slider pausa e continua pausado — retomar sozinho começaria um replay que ninguém pediu.
- Proxy decided: registro 0 é sempre o estado inicial — sem ele o slider não chega a t = 0.
- Proxy decided: o bloqueio desabilita g, F e também undo/redo — undo/redo seriam outro caminho para uma edição ao vivo.
- Proxy decided: atalhos de teclado fora do PHY-64; → continua passo único — voltar um passo é o PHY-66.
- Proxy decided (rodada 2, sobrescrito pelo Bruno): limite de 18 000 registros. O Bruno trocou por 10 s (600), porque a maioria das simulações dura até 5 s.
