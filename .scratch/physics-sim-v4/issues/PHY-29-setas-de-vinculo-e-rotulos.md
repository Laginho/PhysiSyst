# PHY-29: Setas de tração e força elástica, rótulos em todos os vetores
Stage: to-review
Status: ready-for-agent
Blocked by: PHY-25, PHY-26
Review: agent

- Primary files:
  - `src/render/overlay.ts`, `src/render/overlay.test.ts`
  - `src/render/draw.ts`, `src/render/draw.test.ts` (texto do rótulo junto à seta)
  - `src/App.tsx` (liga as setas e rótulos novos ao desenho)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`, `src/i18n/i18n.test.ts`

#### What to build

O diagrama de corpo livre fica completo e legível. Toda corda desenha uma seta `T` em cada corpo dinâmico que puxa (na âncora, ao longo do segmento) e, no corpo dinâmico que monta uma polia, uma seta por segmento adjacente, no centro da polia. Toda mola desenha `F_el` em cada ponta dinâmica. Ambas usam a regra de tamanho de todas as setas (`vectorArrowLengthPx`). E todo vetor na tela ganha sua letra, sem valor:

| Vetor | pt-BR | en-US |
|---|---|---|
| Peso | `P` | `W` |
| Normal | `N` | `N` |
| Força aplicada | `F` | `F` |
| Tração | `T` | `T` |
| Força elástica | `F_el` | `F_s` |
| Velocidade inicial | `v₀` | `v₀` |

Os rótulos são derivados da cena, nunca guardados, e sempre visíveis.

#### Acceptance criteria

1. Função pura de setas de tração: uma por ponta dinâmica de corda, na âncora, no sentido do próximo ponto do caminho; uma por segmento adjacente no centro de polia montada em corpo dinâmico; nenhuma em corpo fixo; comprimento por `vectorArrowLengthPx(T)`
2. Função pura de setas de força elástica: uma por ponta dinâmica, no eixo da mola, sentido restaurador; comprimento por `vectorArrowLengthPx(|F_el|)`
3. Função pura de rótulos: símbolo por tipo conforme a tabela e o idioma; subscrito numérico (ordem do documento) só quando há dois ou mais do mesmo tipo na cena; a mesma corda com o mesmo rótulo nas duas pontas (com polia de massa, um rótulo por segmento); o mesmo par de Contact com o mesmo `N` nos dois corpos
4. Os rótulos são desenhados junto à ponta de cada seta, `F_el`/`F_s` com o subscrito em corpo menor, sem valores numéricos
5. Com corda frouxa (`T = 0`), a seta e o rótulo daquela corda somem
6. Símbolos nos dois catálogos; paridade do i18n cobre as chaves novas
7. Verificação live em browser: Atwood e massa-mola mostram `P`, `T`, `F_el` e `N` legíveis; trocar o idioma troca `P`→`W` e `F_el`→`F_s`
8. Testes de regressão mutate-verified
9. Gate verde

#### Verification

    npx vitest run src/render src/i18n
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/overlay.test.ts`: setas de tração e força elástica, rótulos (1–3, 5). Vermelho porque as funções não existem.
- `src/render/draw.test.ts`: texto desenhado junto à seta, sem número (4).
- `src/i18n/i18n.test.ts`: símbolos nos dois idiomas (6).

## Comments

- 2026-09-24 Stage 2 (claude-opus-5-5). Base: a sessão `sweatshop/2026-09-24-1853`; branch `phy/PHY-29-setas-de-vinculo-e-rotulos`.
  - `71924c7` só testes, vermelho: 17 testes novos falham (`tensionArrows`/`elasticArrows`/`vectorLabels is not a function`, `drawArrow` sem texto, chaves `vector.*` ausentes).
  - `02ec18e` código, sem tocar teste. `OverlayArrow` ganha `key` (a grandeza que a seta desenha: `weight:<corpo>`, `applied:<força>`, `normal:<par ordenado>`, `tension:<corda>` ou `tension:<corda>#<segmento>` com polia de massa, `elastic:<mola>`, `initial-velocity:<corpo>`). `vectorLabels(arrows, lang)` numera por tipo as chaves distintas na ordem das setas; `_` abre o subscrito (`T_1`, `F_el`, `F_el,2`). `drawArrow(..., label)` desenha o rótulo 18 px ao lado da ponta (perpendicular à seta, fora da corda ou da mola), base alinhada à direita e subscrito à esquerda em 11 px contra 15 px, sem `measureText`. `App.paint` rotula sobre o conjunto de setas da cena inteira, também no modo só-seleção; `constraintsRef` lê `readConstraints()` junto de cada `readContacts()`; `langRef` + efeito repinta ao trocar idioma.
  - Decisões fora do texto: `F_el = 0` numa ponta (mola no comprimento natural) não desenha seta, pela mesma guarda de magnitude zero que some com a corda frouxa; a checagem `state.slack` saiu por redundante (frouxa ⇒ `T = 0`), o que deixou a guarda presa pelo teste da corda frouxa. A legenda do toggle virou "mostrar todos os vetores" / "show all vectors" — a antiga listava só peso/aplicadas/normais.
  - Mutação (testes chamam as funções direto; registro por completude), cada uma vermelha em `npx vitest run src/render src/i18n`: guarda de magnitude zero removida → 2 falhas; `if (mount.fixed) return` removido → 4; `perSegment` sempre falso → 1; numerar sempre (`< 1`) → 4; sem `Math.sign` → 1; chave da normal por ponto → 1; ponta `a` no ponto errado → 2; subscrito na fonte da base → 1; rótulo não desenhado → 2; `vector.elastic` en = `F_el` → 3.
  - Critério 7, live: `vite preview` + Chromium headless, cenas semeadas no localStorage (sem preset de Atwood/massa-mola ainda, PHY-31), vetores ligados, reproduzir ~0,3 s, pausar, capturar, trocar idioma, capturar. Atwood pt-BR: `P_1`, `P_2`, `T` nas duas pontas, nenhuma seta na polia fixa; en: `W_1`, `W_2`, `T`. Massa-mola pt-BR: `F_el` no bloco (parede fixa sem seta), `N` nos dois pontos do contato, `P`; en: `F_s`, `W`. Primeira rodada achou o rótulo em cima da própria linha (o `T` sumia na corda, o `F_el` no zigue-zague); corrigido para o lado da ponta antes do commit.
  - Gate: 30 arquivos / 661 testes, lint, typecheck e build verdes.
