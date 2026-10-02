# PHY-53: Os avisos do simulador chegam à tela
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-51
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (o cálculo de `warnings` em ~1434 e o que o faz mudar durante a corrida)
  - src/App.test.ts

#### What to build

O painel de avisos (`warnings.title`) mostra os avisos do simulador além dos da cena. Hoje ele mostra só `collectWarnings(doc)`, e o `Simulator.warnings` não aparece em lugar nenhum. Isso inclui o aviso de atrito degradado do grafo de contatos, que já existe e ninguém vê, e o do teto de ω do PHY-51, que aparece no meio da corrida.

Um aviso do simulador aparece no painel a partir do primeiro repaint depois de surgir, e some quando a cena é reconstruída sem ele. Os avisos da cena continuam como estão e vêm primeiro.

#### Acceptance criteria

1. Com um simulador cujo `warnings` tem uma linha desde a construção, o painel de avisos mostra essa linha depois do boot.
2. Com um simulador cujo `warnings` ganha uma linha num `step()` durante o play, o painel passa a mostrar essa linha sem nenhuma outra interação.
3. Uma cena com aviso próprio (por exemplo massa ≤ 0) mais um aviso do simulador mostra os dois, o da cena primeiro.
4. Com `warnings` vazio no simulador e cena sem avisos, o painel não aparece, como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`, com o `makeFakeSimulator` existente (`warnings` já é um campo dele): critérios 1 a 3, vermelhos hoje porque o App nunca lê `Simulator.warnings`. O 4 passa hoje e vai junto. É uma costura de DOM: o ticket registra, por teste novo, a mutação aplicada no `App.tsx` e a saída vermelha que ela deu (AGENTS.md, Mutate-verify).

## Comments

- 2026-10-01 Aberto na triagem do PHY-51. O proxy viu que `Simulator.warnings` não chega à UI (`src/App.tsx` ~1434 só lê `collectWarnings(doc)`) e separou isso do PHY-51 por ser outra costura.

- 2026-10-02 Stage 2: base `sweatshop/2026-10-01-2342`, branch `phy/PHY-53-avisos-do-simulador-chegam-a-tela`. Costura aprovada: painel DOM de avisos em `App.test.ts`, com o fake existente. Callers de `repaint`: resize, seleção, idioma, passos, reset, documento e gestos; boot publica o simulador em `ensureSim`. `Simulator.warnings` é uma lista readonly para o consumidor, mas o motor a modifica no mesmo array em `step()` e `replaceScene()`: copiar o conteúdo ao publicar na UI. Casos de fronteira: sem simulador no boot, listas vazias, surgimento depois do primeiro frame (sem depender do lock inicial nem do poll de 100 ms) e limpeza após rebuild.
- 2026-10-02 Primeiro red: `npx vitest run src/App.test.ts -t 'simulator warnings panel'` → **1 failed | 87 skipped (88)**, `expected [] to include 'Friction is degraded for this contact…'`. O teste de boot lê as linhas do painel real; não há aviso do simulador na UI atual.
- 2026-10-02 Segunda fatia red, após o boot ficar green: o mesmo comando → **1 failed | 1 passed | 87 skipped (89)**, `expected [] to deeply equal [ Array(1) ]` no segundo frame do play. O relógio e rAF são controlados; nenhum poll de 100 ms ou interação adicional roda entre o `step()` que acrescenta a linha ao mesmo array e a asserção DOM.
- 2026-10-02 Mutate-verify, por teste novo, no `App.tsx` de produção. Comando para cada mutação: `node node_modules/vitest/vitest.mjs run src/App.test.ts -t '<nome abaixo>'`. Cada execução deu **exit 1; 1 failed | 91 skipped (92)**; arquivo restaurado byte a byte após cada uma:
  - `shows simulator construction warnings after boot`: omitir `...simWarnings` do cálculo de `warnings` → `expected [] to include 'Friction is degraded for this contact…'`.
  - `shows a warning added during play`: substituir a leitura de `simRef.current?.warnings` no repaint por uma lista vazia → `expected [] to deeply equal [ Array(1) ]`, faltando a linha `body 'ball' approaches Rapier's ω ceiling` no segundo frame.
  - `lists scene warnings before simulator warnings`: inverter a concatenação para `[...simWarnings, ...collectWarnings(doc)]` → `expected [ 'Friction is degraded', …(1) ] to deeply equal [ …(2) ]`; diff vermelho mostra a ordem invertida das duas linhas.
  - `hides the panel when both`: mudar a condição de render de `warnings.length > 0` para `>= 0` → `expected <fieldset …(1)>…(2)</fieldset> to be undefined`; painel vazio presente indevidamente.
  - `removes simulator warnings after rebuilding`: preservar o snapshot anterior sempre que `nextWarnings.length === 0` → `expected <fieldset …(1)>…(2)</fieldset> to be undefined`; a linha `Friction is degraded` permanece após reset. O fake limpa o mesmo array, como `Simulator.replaceScene` faz.
- 2026-10-02 Green focado antes das mutações: `npx vitest run src/App.test.ts -t 'simulator warnings panel'` → **5 passed | 87 skipped (92)**. Os casos de ordem, ausência e limpeza usam a mesma costura já aprovada e validam o comportamento existente da implementação; seus mutants acima dão o red antes do commit de testes. Nenhuma alteração adicional de produção é necessária para esses casos.
- 2026-10-02 Primeiro gate: **4 failed | 810 passed (814), 1 arquivo falhou e 29 passaram**. As quatro falhas de leitura em PHY-27/PHY-28 vieram de isolamento do harness novo: `useFakeTimers()` falsificava rAF antes de `stubGlobal`, e `unstubAllGlobals()` no cleanup recolocava esse rAF preso ao relógio falso depois de `useRealTimers()`. Corrigido no próprio teste de play, falsificando apenas `setInterval`/`clearInterval`; rAF continua controlado pelo stub sem contaminar os testes seguintes. Nenhuma mudança de produção ou de critérios.
- 2026-10-02 Harness corrigido, red repetido antes do commit: mutação de play acima → **1 failed | 91 skipped (92), exit 1**, `expected [] to deeply equal [ Array(1) ]` no segundo frame. Restaurado `App.tsx`. Green com os cinco novos testes e os quatro afetados: `npx vitest run src/App.test.ts -t 'simulator warnings panel|durante o playback|cada ponta com o seu valor|com polia de massa no caminho'` → **9 passed | 83 skipped (92)**.
