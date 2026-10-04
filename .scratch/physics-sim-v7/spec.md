# physics-sim v7 — Rodada de feedback depois da v6

Status: ready-for-agent

Insumo: o passe manual do Bruno sobre a v6 (2026-10-04) e a sessão de grilling do mesmo dia, em que o Bruno confirmou o entendimento compartilhado; este spec só publica o que ficou decidido lá. Cobre PHY-75 a PHY-83; o PHY-84 é uma issue `needs-triage` fora do spec, para um grilling futuro.

## Problem Statement

1. **Restituição inalcançável nas cenas prontas.** `freeFall` e `projectileLaunch` têm `contacts: []`, e `collision(e)` só declara `esfera-1 ↔ esfera-2`. Pela ADR-0005 o par não declarado com o chão tem fator 0, então a bola nunca quica, e o aluno não tem onde digitar o `e` do chão sem antes criar o par num painel global que não fala a língua dos corpos.
2. **Controles longe do canvas e miúdos.** A barra de transporte, a paleta e o gráfico ficam na largura da coluna, não na do canvas, e não há como aumentar os controles sem dar zoom na página inteira.
3. **A gravação enche e a cena segue.** Com 600 registros a simulação continua ao vivo (critério 14 do PHY-64): o slider acaba em 10 s mas a ponta mostra 15 s, e o que se vê no canvas não está em registro nenhum.
4. **Tudo aparece ao mesmo tempo.** Forças, cinemática, energia e momento disputam o painel e o canvas em toda cena; uma cena de colisão quer momento, uma de MHS quer energia, e não há como escolher.
5. **Só v₀ aparece; v e a ao vivo, não.** Depois do primeiro passo o aluno lê |v| e |a| no painel mas não vê as setas.
6. **Legenda do gráfico só enfeita.** Pintada no canvas, não esconde curva, e a escala y segue curvas que ninguém quer olhar (E_pg numa mola horizontal).
7. **N e T faltam em t = 0.** Os contatos vêm das manifolds da fase estreita do Rapier, vazias antes do primeiro passo, e a tração da corda começa em 0.
8. **Mola e corda nunca ficam exatamente na vertical.** O encaixe em contato e o de âncora existem; o de orientação do segmento, não.

## Solution

1. **Restituição alcançável e contatos no painel do corpo (PHY-75).** Os presets ganham o par bola ↔ chão com μs = μk = 0 e e = 0 (trajetórias e curvas iguais às de hoje). O `ContactsPanel` global sai; o painel do corpo ganha a seção "contatos de m_a", onde todo par é alcançável a partir de qualquer um dos dois corpos e o parceiro é escolhido num `<select>`.
2. **Dock sob o canvas e tamanho dos controles (PHY-76).** Barra, paleta e gráfico ficam sob o canvas, na largura dele, em todo layout. Dois botões + e − sempre visíveis escalam só o bloco de controles do canvas com CSS `zoom` (70–160 %, passos de 10 %, persistido). O gráfico fica abaixo da paleta, 180 px, sem escala, com o toggle de mostrar/esconder.
3. **Pausar quando a gravação enche (PHY-77).** Ao chegar em `RECORDING_CAP` a simulação pausa no último passo com o aviso "gravação cheia (10 s) — reinicie". Altera o critério 14 do PHY-64.
4. **Foco (PHY-78, PHY-79).** Campo opcional `focus` na `Scene`; ausente = tudo ligado. Uma fileira de chips no topo do painel direito: "mostrar: forças · cinemática · energia · momento". Cada preset declara o seu Foco.
5. **v e a ao vivo (PHY-80).** A seta de v substitui a de v₀ depois do primeiro passo, na mesma cor; a de a ganha uma cor nova e lê a aceleração gravada.
6. **Legenda clicável (PHY-81).** Legenda em HTML cujas entradas escondem e mostram curvas; curvas escondidas moram em `focus`, por tipo de gráfico; cor por identidade da série; auto-escala y só com as visíveis.
7. **Vetores no instante inicial (PHY-82).** Um simulador descartável, construído do mesmo documento, roda um `TIMESTEP`, entrega contatos e trações e é liberado; N e T aparecem em t = 0 ao lado do que já existe.
8. **Snap de orientação (PHY-83).** Arrastando um corpo ou pousando uma âncora, um segmento de mola ou corda quase vertical ou quase horizontal trava em 90° ou 0°, com uma linha-guia tracejada.

## Decisões

Quem decidiu: **Bruno** (o humano, no grilling de 2026-10-04), **planner** (consequência direta de uma decisão do Bruno, registrada aqui para o stage 2 não ter que deduzir). Não houve proxy nesta rodada.

### Escopo e ordem

- Bruno: nove tickets PHY-75…83, na ordem A–H do grilling (D vira dois: modelo + chips, e Foco das cenas prontas). A, B, C, D1, G e H são independentes; D2, E e F dependem de D1; F depende também de B.
- Bruno: "desenhar vetor de força no canvas e digitar o módulo" fica fora do spec, como issue `needs-triage` (PHY-84) para um grilling futuro.
- Planner: B, D1 e G são `hard` (critérios que interagem: layout com feedback, filtro em canvas e painel ao mesmo tempo, mundo descartável ao lado do vivo). Os outros, `normal`. B tem `Review: human` porque o layout foi validado a olho num protótipo.

### Restituição e contatos (PHY-75)

- Bruno: causa raiz é a ausência do par com o chão; a ADR-0005 continua valendo — restituição é por par, par não declarado tem fator 0. Nada de `e` padrão por cena.
- Bruno: retrofit dos presets com o par bola ↔ chão `{ muS: 0, muK: 0, e: 0 }`; comportamento e curvas de hoje não mudam.
- Bruno: o `ContactsPanel` global sai. O painel do corpo ganha a seção "contatos de m_a"; todo par é alcançável de qualquer um dos dois corpos. Parceiro escolhido num `<select>`: corpos dinâmicos pelo rótulo de massa, fixos como "fixo: retângulo 1".
- Planner: o rótulo do corpo fixo é `fixo: <forma> <n>`, com a forma nas strings da paleta já existentes (`retângulo`, `bola`, `cunha`) e `n` a posição 1-based entre os corpos fixos da mesma forma, na ordem do documento, sempre numerado. O `<select>` lista só os parceiros ainda não pareados; sem parceiro disponível, `<select>` e botão ficam desabilitados.
- Planner: declarar o par faz `isHeld` (accelerationTracker) marcar a aceleração analítica como aproximada ("≈") em queda livre e projétil antes do primeiro passo. É o marcador honesto para um par declarado; fica.

### Dock e tamanho dos controles (PHY-76)

- Bruno: barra de controles, depois paleta, depois gráfico, sob o canvas e na largura dele, em todo layout, inclusive com o inspetor empilhado embaixo.
- Bruno: dois botões + e − sempre visíveis escalam só o bloco de controles do canvas; 70–160 % em passos de 10 %; valor persistido em localStorage seguindo `loadCanvasSize`/`saveCanvasSize`.
- Bruno: a escala é CSS `zoom`; os botões + e − ficam fora do bloco escalado.
- Bruno: gráfico com 180 px de altura, na largura do canvas, abaixo da paleta, sem escala, com toggle de mostrar/esconder.
- Bruno: o fit do canvas subtrai a altura do dock. Nunca dimensionar o canvas a partir de uma caixa que o envolve (shrink-wrap): é um loop de feedback.
- Bruno: validado por protótipo na branch descartável `proto/ui-scale`, variante D, commit `9080046` (`?variant=D`), que tem `fitWithDock` e `ControlsSizer`. A branch é referência de leitura e **nunca é mesclada**.

### Gravação cheia (PHY-77)

- Bruno: ao atingir `RECORDING_CAP` (600 registros = 10 s) a simulação pausa no último passo e mostra "gravação cheia (10 s) — reinicie".
- Bruno: na ponta cheia, reproduzir e avançar um passo não fazem nada. Slider e voltar um passo continuam navegando. Replay a partir de um cursor anterior pausa de novo ao chegar ao fim. Reiniciar apaga tudo.
- Bruno: altera o critério 14 do PHY-64 (`.scratch/physics-sim-v5/issues/PHY-64-player-de-tempo.md`), que mandava a simulação seguir ao vivo além do limite. Corrige o bug relatado: a cena passava de 10 s com o slider acabando em 10 s e a ponta mostrando 15 s.
- Planner: a regra mora no scheduler puro (`advance`), que já recebe `length`: um quadro na ponta ao vivo roda no máximo `RECORDING_CAP − length` passos e pausa quando a gravação fica cheia; `play` ganha `length` opcional para recusar a ponta cheia; `stepOnce` na ponta cheia é no-op.

### Foco (PHY-78, PHY-79)

- Bruno: campo opcional `focus` na `Scene`. Ausente = os quatro grupos ligados, para cenas antigas e importadas não perderem nada. Cena nova em branco escreve o padrão explícito: forças, energia e momento ligados; cinemática desligada.
- Bruno: uma fileira de chips no topo do painel direito: "mostrar: forças · cinemática · energia · momento". Forças cobre as setas de força no canvas e as leituras de força; cinemática cobre as setas de v/a e as leituras cinemáticas; energia e momento são só do painel. As setas são independentes entre si.
- Bruno: "mostrar todos os vetores" continua sendo o escopo (todos os corpos vs. o selecionado), agora ligado por padrão.
- Bruno: os grupos valem para a leitura do corpo e para o bloco do sistema. Campos de edição nunca são filtrados.
- Bruno: chips são edição de visualização: fora do undo, nunca reiniciam a simulação. Salvos nas cenas do usuário; só da sessão nos presets, que voltam ao padrão ao reabrir.
- Bruno: chips não filtram os tipos do gráfico.
- Bruno: Foco das cenas prontas — princípios, atrito e pêndulo volta completa: forças; queda livre e projétil: cinemática + energia; colisões: cinemática + momento (painel mostra |p|); mola horizontal e amortecida: energia, com E_pg escondida no gráfico; mola vertical: forças + energia; pêndulo simples: forças + energia.
- Planner: forma do campo — `focus?: { show: FocusGroup[]; hidden?: Record<string, string[]> }`, `FocusGroup = 'forces' | 'kinematics' | 'energy' | 'momentum'`; `show` canonizado na ordem de `FOCUS_GROUPS`, `hidden` indexado pelo nome do tipo de gráfico com os nomes das séries. `SCENE_VERSION` fica 1 (precedente aditivo-opcional); o codec escreve `focus` só quando definido, para cenas v6 continuarem byte a byte.
- Planner: a leitura de vínculo (F_el, Δx, T, frouxa) pertence a forças; as linhas "passos" e "velocidade" da leitura ficam sempre. Com energia e momento desligados o fieldset "sistema" some. Com forças desligadas some também a seta de F aplicada com o anel de arrasto; a âncora continua editável pelos campos do `ForcesPanel`.
- Planner: o Foco é lido sempre do documento corrente (`docRef`), nunca da `scene` do registro exibido, para os chips valerem com o slider para trás. O caminho dos chips não passa por `editDoc`: não copia preset, não empilha histórico, não dispara reset. `routeDocChange` já devolve `live` sem ops para uma diferença só em `focus`; o stage 2 pina isso com um teste.
- Planner: o PHY-79 escreve `focus.hidden.energy = ['E_pg']` nas molas horizontais; o gráfico só honra `hidden` a partir do PHY-81. Até lá o dado é inerte, e o critério do PHY-79 testa o dado, não o desenho.
- Planner: CONTEXT.md ganha a entrada **Foco** neste commit (termos evitados: modo, filtro). Sem ADR.

### v e a ao vivo (PHY-80)

- Bruno: depende de D1. A seta de v usa o verde de v₀ e a substitui depois do primeiro passo. A de a ganha uma cor nova e distinta, escolhida pelo implementador; lê a aceleração gravada (`getAcceleration` do tracker do registro), sem saída nova do motor.
- Bruno: mesma regra de comprimento 20·√módulo, mesmo clamp e mesmo escopo ("mostrar todos os vetores") das setas de força.
- Planner: `initialVelocityArrows` vira `velocityArrows(view, states, ppm)`: sem estados, o que é hoje (`kind: 'initial-velocity'`, rótulo v₀); com estados, `kind: 'velocity'` de `linvel`, rótulo `v`. `accelerationArrows(view, accelerations, ppm)` recebe um `Map<id, Vec2>` que o App monta com `getAcceleration`, para `overlay.ts` não importar `accelerationTracker` (que já importa `overlay.ts`). As cores dos vetores saem de `App.tsx` para `VECTOR_COLORS` em `overlay.ts`, para a distinção ser testável. Em t = 0 a seta de a é a analítica, como a leitura.

### Legenda clicável (PHY-81)

- Bruno: depende de B e D1. Legenda em HTML cujas entradas ligam e desligam curvas (hoje a legenda é pintada no canvas em `graph.ts`). Curvas escondidas moram em `focus`, por tipo de gráfico. Cor atribuída por identidade da série, não por índice: uma curva mantém a cor quando outras somem. A auto-escala y usa só as visíveis.
- Planner: a legenda são `<button aria-pressed>` com amostra de cor, no canto superior direito do painel (o `<select>` fica no esquerdo). O clique passa pelo caminho dos chips (edição de visualização). `drawGraph` deixa de desenhar legenda e recebe só as séries visíveis; `graphLayout` idem.

### Vetores no instante inicial (PHY-82)

- Bruno: independente de A–F. Sonda: construir um simulador descartável do mesmo documento pelo mesmo caminho de construção que `replaceScene` usa, rodar um `TIMESTEP`, ler contatos e trações, liberá-lo, e desenhar essas setas em t = 0 junto das que já existem (P, F_el, F aplicada, v₀, a analítica). O mundo vivo nunca é tocado. Recalcular em edições estruturais em t = 0 apenas.
- Planner: a sonda é um método síncrono `probeInitial(scene)` do `Simulator`, que instancia um segundo `RapierSimulator` com o mesmo `buildWorld`, dá `step()`, lê `readContacts()`/`readConstraints()` e libera o mundo (`world.free()`) num `finally`. O App a chama no boot, no reset/troca de cena e a cada edição estrutural com `stepsTaken === 0`; o resultado vale sempre que o instante exibido é t = 0 (ponta antes do primeiro passo ou cursor 0). A seta de T em t = 0 usa o caminho do documento (o `path` da leitura da sonda é descartado), porque as poses da sonda já andaram 1/60 s.
- Planner: só as setas. A leitura de T da corda selecionada em t = 0 continua a do mundo vivo (0 antes do primeiro passo); ficou fora da decisão e vai para "Fora de escopo".

### Snap de orientação (PHY-83)

- Bruno: independente. Arrastando um corpo ou uma âncora, se um segmento de mola ou corda está quase vertical ou quase horizontal em relação à outra ponta, trava em exatamente 90° ou 0° e uma linha-guia tracejada aparece. Mesma família do encaixe em contato e do de âncora; não exige mudança no motor. Não é snap de grade.
- Planner: tolerância em px de tela como as irmãs (10 px), medida como afastamento perpendicular do eixo que passa pela outra ponta; segmentos de comprimento até a tolerância não travam. Vale para molas e para cordas sem polia (as duas pontas são âncoras em corpos); pernas de corda sobre polia ficam fora. Quando o encaixe em contato dispara no mesmo movimento, ele vence e o de orientação não se aplica. Na âncora pousada pelo clique da ferramenta, o encaixe de âncora (feature do corpo) vence; só sem feature na tolerância a âncora cai na reta. A guia aparece durante o arrasto e, com a ferramenta armada e a primeira ponta fixada, no hover.

## Fora de escopo

- Leitura de T da corda em t = 0 (a sonda do PHY-82 alimenta só as setas; débito em PHY-85).
- Snap de orientação para pernas de corda sobre polia; snap de grade.
- `e` padrão por cena; restituição por corpo (material).
- Chips filtrando os tipos do gráfico.
- Persistir o estado aberto/fechado do gráfico.
- i18n dos avisos do simulador.
- Desenhar o vetor de força no canvas e digitar o módulo (PHY-84, `needs-triage`, grilling futuro).

## Tickets

| ID | Título | Bloqueado por | Dificuldade | Review |
|---|---|---|---|---|
| PHY-75 | Restituição alcançável e contatos no painel do corpo | — | normal | agent |
| PHY-76 | Dock sob o canvas e tamanho dos controles | — | hard | human |
| PHY-77 | Pausar quando a gravação enche | — | normal | agent |
| PHY-78 | Modelo de Foco e chips | — | hard | agent |
| PHY-79 | Foco das cenas prontas | PHY-78 | normal | agent |
| PHY-80 | Setas de v e a ao vivo | PHY-78 | normal | agent |
| PHY-81 | Legenda do gráfico clicável | PHY-76, PHY-78 | normal | agent |
| PHY-82 | Vetores N e T no instante inicial | — | hard | agent |
| PHY-83 | Snap de orientação de mola e corda | — | normal | agent |

Fora do spec: PHY-84 "desenhar vetor de força no canvas e digitar o módulo" (`Status: needs-triage`, `Stage: blocked` até o grilling).
