# physics-sim v4 — Vínculos: corda, polia e mola

Status: ready-for-agent

Insumo: sessão de grilling de 2026-09-24 (planner). Meta de longo prazo: cobrir toda a mecânica do Ensino Médio em nível ITA/IME antes de qualquer entrada por foto; o schema da Scene é contrato público.

## Problem Statement

O simulador resolve blocos, cunhas, atrito, lançamentos e colisões inelásticas, mas não expressa nenhum Constraint. O `CONTEXT.md` define Constraint ("ropes, springs, pulleys") desde o v1 e nenhum existe no schema. Isso deixa de fora uma fatia enorme dos problemas de livro: máquina de Atwood, bloco na mesa puxado por bloco pendurado, polia móvel, talha, pêndulo, massa-mola, MHS amortecido. O aluno abre o app com um enunciado desses e não tem como montá-lo.

Dois incômodos do uso atual entram junto porque os vínculos os agravam:

1. **As setas não dizem o que são.** O canvas desenha peso, força aplicada, normal e `v₀` só como seta. Com tração e força elástica entrando, o diagrama de corpo livre fica ilegível sem a letra de cada vetor.
2. **Os presets são uma lista plana de quatro**, com nome e descrição fixos em pt-BR, fora do i18n. Com oito presets novos, a galeria precisa de organização.

## Solution

1. **Corda ideal**: inextensível, sem massa, unilateral (afrouxa). Liga um ponto de um Corpo a um ponto de outro, passando por qualquer sequência de Polias. O pêndulo é uma corda presa num Corpo fixo, sem elemento próprio.
2. **Polia**: elemento sem massa, com raio, sempre montado num ponto de um Corpo. Montada num Corpo fixo é polia fixa; num Corpo dinâmico, polia móvel. Realism option: massa (disco).
3. **Mola ideal**: `k`, comprimento natural `x₀`, amortecimento `c` (padrão 0). Realism option: massa.
4. **Editor**: ferramentas Corda, Polia e Mola na paleta, com **Anchor snap** (âncora vai para centro de massa, meio de face ou vértice), também para o ponto de aplicação das forças.
5. **Vetores**: setas de tração `T` e força elástica `F_el`, e um rótulo de letra em todo vetor (`P`, `N`, `F`, `T`, `F_el`, `v₀`), sem valores. Os valores de `T`, `F_el` e `Δx` aparecem no painel de leitura quando a corda ou a mola está selecionada.
6. **Presets em árvore**: área → parte → tópico, seguindo o *Tópicos de Física*; nome e descrição no i18n; oito presets novos, cada um também uma família de aceitação analítica.
7. **Code-split do wasm**: o Rapier sai do chunk de entrada.
8. **Closeout**: sweep, passe manual, FINAL_REPORT v4.

## User Stories

### Corda
1. As a student, I want to tie two bodies with a rope, so that I can build "two bodies linked by a rope" problems.
2. As a student, I want the rope to be massless and inextensible by default, so that the textbook idealization holds without configuration (ADR-0002).
3. As a student, I want the rope's length to come from where the bodies are when the scene starts, so that I never type a length the problem doesn't give.
4. As a student, I want the rope to always start taut, so that "linked by a rope" means what the textbook means.
5. As a student, I want the rope to go slack when the bodies approach each other, so that a rope never pushes.
6. As a student, I want a pendulum to be a rope tied to a fixed body, so that I don't need to learn a separate element.
7. As a student, I want a bob on a rope whirled in a vertical circle to fall inward when the speed at the top is below √(gL), so that the "rope goes slack at the top" problem plays out correctly.
8. As a student, I want the rope to pass through bodies without colliding, so that its drawing never jams the scene.
9. As a student, I want the rope drawn as straight segments that wrap around pulleys, so that the picture matches the book.
10. As a student, I want a structural edit during playback to keep the rope length from the scene's t=0, so that pausing and editing never shortens or lengthens a rope.

### Polia
11. As a student, I want to mount a pulley on a fixed body, so that I can build an Atwood machine or a block-on-table-with-hanging-block.
12. As a student, I want to mount a pulley on a dynamic body, so that I can build a movable pulley with a block hanging from its axle.
13. As a student, I want one rope to pass over any number of pulleys in sequence, so that block-and-tackle problems are expressible.
14. As a student, I want pulleys massless and frictionless by default, so that tension is the same on both sides (ADR-0002).
15. As a student, I want the movable pulley to give the 2:1 acceleration ratio, so that the classic result appears on screen.
16. As an ITA student, I want to give a pulley a mass, so that tension differs on each side and the acceleration drops to the `(m₁−m₂)g/(m₁+m₂+M/2)` result.
17. As an ITA student, I want a massive movable pulley's mass to count in the translation of the body it is mounted on, so that its weight enters the force balance.
18. As a student, I want the pulley's radius editable, so that the drawing fits the scene.

### Mola
19. As a student, I want to link two bodies (one may be fixed) with a spring of stiffness `k`, so that I can build mass-spring problems.
20. As a student, I want the spring to store its natural length `x₀`, so that I type the value the problem gives.
21. As a student, I want the spring to start relaxed when I create it, so that the default is the neutral case.
22. As a student, I want `x₀` and `Δx` both editable and linked in the inspector, so that "compressed by 5 cm" takes one field.
23. As a student, I want dragging a body to change `Δx` and keep `x₀`, so that pushing a block visibly compresses the spring.
24. As a student, I want a damping coefficient `c` defaulting to 0, so that damped oscillation is available without changing the ideal default.
25. As an ITA student, I want to give a spring a mass, so that the period moves toward `2π√((m + mₛ/3)/k)`.
26. As a student, I want the spring not to collide with anything, so that it behaves like the rope.

### Editor
27. As a student, I want Rope, Pulley and Spring tools in the palette, so that constraints are placed like bodies.
28. As a student, I want to create a rope by clicking anchor A, then the pulleys in order, then anchor B, so that the rope path is explicit.
29. As a student, I want to create a spring by clicking anchor A then anchor B, so that it takes two clicks.
30. As a student, I want to create a pulley by clicking a point on a body, so that it is mounted where I clicked.
31. As a student, I want Esc to cancel a rope or spring in progress, so that a wrong click costs nothing.
32. As a student, I want anchors to snap to the center of mass, a face midpoint or a vertex when I click near one, so that I don't have to hit an exact pixel.
33. As a student, I want the application point of an applied force to snap the same way when I drag it on the canvas, so that forces and ropes share one rule.
34. As a student, I want to select a rope, pulley or spring by clicking it, so that I can inspect or delete it.
35. As a student, I want Delete to remove the selected constraint, so that it works like bodies.
36. As a student, I want removing a body to remove the pulleys mounted on it and every rope and spring attached to it or passing through them, so that nothing dangles.
37. As a student, I want removing a pulley to remove the ropes that pass through it, so that no rope loses its path silently.
38. As a student, I want every constraint edit to be undoable, so that undo has no gaps.
39. As a student, I want a rope's derived length shown read-only in the inspector, so that I can check it against the problem.

### Leitura e vetores
40. As a student, I want to see the tension `T` of the selected rope in the readout panel, so that I can check an Atwood answer.
41. As a student, I want the readout to say when the rope is slack, so that `T = 0` has a visible reason.
42. As a student, I want `T₁` and `T₂` for each segment when a pulley has mass, so that the unequal tensions are readable.
43. As a student, I want `F_el` and `Δx` of the selected spring in the readout panel, so that I can check Hooke's law.
44. As a student, I want tension arrows on every dynamic body a rope pulls, including a movable pulley's body, so that the free-body diagram is complete.
45. As a student, I want elastic-force arrows on the bodies a spring acts on, so that the diagram shows `F_el`.
46. As a student, I want tension and elastic arrows to follow the same length rule as the other arrows, so that sizes are comparable.
47. As a student, I want every vector to carry its letter (`P`, `N`, `F`, `T`, `F_el`, `v₀`), so that I know which arrow is which.
48. As a student, I want subscripts only when two vectors of the same kind exist, so that labels stay short.
49. As a student, I want the same rope to carry the same `T` on both ends and the same contact the same `N` on both bodies, so that action-reaction reads as in the book.
50. As an English-speaking student, I want `W` and `F_s` instead of `P` and `F_el`, so that labels follow my language.

### Presets
51. As a student, I want the preset gallery grouped by area, part and topic as in my textbook, so that I find a problem where my book puts it.
52. As a student, I want only topics that have presets to appear, so that the gallery makes no promises.
53. As a student, I want presets inside a topic ordered by increasing difficulty, so that I can climb.
54. As a student, I want preset names and descriptions in my language, so that both catalogs are complete.
55. As a student, I want presets for Atwood, block on table with hanging block, movable pulley, simple pendulum, full-circle pendulum, horizontal and vertical mass-spring, and damped mass-spring, so that each new constraint has a ready example.

### Carregamento e closeout
56. As a student, I want the app shell to load without waiting for the physics engine bundle, so that the first paint is fast.
57. As a maintainer, I want the four gates green and a manual pass recorded at cycle end, so that v4 is verifiably whole.
58. As a maintainer, I want a FINAL_REPORT v4 section and the new terms in `CONTEXT.md`, so that the next cycle starts from a verified state.

## Implementation Decisions

### Processo
- Board local `.scratch/physics-sim-v4/`, uma spec, um arquivo por ticket. O loop é a skill `ticket-flow`; gate, base e modelos estão no `AGENTS.md`. Mutate-verify obrigatório.
- **Sem compatibilidade**: `SCENE_VERSION` continua 1; documentos antigos podem quebrar. O app só é divulgado ao fim do ciclo de mecânica. Antes da publicação, o repo passa por `/audit` até ficar bom.

### Schema
- A Scene ganha duas coleções no topo: `pulleys` e `constraints`. Forma de referência (decisão, não código final):

      Pulley     = { id, bodyId, anchor: Vec2, radius, mass? }
      Constraint = { id, kind: 'rope',   a: End, b: End, via: pulleyId[] }
                 | { id, kind: 'spring', a: End, b: End, k, x0, c?, mass? }
      End        = { bodyId, anchor: Vec2 }

- `anchor` segue o contrato das forças aplicadas: metros a partir da ORIGEM do frame do Corpo, girando com ele (para triângulos a origem é o vértice α).
- A corda **não guarda comprimento**. `L` é derivado do caminho (segmentos tangentes + arcos nas polias) nas posições do documento, em t=0. Numa reconstrução estrutural com carry, `L` continua sendo o do documento, não o das posições carregadas.
- Lado em que a corda contorna cada polia: derivado da geometria (a corda envolve a polia pelo lado da curva de entrada→saída). Não é campo.
- A mola guarda `x₀` (comprimento natural). `x` = distância atual entre as âncoras, `Δx = x − x₀`. Criada com `x₀ = x`.
- `mass` ausente = 0 (Idealized default). Massa de polia é disco, `I = ½MR²`.
- O codec valida: referências pendentes (corpo, polia), âncora em corpo inexistente, `k > 0`, `x₀ > 0`, `c ≥ 0`, `radius > 0`, `mass ≥ 0`, corda com as duas pontas no mesmo corpo sem polia rejeitada. Valores fisicamente estranhos avisam, não bloqueiam (regra das Constants).

### Simulador
- **A corda é código nosso**, não a junta de corda do Rapier: um único mecanismo para toda corda, com ou sem polia. O Rapier 0.20 não tem junta de polia (L₁+L₂=const) e não devolve a força aplicada por junta nenhuma; com o vínculo nosso, a tração sai do próprio cálculo. O mecanismo roda em volta do `world.step()`, no gancho que já aplica as forças a cada passo.
- **Risco declarado**: o vínculo fora do solver do Rapier pode não convergir junto com contatos e atrito (bloco na mesa puxado pela corda). O primeiro ticket é um tracer que prova Atwood e bloco-na-mesa com μₖ contra a solução analítica. Se não passar, o ciclo para e o ADR-0001 é reaberto. Se passar, a abordagem vira o **ADR-0004**, escrito no mesmo ticket.
- **A mola é força nossa**, aplicada no mesmo gancho das cordas (`k·Δx` mais o termo de `c`, antes das cordas), não a junta de mola do Rapier: a junta perdeu ~30% da amplitude em 5 períodos no PHY-26. `F_el` sai do mesmo cálculo. Mecanismo e números no ADR-0004 (seção Springs).
- **Mola com massa**: cadeia escondida de N corpos pequenos ligados por N+1 molas, sem colisão, desenhada como uma mola só. `F_el` pode diferir em cada ponta.
- **Polia com massa**: a polia passa a ter estado angular próprio, sem deslizamento da corda; `T` difere em cada segmento. Na polia montada em corpo dinâmico, `M` soma na translação desse corpo.
- O Simulator ganha uma leitura dos vínculos, lado a lado com `readStates`/`readContacts`: por corda, `T` por segmento e se está frouxa; por mola, `F_el` em cada ponta e `Δx`.
- Toda edição de `pulleys` e `constraints` é **estrutural** no roteador de playback (como Contact). Nenhum setter ao vivo novo.
- Particle mode não afeta polias (não são Corpos).

### Editor
- Três ferramentas novas na paleta: **Polia** (um clique num Corpo), **Mola** (âncora A → âncora B), **Corda** (âncora A → polias em ordem → âncora B). Esc cancela a criação em andamento. Clique em ponto fora de Corpo é ignorado.
- **Anchor snap** (termo novo no `CONTEXT.md`): resolver puro que, dado um Corpo e um ponto do mundo, devolve a âncora local — centro de massa, meio de face ou vértice quando dentro de uma tolerância em pixels de tela; o próprio ponto, caso contrário. Usado por Corda, Mola, Polia e pelo arraste do ponto de aplicação de força aplicada no canvas (novo; os campos numéricos continuam).
- Seleção: clicar numa corda, mola ou polia seleciona. Inspetor: corda (lista do caminho, `L` somente leitura); mola (`k`, `x₀`, `Δx`, `c`, massa); polia (raio, massa). `x₀` e `Δx` editáveis e ligados: editar `Δx` grava `x₀ = x − Δx`.
- Remoção com dependentes: remover Corpo leva polias montadas nele, molas e cordas presas a ele e cordas que passam por essas polias; remover polia leva as cordas que passam por ela. Delete funciona na seleção de vínculo.
- Undo/redo: já opera sobre a Scene; toda operação nova passa pelo setter do doc.
- Painel de leitura: com corda selecionada, `T` (ou `T₁`, `T₂`… por segmento quando alguma polia do caminho tem massa) e "frouxa" quando for o caso; com mola selecionada, `F_el` e `Δx`. O ajuste fino do painel fica para a fase de polimento de UX.

### Vetores e rótulos
- Setas de `T`: em cada Corpo dinâmico puxado pela corda, na âncora, ao longo do segmento; no Corpo dinâmico que monta uma polia, uma seta por segmento adjacente, no centro da polia. Setas de `F_el`: em cada ponta dinâmica da mola, na âncora. Mesma regra de comprimento (`vectorArrowLengthPx`). Corpos fixos não recebem setas (regra atual).
- Rótulo de letra em todo vetor, sem valor, sempre visível, derivado da cena e nunca guardado (mesma natureza do Mass label):

  | Vetor | pt-BR | en-US |
  |---|---|---|
  | Peso | `P` | `W` |
  | Normal | `N` | `N` |
  | Força aplicada | `F` | `F` |
  | Tração | `T` | `T` |
  | Força elástica | `F_el` | `F_s` |
  | Velocidade inicial | `v₀` | `v₀` |

- Subscrito numérico só quando a cena tem dois ou mais do mesmo tipo, na ordem do documento. A mesma corda leva o mesmo rótulo nas duas pontas (com polia de massa, cada segmento tem o seu); o mesmo par de Contact leva o mesmo `N` nos dois corpos.
- Sem seta de atrito nesta versão.

### Presets
- Um preset declara seu nó na árvore (área → parte → tópico) e sua posição dentro do tópico (dificuldade crescente). A galeria agrupa por nó e mostra só nós com preset. Nome, descrição e rótulos dos nós vêm do i18n (os dois catálogos).
- A árvore segue o *Tópicos de Física* (Helou, Gualter, Newton; ed. 2012); na dúvida, a convenção mais popular. O código só carrega os nós usados; o mapa completo está nas Further Notes.
- Os quatro presets atuais são realocados: cunha empurrada → Dinâmica/Princípios; bloco na rampa → Dinâmica/Atrito; projétil e queda livre → Dinâmica/Movimentos em campo gravitacional uniforme.
- Oito presets novos: Atwood; bloco na mesa com bloco pendurado (μₖ) → Dinâmica/Princípios; polia móvel 2:1 → Dinâmica/Princípios; pêndulo em volta completa → Dinâmica/Resultantes tangencial e centrípeta; pêndulo simples, massa-mola horizontal, massa-mola vertical, massa-mola amortecida → Ondulatória/MHS.

### Code-split
- O módulo do simulador (e com ele o Rapier com wasm embutido) é carregado por import dinâmico no boot que a tela de carregamento já dispara. O chunk de entrada fica abaixo de 500 kB. Se o aviso persistir, só pode nomear o chunk tardio do Rapier, e isso fica documentado.

## Testing Decisions

- Um bom teste observa comportamento externo por uma costura: entrada → saída. Nada de estado interno do React ou detalhes de implementação do vínculo.
- **Costura principal: o Simulator** (`createSimulator(scene)` → `step`/`readStates`/leitura dos vínculos). Toda física nova é provada lá, contra a solução analítica, como a suíte de aceitação atual. Tolerâncias na faixa atual (2–5%); cada ticket fixa a sua.
- Famílias de aceitação novas:
  - Atwood: `a = (m₁−m₂)g/(m₁+m₂)`, `T = 2m₁m₂g/(m₁+m₂)`.
  - Bloco na mesa + pendurado com μₖ: `a = (m₂ − μₖm₁)g/(m₁+m₂)` e `T`.
  - Polia móvel: `a_bloco = a_ponta/2`.
  - Pêndulo simples, θ₀ ≤ 10°: `T = 2π√(L/g)`.
  - Volta completa: com `v_topo² < gL` a corda afrouxa (T = 0) e o corpo sai do círculo; com folga, completa.
  - Massa-mola horizontal: período `2π√(m/k)` e amplitude.
  - Massa-mola vertical: equilíbrio deslocado `mg/k` e período.
  - Amortecida: envelope `∝ e^(−ct/2m)`.
  - Polia com massa: `a = (m₁−m₂)g/(m₁+m₂+M/2)`, `T₁ ≠ T₂`.
  - Mola com massa: período próximo de `2π√((m + mₛ/3)/k)` (mₛ ≪ m).
- **Codec**: round-trip de `pulleys`/`constraints`, rejeições e avisos. Prior art: `codec.test.ts`.
- **Doc**: operações puras de adicionar/editar/remover vínculo e remoção com dependentes. Prior art: `doc.test.ts`.
- **Roteador**: edição de vínculo → estrutural. Prior art: `routing.test.ts`.
- **Anchor snap**: resolver puro. Prior art: `contactSnap.test.ts`.
- **Overlay e rótulos**: funções puras de setas e rótulos. Prior art: `overlay.test.ts`, `massLabels` em `draw.test.ts`.
- **App**: gestos, seleção, inspetor e leitura pelos espelhos do `App.test.ts`; geometria de canvas real pelo harness `src/test/browser.ts` quando necessário. Nessas costuras de DOM, o ticket registra, por teste novo, a mutação aplicada e a saída vermelha (AGENTS.md).
- **Presets**: cada preset parseia, faz round-trip e está num nó existente; os nós do i18n existem nos dois catálogos. Prior art: `presets.test.ts`, `i18n.test.ts`.

## Out of Scope

- Haste rígida, pivô/articulação, ω₀ inicial: item 4 do roadmap.
- Seta de atrito, módulo da normal (limitação #4), leituras de energia e momento: item 3.
- Restituição (colisões elásticas): item 2.
- Polia solta (sem Corpo, pendurada por outra corda).
- Atrito corda–polia, polia com atrito no eixo, corda com massa ou elástica.
- Compatibilidade com documentos antigos; migração de versão.
- Curadoria de presets além dos oito (etapa própria no fim da mecânica).
- Ajuste fino do painel de leitura (fase de polimento de UX).
- Mobile.

## Further Notes

### Depois da v4 (registrado aqui, não é deste ciclo)
- Roadmap da mecânica: restituição → leituras de energia/momento/forças de contato → pivô, haste, ω₀ → força variável e referencial acelerado → gravitação → empuxo.
- Etapa de curadoria de presets, com grilling próprio, no fim da mecânica.
- Fase de polimento de UX (inclui o painel de leitura).
- `/audit` até o repo ficar bom, antes de publicar.

### Mapa de cobertura (árvore, segundo o *Tópicos de Física*, ed. 2012)
- **Mecânica** — Cinemática (bases da Cinemática escalar; MU; MUV; movimentos circulares; vetores e Cinemática vetorial) · Dinâmica (princípios; atrito entre sólidos; resultantes tangencial e centrípeta; gravitação; movimentos em campo gravitacional uniforme; trabalho e potência; energia mecânica; quantidade de movimento — colisões aqui) · Estática (sólidos; fluidos)
- **Termologia** — temperatura; calor e propagação; calor sensível e latente; gases perfeitos; termodinâmica; dilatação
- **Ondulatória** — MHS; ondas; acústica
- **Óptica geométrica** — fundamentos; reflexão; refração; lentes; instrumentos e visão
- **Eletromagnetismo** — Eletrostática; Eletrodinâmica; Eletromagnetismo
- **Física moderna**

### Ordem
PHY-23 é o tracer e bloqueia tudo que é corda. A mola (PHY-26) só depende do schema do tracer. PHY-32 (code-split) é independente. PHY-33 (closeout) é bloqueado por todos.
