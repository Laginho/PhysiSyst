# PHY-21: O harness de navegador do PHY-18 vira um módulo de verdade
Stage: to-implement
Status: ready-for-agent
Blocked by: PHY-18

- Primary files:
  - `src/App.test.ts` (somente o `describe` `selection keeps the canvas stationary (PHY-18)`)
  - New: `src/App.browser.test.ts`
  - New: `src/test/browser.ts` (ou nome equivalente para o harness)

#### What to build

Os quatro testes de geometria e arraste do PHY-18 continuam provando o mesmo, com
a mesma força, mas o programa que sobe o navegador deixa de ser uma string.

Hoje o `describe` do PHY-18 carrega ~150 linhas de JavaScript dentro de um
`String.raw`, executadas por `node --input-type=module -e`. Nada disso passa por
typecheck, lint ou realce de sintaxe, e existe um terceiro nível de escape
(strings JS dentro de `evaluate("…")`). O arquivo abre com
`// @vitest-environment jsdom` e todos os outros `describe` dele renderizam com
`renderApp()`; só esse sobe Chromium, o que também impede excluir o navegador do
gate sem excluir o resto.

Nada disso é dívida do PHY-18: os testes provam o que devem provar. É o formato
que não sobrevive à próxima pessoa que precisar mexer neles.

#### Acceptance criteria

1. O harness vive em módulo `.ts`, coberto por typecheck e lint, e não dentro de uma string
2. Os quatro testes ficam em arquivo próprio, fora do arquivo com `@vitest-environment jsdom`
3. A conversão mundo→tela do harness usa `makeTransform`/`worldToScreen` de `src/render/transform.ts`, não uma cópia dos números da câmera demo
4. Morto o processo do harness pelo timeout, não sobram Chromium, servidor Vite nem perfil temporário
5. Os mesmos quatro testes seguem vermelhos contra o `src/App.tsx` anterior ao PHY-18 e verdes contra o atual
6. Gate verde

#### Verification

    npx vitest run src/App.browser.test.ts
    git checkout 9bc8534 -- src/App.tsx && npx vitest run src/App.browser.test.ts   # 4 failed
    git checkout HEAD -- src/App.tsx
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: é mudança estrutural de testes que já existem. O vermelho
  exigido é o do critério 5 — os quatro testes contra o `App.tsx` anterior ao
  PHY-18, que é a prova de que a mudança de formato não afrouxou o oráculo.

## Comments

Aberto pela revisão (etapa 3) do PHY-18 em 2026-09-13, com os achados dos dois
eixos. Não bloqueia o merge do PHY-18.
