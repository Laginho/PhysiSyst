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
