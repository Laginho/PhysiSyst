# PHY-21: O harness de navegador do PHY-18 vira um módulo de verdade
Stage: done
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

Implementado em 2026-09-14. O harness virou `src/test/browser.ts`: uma
`BrowserSession` tipada (`reset`/`rect`/`select`/`selectedLegends`/`drag`/
`readBoxPosition`/`close`) mais `withBrowserSession`, que garante o cleanup
(Chromium, servidor Vite, perfil temporário) num `finally` mesmo quando a
corrida contra o timeout perde — não depende mais de um processo filho morto
por `SIGTERM` para isso. Os quatro testes foram para `src/App.browser.test.ts`,
sem `@vitest-environment jsdom`; como o ambiente padrão do vitest já é `node`
(`vite.config.ts`), o `execFile('node', ['--input-type=module', '-e', ...])`
que rodava a string num processo filho separado deixou de ser necessário —
o harness roda no próprio processo do teste. A conversão mundo→tela usa
`makeTransform`/`worldToScreen`/`pixelsPerMeterForWidth` de
`src/render/transform.ts` com a câmera real do App (`centerX: 6, centerY: 4`),
não mais uma cópia da fórmula. Precisou de `@types/node` como devDependency
(não estava instalado) para o módulo tipar `node:child_process`,
`node:fs/promises`, `node:os` e `node:path`.

Critério 5 verificado manualmente (não é um commit próprio: não há teste novo,
é mudança estrutural — ver "Tests stage 2 writes" acima):

    git checkout 9bc8534 -- src/App.tsx
    npx vitest run src/App.browser.test.ts   # 4 failed, mesmas asserções de geometria/posição
    git checkout HEAD -- src/App.tsx         # working tree limpo depois

Critério 4 verificado à parte com um teste descartável chamando
`withBrowserSession` com `timeoutMs: 50` e um cenário que dorme 8s: a promise
rejeita com "browser scenario timed out" só depois do `finally` já ter
fechado Chromium/servidor/perfil — `readdir(tmpdir())` não mostra nenhuma
pasta `phy-21-*` depois. Não sobrou no repo.

Gate verde: `npm test && npm run lint && npm run typecheck && npm run build`.

#### Resolution (2026-09-14)

Aprovado e mergeado. Revisão nos dois eixos (Standards + Spec) com os seis
critérios verificados na máquina, não por leitura.

**Critérios**

1. ✅ `src/test/browser.ts`, módulo `.ts` de verdade: passa por `tsc --noEmit`
   e por `eslint .`. Nenhum programa dentro de `String.raw`; sobraram só dois
   snippets de página (`READ_BOX_POSITION_SCRIPT`, `SETTLE_SCRIPT`), que são
   código que roda *no* navegador e por definição atravessa `Runtime.evaluate`
   como string
2. ✅ Os quatro testes estão em `src/App.browser.test.ts`, sem
   `@vitest-environment jsdom`; o ambiente `node` vem do `vite.config.ts`.
   Dá para tirar o navegador do gate excluindo esse arquivo, que era o ponto
3. ✅ `worldToScreenPoint` monta a câmera com `makeTransform` +
   `pixelsPerMeterForWidth` e converte com `worldToScreen`, de
   `src/render/transform.ts`. A fórmula copiada sumiu (ver nota 1 abaixo sobre
   o que restou)
4. ✅ `withBrowserSession` fecha CDP, mata o Chromium esperando o `exit`,
   fecha o servidor Vite e apaga o perfil num `finally` — não depende mais de
   `SIGTERM` no processo filho. `openBrowserSession` faz o mesmo no `catch` do
   bootstrap, então uma falha no meio da subida também não vaza. Conferido:
   nenhum diretório `phy-*` em `%TEMP%` depois de três execuções da suíte
5. ✅ Reproduzido nesta revisão, não aceito do relato:

       git checkout 9bc8534 -- src/App.tsx
       npx vitest run src/App.browser.test.ts   # Tests 4 failed (4)
       # ex.: expected { x: 8, y: 7.126668689320388 } to deeply equal { x: 8, y: 6 }
       git checkout HEAD -- src/App.tsx
       npx vitest run src/App.browser.test.ts   # Tests 4 passed (4)

   O oráculo não afrouxou: os mesmos números continuam separando o `App.tsx`
   de antes do PHY-18 do de agora
6. ✅ Gate verde depois da correção de etapa 3: `Test Files 28 passed`,
   `Tests 471 passed (471)`, lint limpo, `tsc --noEmit` limpo, build ok.
   Os quatro testes de navegador agora levam ~2s cada (antes, um
   `execFile('node', …)` por teste), a suíte inteira 10,8s

**Correção de etapa 3** (`6242a8c`, dentro dos Primary files, sem teste novo):
`withBrowserSession` corria contra um `setTimeout` que nunca era cancelado —
cenário que termina em 2s deixava um timer de 25s vivo segurando o event loop.
`clearTimeout` no mesmo `finally`.

**Duas notas fora da fronteira deste ticket** (nenhuma bloqueia; viram ticket
próprio se valerem a pena):

1. Restou uma cópia de dois números: o harness escreve `centerX: 6, centerY: 4`
   à mão porque `src/App.tsx:93` monta a câmera inline e não a exporta —
   importar exigiria mexer em `App.tsx`, que não está nos Primary files. O
   risco que o critério 3 mirava é pequeno aqui: divergir do app faz o clique
   cair no lugar errado e o teste falhar alto, não passar em silêncio
2. `@types/node` entrou como devDependency e o `tsconfig.json` é único, sem
   campo `types` — ou seja, `process`/`Buffer`/`node:*` passaram a tipar em
   todo o `src`, inclusive no código do app. O formato antigo evitava isso de
   propósito (o `import(/* @vite-ignore */ moduleName)` existia para manter as
   APIs do Node fora da superfície de tipos do app). A rede de segurança que
   sobrou é o build, que quebra ao tentar empacotar `node:*` para o navegador
