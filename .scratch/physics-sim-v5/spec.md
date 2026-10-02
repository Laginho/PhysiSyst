# physics-sim v5 — Feedback da v4: galeria, canvas e player de tempo

Status: ready-for-agent

Insumo: feedback do Bruno vendo a v4 (2026-10-02) e a sessão de grilling do mesmo dia (planner, com o `proxy` respondendo as perguntas que não eram de design, gosto ou irreversíveis). PHY-58 a PHY-61 são correções pequenas que saíram completas do feedback e não passaram pelo grilling; este spec cobre PHY-62 a PHY-66.

## Problem Statement

1. **Olhar um preset custa uma cena.** A galeria é uma lista de rádios mais "usar selecionada", que cria uma cena salva nova (`createPresetScene`). Para comparar três presets o aluno cria três cenas e depois precisa apagá-las.
2. **O canvas é grande demais e fixo.** Ele ocupa o maior 3:2 que cabe no contêiner, com piso de 600 px, e não há como diminuí-lo.
3. **O tempo só anda para frente.** Play, pausa, passo único e reset para t = 0. Para rever o instante em que a corda afrouxou, o aluno reseta e roda tudo de novo.

## Solution

1. **Galeria de um clique (PHY-62).** O card do preset é clicável e abre o preset na hora, só para ver. A primeira edição cria uma cena salva com o conteúdo do preset e passa a editar essa cópia. O preset nunca muda.
2. **Canvas redimensionável (PHY-63).** Uma alça no canto inferior direito encolhe o canvas, mantendo 3:2. O zoom acompanha: a cena inteira sempre cabe. O tamanho escolhido persiste.
3. **Player de tempo.** O app grava cada passo simulado, até 10 s, e um slider na barra de transporte navega pela gravação.
   - PHY-64: gravação + slider com a simulação pausada.
   - PHY-65: play e passo único a partir de um ponto anterior: replay do gravado, depois ao vivo.
   - PHY-66: voltar um passo (botão e ←).

## Decisões

Quem decidiu: **Bruno** (o humano), **proxy** (o agente `proxy`, aceito pelo Bruno sem sobrescrever), **planner** (consequência direta de uma decisão acima, registrada aqui).

### Galeria (PHY-62)

- Bruno: os cards de texto atuais viram clicáveis (sem miniatura, sem grade sobre o canvas). O clique abre direto, sem confirmar. O botão "usar selecionada" e os rádios saem.
- Bruno: o preset aberto é só leitura; a primeira edição cria a cópia automaticamente.
- Bruno: o `App` guarda qual preset está aberto; a cena aberta é montada do preset e não tem id salvo; na primeira edição uma função de persistência salva a cópia e o app passa a editá-la (rebind de id, sem `switchToScene`).
- Proxy: edição é qualquer mudança no doc, inclusive g ou F ao vivo. Play, passo, reset e velocidade não são edição.
- Proxy: criar a cópia durante o play não reseta: a simulação segue e o histórico de undo não é limpo.
- Proxy: o seletor de cenas mostra uma opção extra, desabilitada e selecionada, "Preset: <nome> (só leitura)", e uma dica i18n perto do transporte. Excluir fica desabilitado. Duplicar cria a cópia. Exportar exporta o doc do preset.
- Proxy: recarregar volta ao mesmo preset (`CURRENT_SCENE_KEY` guarda `preset:<id>`); id desconhecido cai no comportamento de hoje.
- Proxy: undo depois da primeira edição fica na cópia, que volta ao conteúdo do preset. A cópia nunca é apagada e o app nunca volta ao preset por undo.
- Proxy: a galeria continua aberta ao trocar de preset e ao criar a cópia. O primeiro clique num card chama `ackGallery`.
- Proxy: a cópia ganha o nome do preset no idioma atual e id `cena-N`; nome repetido vira "(2)", "(3)"…
- Proxy: o botão "Cena em branco" continua. A primeira abertura do app não muda (`cena-1` = cena demo, galeria aberta).
- Proxy: clicar no card do preset já aberto não faz nada.
- Proxy: clicar num preset durante o play ou com uma cena salva aberta salva o pendente (flush) e abre o preset pausado em t = 0, como uma troca de cena.

### Canvas (PHY-63)

- Bruno: alça de arrastar no canvas (não slider, não tamanhos fixos).
- Bruno: redimensionar muda o zoom; a cena inteira sempre cabe (`VIEW_WIDTH_METERS = 15` fica).
- Bruno: `fitCanvas` recebe a largura escolhida pelo usuário e aplica a regra de mínimo e máximo; a alça e a persistência ficam no `App`.
- Proxy: o tamanho persiste globalmente em `physics-sim:canvasSize`; valor inválido volta ao automático.
- Proxy: largura = máx(402, mín(escolha do usuário, ajuste automático)); 402 × 268 é o mínimo. O piso de 600 px e a regra de empilhar valem só para o ajuste automático.
- Proxy: alinhamento como hoje; o espaço que sobra fica vazio.
- Proxy: alça no canto inferior direito, cursor `nwse-resize`, a largura manda e a altura segue 3:2. Sem botão "auto": arrastar até o máximo é o automático.

### Player de tempo (PHY-64, PHY-65, PHY-66)

- Bruno: o slider só alcança o que já foi simulado (como o buffer de um vídeo).
- Bruno: play depois de voltar toca o gravado e depois continua ao vivo (PHY-65).
- Bruno: com o slider para trás, edição ao vivo (g, F) fica bloqueada até o fim da gravação.
- Bruno: slider em t = 0 libera a edição estrutural.
- Bruno: cada registro guarda o que a tela já lê — estados dos corpos, contatos, cordas e molas, e a aceleração medida. Sem snapshot do Rapier e sem re-simular: o mundo vivo nunca volta no tempo, fica na ponta da gravação, e o slider só troca o que é desenhado.
- Bruno: grava a cada passo de 1/60 s, não a cada quadro desenhado.
- Bruno: limite de 10 s de gravação (600 registros). Ao encher, a simulação continua ao vivo e a gravação para; o slider fica nos primeiros 10 s.
- Bruno: `src/playback/recording.ts` novo e puro; o cursor do slider mora no estado puro do `scheduler.ts`, com uma ação `seek`; o `App` liga o slider e desenha o registro no cursor.
- Bruno: fatiamento PHY-64 (gravação + slider pausado + leituras + travas), PHY-65 (replay → ao vivo), PHY-66 (voltar um passo).
- Proxy: tudo acompanha o slider, inclusive o painel de leitura; a aceleração mostrada é a gravada daquele passo, nunca uma diferença sobre um salto do slider.
- Proxy: o tempo aparece como "t = 1,23 s", duas casas; o contador de passos continua no painel.
- Proxy: reset e troca de cena apagam a gravação; levar o slider a t = 0 não apaga.
- Proxy: passo único com o slider para trás avança um passo seguindo a regra do play (PHY-65). A velocidade continua sendo só a taxa do play.
- Proxy: `<input type="range">` nativo, um passo do slider = um registro, rótulo de tempo ao lado, na barra de transporte à direita de play/passo/reset, ocupando o resto da largura.
- Proxy: arrastar o slider durante o play pausa, e continua pausado ao soltar.
- Proxy: o registro 0 é sempre o estado inicial, para o slider chegar a t = 0.
- Proxy: o bloqueio de edição ao vivo desabilita os campos de g e F (dica "Volte ao fim da gravação para editar") e também undo/redo, que seriam outro caminho para uma edição ao vivo.
- Proxy: atalhos de teclado ficam fora do PHY-64; → continua sendo passo único. Voltar um passo é o PHY-66.
- Planner: a última posição do slider é "ao vivo" (cursor nulo). Com a gravação cheia e o mundo além de 10 s, arrastar até o fim mostra o mundo vivo, não o registro de t ≈ 10 s.
- Planner: com o cursor em t = 0 o editor se comporta como antes do primeiro passo: qualquer edição é aceita e reseta a simulação (gravação apagada, mundo reconstruído do doc), porque o mundo vivo está na ponta e não em t = 0.
- Planner: até o PHY-65 entrar, play ou passo único com o slider para trás primeiro voltam ao vivo e então agem como hoje.
- Planner: a leitura de aceleração ao vivo passa a ser Δv sobre um TIMESTEP (antes, sobre os n passos do quadro), porque a gravação lê o mundo a cada passo.

## Fora de escopo

- Miniaturas na galeria, apagar cópias automaticamente, presets editáveis.
- Snapshot do Rapier, re-simulação, gravação além de 10 s, exportar a gravação.
- Atalhos de teclado além de ← (PHY-66).

## Tickets

| ID | Título | Bloqueado por |
|---|---|---|
| PHY-62 | Galeria abre o preset com um clique, sem criar cena | — |
| PHY-63 | Canvas da cena redimensionável | — |
| PHY-64 | Gravação e slider de tempo com a simulação pausada | — |
| PHY-65 | Play e passo único a partir de um ponto anterior | PHY-64 |
| PHY-66 | Voltar um passo | PHY-64 |
