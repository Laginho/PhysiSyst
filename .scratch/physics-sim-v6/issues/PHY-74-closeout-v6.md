# PHY-74: Closeout v6: testes de E_mec, 0.6.0, FINAL_REPORT
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-69, PHY-73
Review: human
Difficulty: normal

- Primary files:
  - src/presets/presets.test.ts (`load`, `run` ~:254-302)
  - src/sim/energy.ts (consumido)
  - package.json, package-lock.json (`version`)
  - FINAL_REPORT.md (seção v6 nova, no formato das anteriores: Scope Delivered, Gate Outcomes, Desktop Manual Pass, Known Limitations, Next Steps)
  - .scratch/physics-sim-v6/ledger.md

#### What to build

Fechamento da v6 no molde das versões anteriores.

**Testes de conservação com o módulo de energia.** Em `presets.test.ts`: no preset `projectile`, `systemEnergy` ao longo dos registros **em voo** (do quadro 1 até o último quadro em que `readContacts()` não tem o projétil, ou até t = 1 s, o que vier antes) fica dentro de 0,5% do valor em t = 0; no preset `simple-pendulum`, dentro de 2% ao longo de 600 passos.

**Versão.** `package.json` e os dois campos de versão raiz do `package-lock.json` passam de 0.4.0 para 0.6.0 (a v5 não teve bump; anotar).

**FINAL_REPORT v6.** Seção nova no fim: escopo entregue PHY-67…74 com uma linha por ticket; resultado do gate (uma rodada, log fora do repo, contagens filtradas do log); passe manual desktop com os itens abaixo; limitações conhecidas (Rapier 0.20 sem limiar de velocidade para restituição: bola com e = 1 quica para sempre; pares não declarados entre corpos com `e` em outros pares herdam `r_a·r_b`, desvio residual como no atrito; magnitude de normal e atrito ainda só direção); nota de que a v5 (PHY-58…66) não teve bump nem seção própria, com ponteiro para `.scratch/physics-sim-v5/`; Next Steps (v7: magnitude de normal/atrito, trabalho e dissipação, exportar gráfico).

Passe manual desktop (registrar OK/defeito por item):

1. Abrir `collision-elastic`, play: a esfera 1 para e a 2 sai com a mesma velocidade; sem quique no chão.
2. `collision-inelastic`: as duas seguem, a 1 mais devagar.
3. Editar `e` no ContactsPanel para 0 e dar reset: as esferas grudam.
4. Painel "sistema" no projétil: E_mec constante até o pouso, cai no impacto.
5. Gráfico de energia no `simple-pendulum`: E_c e E_pg se alternam, E_mec reta.
6. Clicar no gráfico move o slider e a cena; arrastar durante o play pausa.
7. Redimensionar o canvas: o gráfico acompanha a largura.
8. Trocar para en: leituras e eixos com ponto; pt-BR com vírgula.

#### Acceptance criteria

1. Teste do projétil em voo: `|Emec(i) − Emec(0)| ≤ 0,005·Emec(0)` em todo quadro em voo.
2. Teste do pêndulo: `|Emec(i) − Emec(0)| ≤ 0,02·Emec(0)` em 600 passos.
3. `package.json` e `package-lock.json` (raiz e `packages[""]`) em `0.6.0`.
4. FINAL_REPORT.md tem a seção v6 com os cinco blocos e os oito itens do passe manual preenchidos.
5. Gate verde numa rodada única com log fora do repo; contagem de testes e zero avisos de lint anotados na seção.
6. `ledger.md` da v6 com uma linha por ticket PHY-67…73 (este ticket entra na linha final do próprio commit de fechamento).

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/presets/presets.test.ts`: critérios 1 e 2 chamando `systemEnergy` sobre estados lidos do simulador; vermelhos hoje só se o módulo faltar — como o PHY-70 já entrou, estes testes nascem verdes e são validados por mutação (`g` trocado no cálculo de `Epg`, ou `½` removido de `Ec`) com a saída vermelha registrada aqui.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: projétil só nos quadros em voo (pousa em ~1,2 s e o impacto dissipa), pêndulo 2% na gravação inteira; versão 0.6.0; closeout igual aos anteriores (gate sweep, passe manual desktop, seção v6).
- Planner: `package.json` está em 0.4.0 e o FINAL_REPORT não tem seção v5; sobe direto para 0.6.0 e anota.

- 2026-10-03 Attempt 1 stopped to ask (its commits are on branch `phy/PHY-74-closeout-v6-asked-20261003-2134`): PHY-74 salvo como `blocked`: falta o passe desktop, pois o controle de navegador está indisponível. /  / - Testes de conservação validados por mutação. / - Versão 0.6.0 e relatório v6 preparados. / - Gate verde com dois workers: **1.094 testes**, lint sem avisos, typecheck e build. / - Commits: `8fc30c5`, `86ca45e`. /  / Para concluir, preciso de uma conexão de navegador ou dos resultados dos oito itens manuais.

- 2026-10-03 Proxy decided: o passe manual desktop é executado pelo próprio stage 2 em Chromium headless, pelo harness do repo (`withBrowserSession` em `src/test/browser.ts`, carregado por Vite SSR) contra o Vite dev server da branch, com cliques reais de paleta/inspector, eventos de mouse via CDP no canvas e no gráfico, redimensionamento da janela e troca de idioma; leituras tiradas do painel/eixos e screenshots. É o mesmo procedimento do PHY-33 (FINAL_REPORT v4, "Desktop Manual Pass (1–8)", 2026-09-25) e do PHY-63 (arraste por CDP). A falta do tool `cua`/`iab` do runtime não é bloqueio: o harness sobe o Chromium por conta própria, e o gate verde (1094 testes, incl. `App.browser.test.ts`) prova que ele acha o executável nesta máquina. O script do passe e as capturas ficam fora do repo (não são Primary files), como no PHY-33. Cada item vira OK ou defeito; um defeito abre ticket `needs-triage` na v6, não um diff aqui. O critério 4 fica como está; `Review: human` garante que o humano vê o resultado no PR da sessão. — Razão: precedente aceito do repo (v4), reversível (o humano pode repetir qualquer item no PR), e um run não assistido não tem humano para fazer o passe.
- 2026-10-03 Foreman: retomar da branch `phy/PHY-74-closeout-v6` (a `-asked-20261003-2134` renomeada; tem os commits 8fc30c5 testes e 86ca45e código — não recomeçar). Rodar os 8 itens, substituir as 8 linhas "Pending — browser connection required" do FINAL_REPORT por OK/defeito com os números medidos, reescrever o parágrafo "**Not executed.**" da seção Desktop Manual Pass descrevendo o run (Chromium headless, largura, idioma, dev server), corrigir a linha PHY-74 da tabela de escopo e o primeiro bullet de Next Steps, rodar o gate (`--maxWorkers=2`, como registrado) e commitar `Stage: to-review`.
