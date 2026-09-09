# PHY-12: Release mecânico
Stage: done
Blocked by: none

- Primary files:
  - New: `.github/workflows/ci.yml`
  - New: `.github/workflows/deploy.yml`
  - New: `LICENSE`
  - `README.md` (link do site publicado + linha sobre o deploy)
  - `package.json` (campo `version`)
  - `vite.config.ts` (campo `base`)

#### What to build

O repositório passa a ter um caminho automático até o aluno. Todo PR roda os quatro portões (`test`, `lint`, `typecheck`, `build`) no GitHub Actions e fica vermelho se qualquer um falhar. Todo push em `main` que passa nos portões publica o app em GitHub Pages, em `https://laginho.github.io/PhysiSyst/`. O repo ganha LICENSE MIT (Bruno Lage, 2026), `version` 0.3.0, e o README aponta para o site publicado.

#### Acceptance criteria

1. `LICENSE` na raiz com o texto MIT, titular Bruno Lage, ano 2026
2. Workflow de CI dispara em `pull_request` e em `push` para `main`, usa Node 22 LTS e `npm ci`, e roda os quatro portões como passos separados (falha em um marca o job como falho)
3. Workflow de deploy publica `dist/` em GitHub Pages via Actions (sem branch `gh-pages`), só em `push` para `main`, só após os portões passarem
4. Vite `base` configurado como `/PhysiSyst/`; o build resultante abre corretamente nesse subcaminho (assets e wasm inline resolvem)
5. `version` em `package.json` é `0.3.0`
6. README tem link para o site publicado e uma linha sobre como o deploy acontece
7. Comentário no ticket registra o link do primeiro deploy verde e o link de uma execução de CI que ficou vermelha de propósito (portão quebrado) e depois verde
8. Gate verde localmente

#### Verification

    cat LICENSE .github/workflows/ci.yml .github/workflows/deploy.yml
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

Nenhum. Ticket de configuração e CI: não há seam de unidade que possa ficar vermelho antes da mudança — a prova é a execução do workflow, criterion 7.

#### Resolution (2026-09-09)

Entregue em `2d14c80` (`feat(release): CI gates, GitHub Pages deploy, LICENSE, v0.3.0`), direto em `main`, **antes de o repo adotar o `ticket-flow`** — sem branch, sem revisão de stage 3. Arquivos: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `LICENSE`, `README.md`, `package.json`, `vite.config.ts`. Critérios 1–6 verificáveis na árvore; critério 8 é o portão que o CI roda em cada push desde então.

Critério 7 (links do primeiro deploy verde e de uma execução vermelha-depois-verde) **não foi registrado** e ninguém o verificou. Ficou como dívida de evidência, não de código.

## Comments

- 2026-09-09 — Ticket reconciliado com a árvore ao adotar o `ticket-flow`: estava `Status: ready-for-agent` com todas as caixas vazias enquanto o trabalho já estava em `main`. Fechado como `done` citando o commit real. Se o critério 7 importa, ele vira ticket próprio; não foi inventado aqui.
