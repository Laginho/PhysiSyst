# physics-sim v6 — Energia, momento e gráficos

Status: ready-for-agent

Insumo: roadmap do FINAL_REPORT (v4 "Next Steps", eixo de mecânica) e a sessão de grilling de 2026-10-03 (planner, com o `proxy` respondendo as perguntas que não eram de design, gosto ou irreversíveis). Este spec cobre PHY-67 a PHY-74.

## Problem Statement

1. **Toda colisão gruda.** `setRestitution(0)` em todo colisor; não há coeficiente de restituição no schema nem no editor. Choque elástico, o caso de livro, não existe.
2. **O painel lê cinemática, não energia.** Posição, |v|, |a|, F_el e T. Conservação de energia e de momento, o fio condutor da dinâmica no livro, não aparecem em lugar nenhum.
3. **A gravação da v5 só se vê pelo slider.** 600 registros por cena, e nada desenha x(t), v(t) ou E(t). O aluno arrasta o slider e tenta lembrar o número anterior.

## Solution

1. **Restituição por par (PHY-67, PHY-68, PHY-69).** `Contact` ganha `e?` (padrão 0). O simulador transforma o `e` do par em fatores por corpo com a regra Multiply do Rapier, como o atrito já faz com Average (ADR-0003); exato quando o sistema é solúvel, fallback com aviso quando não. Dois presets de colisão (e = 1 e e = 0,5).
2. **Leituras de energia e momento (PHY-70, PHY-71).** Módulo puro `src/sim/energy.ts` calcula E_c, E_pg, E_el, E_mec, p a partir do que a gravação já guarda. O painel mostra o corpo selecionado e um bloco "sistema" sempre visível.
3. **Gráficos da gravação (PHY-72, PHY-73).** Painel recolhível sob a barra de transporte, Canvas 2D, um gráfico por tipo (posição, velocidade, aceleração, energia, momento), curvas do corpo selecionado ou do sistema, cursor acoplado ao slider; clicar no gráfico faz `seek`.
4. **Closeout (PHY-74).** Testes de E_mec constante, versão 0.6.0, FINAL_REPORT v6.

## Decisões

Quem decidiu: **Bruno** (o humano), **proxy** (o agente `proxy`, aceito pelo Bruno sem sobrescrever), **planner** (consequência direta de uma decisão acima, registrada aqui).

### Escopo e ordem

- Proxy: entram restituição, leituras e gráficos. Magnitude de normal e atrito fica para a v7 (roadmap).
- Proxy: ordem restituição → leituras → gráficos; gráficos bloqueados por leituras.
- Bruno: oito tickets PHY-67…74 (tabela abaixo); PHY-68 e PHY-72 são `hard`; PHY-70 é independente da linha 67–69 e pode rodar em paralelo (toca só o simulador, o módulo novo e uma linha de `RecordedFrame` em App.tsx).

### Restituição (PHY-67, PHY-68, PHY-69)

- Bruno: `e` mora no `Contact` existente como campo opcional `e?: number`, padrão 0; `SCENE_VERSION` fica 1 (precedente aditivo-opcional: `particleMode`, `vx/vy`, `pulleys`). CONTEXT.md passa a dizer que o Contact carrega atrito e restituição do par; a entrada Collision aponta para o Contact.
- Bruno: o `e` do par chega ao Rapier como fator por corpo com a regra de combinação **Multiply** (`e_par = r_a · r_b`). Corpo sem par declarado tem `r = 0`, então toda colisão não declarada continua inelástica como hoje. Exato quando solúvel; fallback + aviso quando não (espelha ADR-0003).
- Proxy: solve em espaço log sobre os pares com e > 0 (`log r_a + log r_b = log e`); par declarado com e = 0 entre corpos que precisam de r > 0 em outro par é conflito → fallback. Fallback: r por corpo = máximo de `e` entre seus pares, regra **Min**, aviso. Min mantém pares não declarados em 0 (Max não manteria) e acerta o preset de colisão mesmo sem o solve.
- Proxy: registrado como ADR-0005 "Restitution on contact pairs via per-body factors", curto, referenciando a 0003.
- Proxy: campo no ContactsPanel é um `NumField` 'e — restituição' ao lado de μs/μk, step 0,05, sem clamp (igual aos μ); `collectWarnings` emite aviso suave para e < 0 ou e > 1; `CONTACT_DEFAULTS` ganha `e: 0`; o codec escreve `e` só quando definido, para cenas v5 continuarem byte a byte.
- Proxy: o aviso de fallback é string em inglês cru como os existentes em `Simulator.warnings`; traduzir avisos é ticket próprio.
- Proxy: o teste existente de esferas frontais (`acceptance.test.ts`, depende de e = 0) fica intacto; PHY-68 adiciona casos ao lado.
- Proxy: presets `collision-elastic` (e = 1) e `collision-inelastic` (e = 0,5): dois círculos de 1 kg, r = 0,5, sobre o chão, o esquerdo com vx = 3 contra o direito parado, par declarado `{muS: 0, muK: 0, e}`, sem par com o chão (par não declarado → atrito 0 e r = 0 automaticamente). Forma fechada: e = 1 → 0 e 3 m/s; e = 0,5 → 0,75 e 2,25 m/s; tolerância 3%. Tópico novo 'colisoes' em mecânica/dinâmica.
- Planner: a regra Multiply dos corpos vence a Min dos aros de polia (Rapier escolhe a regra de maior valor no enum: Average 0 < Min 1 < Multiply 2 < Max 3); aro com r = 0 dá 0 de qualquer forma.
- Planner: Rapier 0.20 não tem limiar de velocidade para restituição; uma bola com e = 1 quica para sempre. Aceito; anotar no FINAL_REPORT.

### Energia e momento (PHY-70, PHY-71)

- Proxy: grandezas E_c, E_pg, E_el, E_mec; trabalho de F aplicada e dissipação ficam fora (ΔE_mec já conta a história). Momento linear p_x, p_y, |p|; momento angular fora.
- Proxy: E_c inclui ½Iω² quando o modo partícula está desligado; inclui também os discos de polia com massa e a mola com massa.
- Proxy: referência de E_pg é y = 0 do mundo (topo do chão em todo preset), sem controle. E_pg usa o y do centro de massa no mundo (triângulo: CM deslocado do vértice α, rotacionado), g de `scene.constants.g`.
- Bruno: módulo puro novo `src/sim/energy.ts` (sem React, sem Rapier) lendo o `RecordedFrame` na hora de pintar; I analítico por forma (retângulo m(w²+h²)/12, círculo mr²/2, triângulo em torno do CM). Nada novo gravado por corpo.
- Bruno: os dois casos ocultos são expostos pelo simulador como estado bruto: `readPulleys(): PulleyState[]` com `{id, angvel}` → `RecordedFrame.pulleys`; e `SpringState.chainKinetic?: number` (½Σmv² dos nós da `Chain`, calculado onde a `Chain` vive, porque os nós não são corpos e expor oito velocidades só para somar não vale a interface). O módulo de energia calcula o disco com I = ½MR² a partir de `scene.pulleys`.
- Proxy: `readPulleys()` devolve só polias com massa (polia sem massa não tem disco nem I).
- Proxy: "sistema" = todos os corpos não fixos (E_c, E_pg, p) + E_el (½k·dx²) e `chainKinetic` de todas as molas + ½Iω² dos discos de polia com massa. Corpos fixos excluídos. No modo partícula o ½Iω² dos corpos da cena é zerado, mas o termo do disco é mantido (o disco gira por definição; se o modo o parar, o termo é zero).
- Proxy: layout da leitura (fieldset de 220 px): o bloco do corpo selecionado ganha E_c, E_pg, |p| dentro do "ver mais" existente (linhas principais continuam posição, |v|, |a|). Bloco "sistema" novo, sempre visível: E_c, E_pg, E_el (só quando a cena tem molas), **E_mec** em negrito, |p|; p_x, p_y num `<details>`.
- Proxy: helper `fmtNum(n, digits, lang)` em `src/i18n` sobre `toLocaleString`, usado em toda leitura nova e nos eixos do gráfico, e substituindo os ~10 `toFixed` atuais do painel (um painel, uma convenção: vírgula em pt-BR). Stage 2 ajusta testes que fixam ponto.
- Proxy: textos em pt-BR e en; símbolos com `splitLabel` na legenda do gráfico e texto plano na leitura, como F_el hoje.

### Gráficos (PHY-72, PHY-73)

- Bruno: painel recolhível abaixo da barra de transporte, na largura da coluna do canvas (segue o resize), fechado por padrão, aberto por um botão na barra. Cursor e polegar do slider ficam alinhados.
- Proxy: altura fixa 180 px (não redimensionável); estado aberto/fechado só em React (não persistido, como contactSnap/showVectors).
- Proxy: tipos posição, velocidade, aceleração, energia, momento; um gráfico por tipo com suas curvas juntas: posição x, y; velocidade v_x, v_y, |v|; aceleração a_x, a_y, |a|; energia E_c, E_pg, E_el (só com molas), E_mec; momento p_x, p_y, |p|.
- Proxy: o gráfico segue o corpo selecionado; nada selecionado → sistema. Sem seleção, os tipos cinemáticos ficam desabilitados no `<select>` e o tipo cai em energia.
- Proxy: `<select>` nativo no canto superior esquerdo do painel, padrão energia; paleta fixa de 4 cores independente das cores dos vetores; legenda colorida no canto superior direito.
- Proxy: Canvas 2D desenhado à mão, sem biblioteca. O gráfico é a gravação: janela de até 10 s, como o slider.
- Proxy: y auto-escala por grupo; eixo do tempo cresce até 10 s; eixos com unidades, 2 a 3 marcas, vírgula decimal em pt-BR via `fmtNum`.
- Proxy: linha vertical do cursor no tempo do slider; clique/arrasto no gráfico mapeia x → índice e despacha o `seek` existente com a mesma semântica de pausa do polegar do slider.
- Proxy: séries recalculadas a cada repaint, sem cache (≤600 quadros × ≤12 corpos).
- Proxy: lógica de eixos/escala/marcas num módulo puro `src/render/graph.ts` (`graphLayout`) com testes unitários; um teste de browser para toggle + clique → seek, com evidência mutate-verify no ticket.
- Proxy: a11y: canvas com `role="img"` e `aria-label` com tipo e corpo; botão com `aria-pressed` e `aria-controls`; seek por teclado continua no slider.

### Fechamento (PHY-74)

- Proxy: testes de E_mec com o módulo novo: projétil dentro de 0,5% do valor inicial **só nos quadros em voo** (com vy = 6 ele pousa em ~1,2 s e o impacto com r = 0 dissipa); pêndulo dentro de 2% na gravação inteira.
- Proxy: versão 0.6.0; closeout como os anteriores: sweep do gate, passe manual desktop, seção v6 do FINAL_REPORT.
- Planner: `package.json` ainda está em 0.4.0 e o FINAL_REPORT não tem seção v5. PHY-74 sobe direto para 0.6.0 e a seção v6 anota que a v5 (PHY-58…66) não teve bump nem seção própria.

## Fora de escopo

- Magnitude das forças normal e de atrito (v7).
- Trabalho de forças aplicadas, dissipação, momento angular.
- i18n dos avisos do simulador.
- Exportar gráfico ou CSV; painel redimensionável ou persistido.
- Restituição por corpo (material); limiar de velocidade para restituição (Rapier não tem).
- Gráficos cinemáticos do "sistema" (centro de massa).

## Tickets

| ID | Título | Bloqueado por | Dificuldade |
|---|---|---|---|
| PHY-67 | Coeficiente de restituição no Contact e no editor | — | normal |
| PHY-68 | Restituição no simulador por fatores por corpo | PHY-67 | hard |
| PHY-69 | Presets de colisão elástica e inelástica | PHY-68 | normal |
| PHY-70 | Módulo de energia e momento | — | normal |
| PHY-71 | Leituras de energia e momento no painel | PHY-70 | normal |
| PHY-72 | Painel de gráficos da gravação | PHY-71 | hard |
| PHY-73 | Interação do gráfico: seek e tipos por seleção | PHY-72 | normal |
| PHY-74 | Closeout v6: testes de E_mec, 0.6.0, FINAL_REPORT | PHY-69, PHY-73 | normal |
