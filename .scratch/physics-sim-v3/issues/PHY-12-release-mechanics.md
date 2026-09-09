# PHY-12: Release mecânico

**What to build:** O repositório passa a ter um caminho automático até o aluno. Todo PR roda os quatro portões (`test`, `lint`, `typecheck`, `build`) no GitHub Actions e fica vermelho se qualquer um falhar. Todo push em `main` que passa nos portões publica o app em GitHub Pages, em `https://laginho.github.io/PhysiSyst/`. O repo ganha LICENSE MIT (Bruno Lage, 2026), `version` 0.3.0, e o README aponta para o site publicado.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Arquivo `LICENSE` na raiz com o texto MIT, titular Bruno Lage, ano 2026
- [ ] Workflow de CI dispara em `pull_request` e em `push` para `main`, usa Node 22 LTS e `npm ci`, e roda os quatro portões como passos separados (falha em um marca o job como falho)
- [ ] Workflow de deploy publica `dist/` em GitHub Pages via Actions (sem branch `gh-pages`), só em `push` para `main`, só após os portões passarem
- [ ] Vite `base` configurado como `/PhysiSyst/`; o build resultante abre corretamente nesse subcaminho (assets e wasm inline resolvem)
- [ ] `version` em `package.json` é `0.3.0`
- [ ] README tem link para o site publicado e uma linha sobre como o deploy acontece
- [ ] Comentário no ticket registra o link do primeiro deploy verde e o link de uma execução de CI que ficou vermelha de propósito (portão quebrado) e depois verde
- [ ] All four gates green locally (`test`, `lint`, `typecheck`, `build`)
