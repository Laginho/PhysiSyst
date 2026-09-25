# PHY-29: Setas de tração e força elástica, rótulos em todos os vetores
Stage: implementing
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
