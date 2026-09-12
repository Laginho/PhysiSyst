# PHY-17: Closeout — sweep, passe manual desktop e FINAL_REPORT v3
Stage: to-review
Status: ready-for-agent
Blocked by: PHY-12, PHY-13, PHY-14, PHY-15, PHY-16

- Primary files:
  - `FINAL_REPORT.md` (nova seção "physics-sim v3")
  - `.scratch/physics-sim-v3/ledger.md`
  - `.scratch/physics-sim-v3/issues/*.md` (só as linhas `Stage:` e os comentários de fechamento)

Nenhum arquivo de `src/` está em jogo: um ❌ do passe manual vira ticket novo, não um diff aqui.

#### What to build

Fechar o ciclo com evidência. O gate verde localmente e no CI do último merge. O passe manual desktop (herdeiro dos 8 itens desktop do T12 do v1, pendente desde 2026-08-23) executado pelo reviewer em browser real, item a item, com resultado registrado. Os 10 itens mobile do T12 declarados `wontfix` (público é desktop). FINAL_REPORT ganha a seção v3.

#### Acceptance criteria — passe manual desktop (no site publicado, não em `localhost`)

1. **D1 · Abertura a frio** em Chrome, Edge e Firefox: overlay de carregamento aparece com piada, some quando o motor carrega, cena inicial renderiza sem erro no console
2. **D2 · Edição com mouse**: criar retângulo, bola e cunha pela paleta; arrastar, rotacionar, redimensionar e ajustar α em cada um; hit-test seleciona o corpo de cima quando há sobreposição
3. **D3 · Snap → Contato → atrito**: encostar bloco na rampa por snap; o par aparece no painel com μ = 0; digitar μs/μk; play; bloco fica parado ou desce conforme `g(sinα − μk·cosα)`; afastar o bloco mantém o par
4. **D4 · Playback por botão e por tecla**: play/pause, passo, reiniciar e velocidade funcionam pelos botões e por Espaço, →, R; leitura de `|v|` e `|a|` atualiza; aceleração sobrevive à pausa
5. **D5 · Undo/redo/Delete**: Ctrl+Z desfaz um arraste inteiro; Ctrl+Y refaz; botões ↶ ↷ desabilitam quando a pilha esvazia; Delete remove o corpo com seus contatos; Backspace dentro de um campo numérico apaga dígito, não corpo; menu `?` abre e fecha
6. **D6 · Resize**: reduzir, ampliar e maximizar a janela durante edição e durante playback; canvas mantém 3:2, nunca estica, cena inteira visível; arraste e lixeira continuam precisos após o resize
7. **D7 · Persistência**: salvar, duplicar, exportar e importar cena; recarregar a página preserva a cena e a lista; trocar de cena limpa o undo
8. **D8 · Idioma**: alternar pt-BR ↔ EN; todas as strings novas (botões, menu `?`, piadas, erro de carregamento) traduzidas; nenhuma chave crua na tela; layout não quebra

#### Acceptance criteria — closeout

9. Gate verde localmente e no CI do último merge em `main` (links das execuções no comentário do ticket)
10. Itens D1–D8 executados no site publicado; cada ❌ vira ticket novo neste board antes do fechamento, e o closeout só fecha com todos ✅ ou com o ❌ explicitamente aceito como limitação
11. Os 10 itens mobile do T12 registrados como `wontfix` no FINAL_REPORT, com a razão (público desktop)
12. FINAL_REPORT ganha seção "physics-sim v3": escopo entregue por ticket, portões, resultado D1–D8, limitações conhecidas (as 10 do v1 continuam, #3 resolvida pelo PHY-15), próximos passos (v4: constraints corda→polia→mola, restituição, code-split do wasm)
13. PHY-12 a PHY-16 em `Stage: done`, cada um com sua linha no `ledger.md` do board

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build
    gh run list --branch main --limit 3

## Tests stage 2 writes (own commit, red)

Nenhum. Ticket de closeout: a prova é o gate, o passe manual D1–D8 e o relatório. Se um item D vira código, ele vira ticket próprio, com os testes lá.

## Comments

#### Stage 2 (2026-09-11) — sweep + closeout prep, D1–D8 left for the reviewer

Nenhum arquivo de `src/` tocado (fora dos Primary files, como o ticket manda).
Este ticket delega o passe manual (critérios 1–8, 10) ao reviewer no site
publicado — o que segue é o que estava disponível para stage 2 fazer antes
disso.

**Dois achados de infraestrutura, ambos corrigidos antes de qualquer outra
coisa (autorizados pelo usuário em chat, por serem mudança de configuração de
repositório/push para `main`):**

1. GitHub Pages nunca tinha sido habilitado (`gh api repos/Laginho/PhysiSyst
   --jq .has_pages` → `false`). Toda execução do workflow `Deploy` desde o
   PHY-12 falhava com `Get Pages site failed`, e o site publicado respondia
   404. Corrigido com `gh api repos/Laginho/PhysiSyst/pages -X POST -f
   build_type=workflow`.
2. O branch local do PHY-16 (18 commits, merge incluído) nunca tinha sido
   enviado a `origin/main` — `git status` mostrava `ahead 18`. CI/Deploy nunca
   rodaram sobre esse estado. Corrigido com `git push origin main`.

Depois dos dois fixes, CI e Deploy rodaram verdes sobre o commit real mais
recente (`7f61cf6`, merge do PHY-16):

- CI: https://github.com/Laginho/PhysiSyst/actions/runs/34664290774
- Deploy: https://github.com/Laginho/PhysiSyst/actions/runs/34664315722
- Site publicado confirmado servindo o build atual (verificado em browser:
  título "physics-sim", botões ↶ ↷ e `?` presentes, confirmando PHY-13/14/16).

**Gate local** (`npm test && npm run lint && npm run typecheck && npm run
build`), rodado nesta branch: **459 testes / 27 arquivos verdes**, lint limpo,
`tsc --noEmit` limpo, build ok (só o aviso pré-existente de chunk > 500 kB).
Critério 9 atendido.

Critério 13 já estava atendido: PHY-12–PHY-16 em `Stage: done`, cada um com
linha no `ledger.md`.

**FINAL_REPORT.md** ganhou a seção "physics-sim v3": escopo por ticket,
resultado do gate, os dois achados de infra acima, os 10 itens mobile do T12
como `wontfix` (com a nota de que o texto original do checklist nunca foi
persistido em arquivo do repo — só a existência dele em `TASKS.md`/`LOGS.md`
do v1), limitações conhecidas (as 10 do v1, #3 marcada resolvida pelo PHY-15,
já assim desde o próprio PHY-15) e os próximos passos de v4. A seção
"Desktop Manual Pass (D1–D8)" está marcada **pendente** — critérios 1–8 e 10
ficam para o reviewer preencher com o resultado real no site publicado, e
criterion 11 (mobile wontfix) já está escrito lá.

O que falta para fechar: passe manual D1–D8 no site publicado, cada ❌ virando
ticket novo, e o preenchimento do resultado em FINAL_REPORT antes de marcar
`Stage: done`.

#### Stage 3 (2026-09-11) — passe manual D1–D8 parcial, ticket **não** fecha

Sessão de review interrompida pelo usuário com D4 e D6 em aberto. **Stage
continua `to-review`**: a stage 3 não terminou, e a próxima sessão retoma daqui,
não do zero.

**Gate (critério 9) reverificado nesta branch**, não herdado da stage 2:
459 testes / 27 arquivos verdes, lint limpo, `tsc --noEmit` limpo, build ok (só
o aviso pré-existente de chunk > 500 kB). CI e Deploy verdes no último commit de
`main` (`7f61cf6`), confirmados por `gh run list --branch main`. ✅

**Diff da branch**: só `FINAL_REPORT.md` e este ticket. Nenhum arquivo de `src/`
tocado, como o ticket manda. ✅

**Passe manual no site publicado** (`https://laginho.github.io/PhysiSyst/`,
Chromium, canvas 653×436, ppm 43.53). Resultado item a item na seção
"Desktop Manual Pass (D1–D8)" do `FINAL_REPORT.md`, com os números medidos.
Resumo:

| Item | |
|---|---|
| D1 | ⚠️ passa em Chromium; Edge e Firefox não exercitados |
| D2 | ⚠️ passa, menos o primeiro arraste de corpo não selecionado → **PHY-18** |
| D3 | ✅ passa inteiro, física batendo com `g(sinα − μk·cosα)` na terceira casa |
| D4 | ⛔ **em aberto** |
| D5 | ✅ passa; um sub-item (Backspace apagar dígito) é limitação do harness, não do app |
| D6 | ⛔ **em aberto** |
| D7 | ⚠️ passa, menos a cena reaberta no reload → **PHY-19** |
| D8 | ✅ passa inteiro |

**Por que D4 e D6 ficaram de fora.** Os dois dependem do loop de render —
playback de `requestAnimationFrame`, o fit do canvas de `ResizeObserver` — e o
painel de browser desta sessão nunca ficou visível: **0 ticks de rAF por
segundo**, medido três vezes, inclusive depois de a janela vir para a frente
(o painel em si continuou colapsado; uma aba nova abriu com `innerWidth: 0`).
Medida tirada nesse estado não vale: o canvas leu 653×436 a 800, 1280 e 1920 px
de viewport, o que *parece* falha de resize mas é indistinguível de o
`ResizeObserver` simplesmente nunca ter sido entregue. **Isso não é um ❌ do D6**
— é medida inválida, e está registrado assim no relatório.

**Critério 10 cumprido para o que foi observado**: os dois ❌ confirmados viraram
ticket antes de qualquer fechamento —
`PHY-18-canvas-nao-pula-ao-selecionar.md` e
`PHY-19-recarregar-abre-a-cena-atual.md`, ambos `Stage: to-implement`, com os
números medidos no corpo e a lista de testes que a stage 2 commita vermelha.
Nenhum dos dois está em `src/` dentro do escopo deste ticket, então nenhum vira
diff aqui — é exatamente o caso que o ticket previu.

**O que falta para este ticket fechar:**

1. D4 e D6 executados com um browser que realmente renderiza (conferir
   `requestAnimationFrame` antes de confiar em qualquer medida)
2. Cada ❌ novo que aparecer vira ticket, como estes dois
3. Preencher as duas linhas ⛔ da tabela do `FINAL_REPORT.md`
4. Só então `Stage: done` + linha no `ledger.md`

Fora de escopo, observado de passagem: `.claude/launch.json` tem uma entrada
`preview` não commitada, deixada pela stage 2. Não entra em commit deste ticket
(fora dos Primary files); decisão do usuário.
