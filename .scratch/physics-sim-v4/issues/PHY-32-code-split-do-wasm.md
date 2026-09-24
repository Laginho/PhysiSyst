# PHY-32: Code-split do Rapier
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (import dinâmico do simulador no boot)
  - `src/App.test.ts`
  - `vite.config.ts` (só se necessário)

#### What to build

O chunk de entrada deixa de carregar o Rapier (com o wasm embutido). O módulo do simulador passa a ser importado dinamicamente no boot que a tela de carregamento já dispara no mount, então o shell do app pinta antes e a espera do motor continua coberta pela tela de carregamento. Nenhum comportamento visível muda além do tempo da primeira pintura.

#### Acceptance criteria

1. `npm run build` gera um chunk de entrada abaixo de 500 kB; o Rapier sai num chunk carregado tardiamente
2. Se o aviso de chunk > 500 kB persistir, ele nomeia só o chunk tardio do Rapier; isso fica registrado em `## Comments` com os tamanhos
3. A tela de carregamento continua aparecendo até o motor ficar pronto, e o "tentar de novo" continua reexecutando o boot (testes existentes verdes)
4. Nenhum import estático de valor do módulo do simulador resta no caminho do chunk de entrada (imports de tipo continuam)
5. Verificação live em browser (`npm run build` + preview): primeira pintura sem o motor, play funciona depois do carregamento; tamanhos dos chunks antes e depois em `## Comments`
6. Gate verde

#### Verification

    npm run build
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: o critério 1 é verificado pela saída do build e os critérios 3–4 pelos testes existentes da tela de carregamento. Se o import dinâmico exigir mudança no espelho do `App.test.ts`, é mudança de harness, não teste novo.

## Comments
