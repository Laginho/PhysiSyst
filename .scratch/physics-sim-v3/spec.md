# physics-sim v3 — Release digno (desktop)

Status: ready-for-agent

Insumo: `docs/repo-review-2026-09-09.md` + sessão de grilling de 2026-09-09.

## Problem Statement

physics-sim v2 está funcionalmente maduro, mas não existe caminho do repositório até o estudante. Não há licença, CI, deploy nem versão; os quatro portões (`test`, `lint`, `typecheck`, `build`) só rodam na mão de quem lembra. Quem chega ao app esbarra em quatro furos no primeiro uso:

1. **O snap encosta o bloco na rampa, mas não declara o Contato.** O resolver sabe qual superfície venceu e descarta a informação. O aluno dá play e o bloco desliza como se nada tivesse sido dito sobre atrito, e o par com μ ainda tem que ser criado à mão no painel.
2. **Não há undo nem tecla Delete.** Com autosave de 400 ms, um arraste errado é gravado e irreversível. Não existe nenhum atalho de teclado no app.
3. **O canvas é fixo em 900×600** e o backing store é medido uma única vez no mount; redimensionar a janela estica o desenho.
4. **O motor de física (wasm) carrega no primeiro play, sem feedback.** O momento mais visível de uma aula, apertar play, é o que trava.

O público é o estudante brasileiro em desktop (Windows quase ubíquo). Mobile está fora de horizonte.

## Solution

Um ciclo curto, seis tickets, uma ideia: **tirar o app da pasta `dist/` e colocá-lo em uma URL que um aluno consegue usar sem tropeçar.**

1. **Release mecânico**: LICENSE MIT, CI com os quatro portões em PR e push, deploy estático no GitHub Pages, `version` 0.3.0.
2. **Snap declara Contato**: encostar um Corpo em outro cria o par no doc, com μ = 0 (idealização padrão). O aluno só preenche μ se o enunciado der.
3. **Undo/redo + Delete + atalhos + menu `?`**: pilha de Scene, botões ↶ ↷, atalhos universais, popover listando os comandos.
4. **Canvas mede o container**: mantém 3:2, cabe no espaço disponível, re-mede em resize.
5. **Tela de carregamento com personalidade**: wasm carrega na abertura, com mensagens de piada de física rotacionando enquanto espera.
6. **Closeout**: sweep dos portões, passe manual desktop (herdeiro do T12 do v1), FINAL_REPORT v3.

## User Stories

### Release
1. As a student, I want to open the simulator at a public URL, so that I don't need Node or git to use it.
2. As a maintainer, I want the four quality gates to run on every pull request, so that no PR merges red.
3. As a maintainer, I want the site to redeploy automatically on every push to main, so that "release" is a merge, not a manual step.
4. As a maintainer, I want an explicit open-source license, so that others know what they may do with the code.
5. As a maintainer, I want a real version number, so that bug reports can name what they ran.
6. As a maintainer, I want the deploy base path configurable, so that moving to a custom domain later is a one-line change.

### Snap declara Contato
7. As a student, I want dropping a block flush against a wedge to create the Contact pair automatically, so that the pair exists before I think about friction.
8. As a student, I want dropping a block on the ground to create the ground Contact, so that block-on-floor friction problems take one drag.
9. As a student, I want snap-created Contacts to start frictionless (μs = μk = 0), so that the idealized default holds until the problem says otherwise (ADR-0002).
10. As a student, I want the "add contact" button in the panel to also start frictionless, so that there is one default, not two.
11. As a student, I want no duplicate pair when I re-snap two bodies already in Contact, so that the panel doesn't fill with repeats.
12. As a student, I want the Contact to remain after I drag the body away, so that a μ I typed is never silently erased.
13. As a student, I want the pair to appear in the contacts panel with no popup or banner, so that the common frictionless case stays quiet.
14. As a student, I want snap to create the Contact only when I release the mouse, so that dragging past a surface doesn't leave a trail of pairs.
15. As a student, I want the snapped Contact to be honored by the simulator on play, so that setting μ on it actually produces friction.

### Undo, Delete, atalhos
16. As a student, I want Ctrl+Z to undo my last edit, so that a wrong drag is not permanent.
17. As a student, I want Ctrl+Shift+Z or Ctrl+Y to redo, so that I can compare before/after.
18. As a student, I want a whole drag (move, rotate, resize, α) to undo as one step, so that undo doesn't replay 200 intermediate frames.
19. As a student, I want every edit that changes the scene (mass, μ, force, g, v₀, particle mode, add/remove body, add/remove contact) to be undoable, so that undo has no surprising gaps.
20. As a student, I want Delete or Backspace to remove the selected body with its forces and contacts, so that I don't have to find the trash.
21. As a student, I want Space to play/pause, → to step, R to reset, and Esc to deselect, so that the controls a teacher uses most are on the keyboard.
22. As a student, I want shortcuts ignored while I'm typing in a text field, so that Backspace in an input never deletes a body.
23. As a student, I want ↶ ↷ buttons in the playback bar, disabled when there is nothing to undo/redo, so that I discover undo exists.
24. As a student, I want a `?` button that opens a small list of every shortcut, so that I can learn them without a manual.
25. As a student, I want the `?` key to open that same list and Esc or a click outside to close it, so that the menu itself follows the shortcut rules.
26. As a student, I want undo during playback to pause and restore the scene, so that undo always means "go back", never "keep running with the old doc".
27. As a student, I want the undo stack cleared when I switch, import, or create a scene, so that undo never leaks edits from one scene into another.
28. As a student, I want undo depth of at least 50 steps, so that a whole editing session is recoverable.
29. As a Mac user, I want Cmd to work where the menu says Ctrl, so that the app works without the menu having to explain it.

### Canvas
30. As a student, I want the canvas to fill the available width of my window, so that the scene isn't a small box on a large monitor.
31. As a student, I want the canvas to keep its 3:2 proportion, so that scenes composed on another monitor look the same on mine.
32. As a student, I want the canvas to re-measure when I resize or maximize the window, during editing or playback, so that the drawing never stretches.
33. As a student, I want a minimum canvas width, so that the scene never collapses into an unreadable strip.
34. As a student, I want dragging, hit-testing and the trash target to stay accurate after a resize, so that editing works at any size.

### Carregamento
35. As a student, I want the physics engine to start loading when the app opens, so that my first play is instant.
36. As a student, I want a visible loading screen while the engine loads, so that I never wonder whether the app froze.
37. As a student, I want the loading screen to show rotating physics jokes, so that the wait has personality.
38. As a student, I want the jokes in Portuguese and English matching my language setting, so that both catalogs stay complete.
39. As a student, I want a clear error with a "try again" button if the engine fails to load, so that I'm never stuck on a joke forever.
40. As a student, I want the loading screen to disappear the moment the engine is ready, so that it never delays me.

### Closeout
41. As a maintainer, I want the four gates green at cycle end, so that v3 is verifiably whole.
42. As a maintainer, I want the desktop manual pass executed and recorded, so that the T12 debt from v1 finally closes.
43. As a maintainer, I want the mobile items of T12 formally discarded, so that the backlog stops promising mobile.
44. As a maintainer, I want a FINAL_REPORT v3 section, so that the next cycle starts from a verified state.

## Implementation Decisions

### Processo
- Board local `.scratch/physics-sim-v3/`, uma spec, um arquivo por ticket.
- Cada ticket: branch `feat/<slug>`, PR contra `main`, CI verde obrigatório, merge commit (não squash).
- TDD simples: o teste que falha é commitado **antes** da implementação, no mesmo PR.
- Papéis: Fable escreve spec e tickets. Sonnet (high) implementa. Opus (high) revisa, abre PR e faz merge. Se Opus precisar corrigir código, Fable revisa e faz merge.
- O implementador marca `Status:` do ticket ao começar e ao abrir PR, e comenta no ticket o que ficou de fora.
- Mutate-verify (AGENTS.md) continua obrigatório em todo teste de regressão novo.

### Release mecânico
- LICENSE MIT, titular Bruno Lage, 2026.
- CI (GitHub Actions): um workflow com `npm ci` e os quatro portões, disparado em PR e push em `main`, Node 22 LTS.
- Deploy: workflow que roda o build e publica em GitHub Pages via Actions (não branch `gh-pages`), disparado só em push em `main` e só após os portões passarem.
- Vite `base` = `/PhysiSyst/`. Migração futura para domínio próprio: `base: '/'` + arquivo `CNAME`.
- `version` em `package.json` vai a `0.3.0`. `1.0.0` fica para quando o passe manual desktop passar sem achados.
- README ganha o link do site publicado.

### Snap declara Contato
- O resolver de snap passa a devolver, além do Corpo ajustado, a identidade do vizinho vencedor (ou nulo quando não houve snap). Continua puro.
- O Contato é criado no `pointerup` do arraste de movimento, nunca no `pointermove`. O App guarda o vizinho vencedor do último movimento e, ao soltar, chama a operação de doc que adiciona o par.
- A operação que adiciona Contato passa a aceitar μ opcional. **O padrão único do editor vira μs = μk = 0** (ADR-0002: idealização padrão, realismo opt-in). O botão do painel e o snap usam o mesmo padrão. O antigo padrão 0.3/0.25 deixa de existir.
- Guardas existentes permanecem: self-pair, duplicado (em qualquer ordem) e referência pendente são rejeitados; o snap trata rejeição por duplicado como no-op silencioso.
- O Contato **permanece** se o corpo for afastado depois. Remoção continua manual (painel, ou remoção do corpo, que já leva os dependentes junto).
- Criar Contato é mudança estrutural (já classificada assim pelo roteador de playback); nada muda no simulador.
- Sem destaque, seleção ou aviso. O par apenas aparece no painel.

### Undo/redo, Delete, atalhos, menu
- **Uma costura nova**: um módulo puro de histórico com `push`, `undo`, `redo`, `clear`, `canUndo`, `canRedo`, limite de 50 entradas, operando sobre `Scene` imutáveis. Push descarta o ramo de redo.
- O App faz push no **commit** de uma edição: pointer-up de qualquer arraste (move, rotate, resize, α), e cada edição de painel que passe pelo setter do doc. Frames intermediários de arraste não entram.
- Trocar, importar, criar ou excluir cena chama `clear`. A pilha vive só em memória; não é persistida.
- Undo/redo durante playback: pausa, restaura o doc, e segue o caminho normal de rebuild estrutural com carry. Nenhuma lógica nova de playback.
- Delete/Backspace com corpo selecionado: mesma rota da lixeira (remoção do corpo com dependentes), depois limpa seleção.
- Atalhos: Ctrl+Z (undo), Ctrl+Shift+Z e Ctrl+Y (redo), Delete/Backspace (remover), Espaço (play/pause), → (um passo), R (reiniciar), Esc (desmarcar; fecha o menu se aberto), `?` (abre/fecha menu). O código aceita `metaKey` como equivalente de `ctrlKey`; o menu mostra apenas "Ctrl".
- Atalhos são ignorados quando o foco está em `input`, `textarea`, `select` ou elemento `contenteditable`.
- Um único listener de teclado no App; a decisão "tecla → ação" é uma função pura testável (entrada: tecla + modificadores + se o foco está em campo de texto; saída: nome da ação ou nulo).
- UI: botões ↶ ↷ na barra de playback, `disabled` quando `canUndo`/`canRedo` é falso. Botão `?` ao lado; abre um popover com a tabela de atalhos; fecha com Esc, clique fora ou `?`.
- Todas as strings novas (títulos dos botões, nomes das ações no menu) entram nos dois catálogos i18n.

### Canvas mede o container
- Uma função pura `fitCanvas(containerWidth, containerHeight) → { width, height }`: mantém 3:2, maior tamanho que cabe nos dois eixos (letterbox), largura mínima 600 px.
- O App observa o container com `ResizeObserver`, recalcula o tamanho lógico, o backing store (DPR) e a transformação mundo↔tela. A transformação e o retângulo da lixeira deixam de ser constantes de módulo e passam a derivar do tamanho atual.
- A câmera (pixels por metro e origem no mundo) escala com a largura, de modo que a mesma região do mundo fique visível em qualquer tamanho: o enquadramento não muda, a escala sim.
- Hit-test, arraste, snap, lixeira e overlay usam a transformação atual, não a de mount.

### Tela de carregamento
- O App dispara o boot do simulador no mount (o boot já é compartilhado e idempotente; hoje só é acionado no primeiro play).
- Um estado visível "booting" mostra um overlay sobre o canvas até o boot resolver. Falha usa o estado de erro que já existe, com mensagem fixa e botão "tentar de novo" que reexecuta o boot (o retry já é suportado: a promessa é descartada em falha).
- Mensagens: 10 chaves i18n (`loading.msg.01`…`loading.msg.10`), pt-BR e EN. Sem rodapé "sério": a mensagem é só a piada. Rotação: índice inicial sorteado, troca a cada 1,5 s, ciclo sem repetição imediata. A seleção `messageAt(seed, tick, count)` é pura.
- Leva inicial (o dono do produto corta o que não gostar):

  | # | pt-BR | EN |
  |---|---|---|
  | 01 | Resolvendo as equações de Navier-Stokes… | Solving the Navier-Stokes equations… |
  | 02 | Refutando a Teoria da Relatividade… | Refuting the Theory of Relativity… |
  | 03 | Desprezando a resistência do ar… | Neglecting air resistance… |
  | 04 | Considerando a vaca esférica… | Assuming a spherical cow… |
  | 05 | Convencendo o gato de Schrödinger a colaborar… | Convincing Schrödinger's cat to cooperate… |
  | 06 | Discutindo se g é 9,8 ou 10… | Arguing whether g is 9.8 or 10… |
  | 07 | Esticando a corda ideal sem massa… | Stretching the massless ideal rope… |
  | 08 | Lubrificando a polia sem atrito… | Oiling the frictionless pulley… |
  | 09 | Procurando a força normal que ninguém desenhou… | Looking for the normal force nobody drew… |
  | 10 | Renormalizando o infinito… | Renormalizing infinity… |

### Closeout
- Sweep: quatro portões locais + CI verde no último merge.
- Passe manual desktop (8 itens, escritos no ticket 06, substituem os 8 itens desktop do T12 do v1; os 10 itens mobile do T12 são declarados `wontfix`). Executado pelo reviewer no browser real, resultados registrados no FINAL_REPORT.
- FINAL_REPORT ganha a seção v3: escopo entregue, portões, passe manual, limitações conhecidas (as 10 do v1 continuam), próximos passos (v4: constraints, restituição, code-split).

## Testing Decisions

- Um bom teste observa comportamento externo por uma costura pura: entrada → saída. Não inspeciona estado interno do React nem detalhes de implementação.
- Política herdada do v1: sem testes automatizados de UI/e2e. Comportamento do App é pinado por espelhos puros (`makeAppLike` e afins em `App.test.ts`), como no drag-to-trash.
- Costuras por ticket:
  - **Snap → Contato**: testes de geometria no resolver verificam o vizinho devolvido (rampa, chão, círculo, fora da tolerância → nulo, múltiplos → o mais próximo). Testes de doc verificam a adição de Contato com μ opcional, padrão 0, duplicado rejeitado. Espelho de App verifica: pointer-up após snap adiciona exatamente um par; re-snap não duplica; afastar não remove. Prior art: `contactSnap.test.ts`, `doc.test.ts`, bloco drag-to-trash em `App.test.ts`.
  - **Undo/redo**: testes do módulo de histórico (push/undo/redo/clear/limite 50/redo descartado após push). Testes da função tecla→ação (cada atalho, Cmd ≡ Ctrl, foco em campo de texto → nulo). Espelho de App: um arraste = um passo; troca de cena limpa; Delete usa a remoção com dependentes. Prior art: `trash.test.ts`, `scheduler.test.ts` (funções puras), `App.test.ts`.
  - **Canvas**: testes de `fitCanvas` (letterbox nos dois eixos, mínimo 600, proporção exata). Prior art: `transform.test.ts`.
  - **Carregamento**: `messageAt` (determinístico por seed, nunca repete a anterior, cobre as 10). Paridade i18n já cobre as chaves novas. Prior art: `i18n.test.ts`, `scheduler.test.ts`.
  - **Release**: sem teste de código; o CI é o verificador. Aceitação: um PR de teste fica vermelho quando um portão falha.
- Mutate-verify obrigatório em cada teste de regressão novo, registrado no comentário do ticket.

## Out of Scope

- Constraints (corda, polia, mola), restituição, code-split do wasm: v4, com PRD próprio.
- Mobile/touch: fora de horizonte. Itens mobile do T12 → `wontfix`.
- Toda a dívida catalogada em FINAL_REPORT §4 (atrito em contatos não declarados, setas de normal sem magnitude, peso na origem do triângulo, gallery-ack de mão única, adapter rAF sem automação).
- Persistir a pilha de undo. Undo de operações de biblioteca de cenas (criar/excluir/renomear cena).
- Remoção automática de Contato ao afastar corpos.
- Domínio próprio (fica documentado como migração de uma linha).
- Duplicar corpo (Ctrl+D), atalhos além dos listados.

## Further Notes

- Tickets 01–05 são independentes entre si; a ordem 01→05 é preferência (CI primeiro para que todo PR seguinte já passe por ele). Só o 06 é bloqueado de fato.
- O padrão μ = 0 muda o comportamento do botão "adicionar contato" do painel (antes 0.3/0.25). É intencional e alinhado ao ADR-0002; nenhum teste existente pode depender do valor antigo sem ser atualizado com justificativa.
- O `≈` do readout (estimativa analítica para participantes de Contato) passa a aparecer também em corpos encostados por snap. É comportamento correto já especificado no v2, não regressão.
