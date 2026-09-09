# PHY-17: Closeout — sweep, passe manual desktop e FINAL_REPORT v3

**What to build:** Fechar o ciclo com evidência. Os quatro portões verdes localmente e no CI do último merge. O passe manual desktop (herdeiro dos 8 itens desktop do T12 do v1, pendente desde 2026-08-23) executado pelo reviewer em browser real, item a item, com resultado registrado. Os 10 itens mobile do T12 declarados `wontfix` (público é desktop). FINAL_REPORT ganha a seção v3.

**Blocked by:** PHY-12 Release mecânico, PHY-13 Snap declara Contato, PHY-14 Undo/redo e atalhos, PHY-15 Canvas mede o container, PHY-16 Tela de carregamento.

**Status:** ready-for-agent

## Passe manual desktop (executar no site publicado, não em `localhost`)

- [ ] **D1 · Abertura a frio** em Chrome, Edge e Firefox: overlay de carregamento aparece com piada, some quando o motor carrega, cena inicial renderiza sem erro no console
- [ ] **D2 · Edição com mouse**: criar retângulo, bola e cunha pela paleta; arrastar, rotacionar, redimensionar e ajustar α em cada um; hit-test seleciona o corpo de cima quando há sobreposição
- [ ] **D3 · Snap → Contato → atrito**: encostar bloco na rampa por snap; o par aparece no painel com μ = 0; digitar μs/μk; play; bloco fica parado ou desce conforme `g(sinα − μk·cosα)`; afastar o bloco mantém o par
- [ ] **D4 · Playback por botão e por tecla**: play/pause, passo, reiniciar e velocidade funcionam pelos botões e por Espaço, →, R; leitura de `|v|` e `|a|` atualiza; aceleração sobrevive à pausa
- [ ] **D5 · Undo/redo/Delete**: Ctrl+Z desfaz um arraste inteiro; Ctrl+Y refaz; botões ↶ ↷ desabilitam quando a pilha esvazia; Delete remove o corpo com seus contatos; Backspace dentro de um campo numérico apaga dígito, não corpo; menu `?` abre e fecha
- [ ] **D6 · Resize**: reduzir, ampliar e maximizar a janela durante edição e durante playback; canvas mantém 3:2, nunca estica, cena inteira visível; arraste e lixeira continuam precisos após o resize
- [ ] **D7 · Persistência**: salvar, duplicar, exportar e importar cena; recarregar a página preserva a cena e a lista; trocar de cena limpa o undo
- [ ] **D8 · Idioma**: alternar pt-BR ↔ EN; todas as strings novas (botões, menu `?`, piadas, erro de carregamento) traduzidas; nenhuma chave crua na tela; layout não quebra

## Closeout

- [ ] Quatro portões verdes localmente e no CI do último merge em `main` (links das execuções no comentário do ticket)
- [ ] Itens D1–D8 executados no site publicado; cada ❌ vira ticket novo neste board antes do fechamento, e o closeout só fecha com todos ✅ ou com o ❌ explicitamente aceito como limitação
- [ ] Os 10 itens mobile do T12 registrados como `wontfix` no FINAL_REPORT, com a razão (público desktop)
- [ ] FINAL_REPORT ganha seção "physics-sim v3": escopo entregue por ticket, portões, resultado D1–D8, limitações conhecidas (as 10 do v1 continuam, #3 resolvida pelo ticket 04), próximos passos (v4: constraints corda→polia→mola, restituição, code-split do wasm)
- [ ] Todos os tickets 01–05 marcados `complete` no board
