# PHY-70: Módulo de energia e momento
Stage: implementing
Status: ready-for-agent
Blocked by: none
Review: agent
Difficulty: normal

- Primary files:
  - src/App.test.ts (compatibilidade do makeFakeSimulator com readPulleys; sem novo seam)
  - src/sim/energy.ts (novo, puro: sem React, sem Rapier)
  - src/sim/energy.test.ts (novo)
  - src/sim/simulator.ts (`Simulator` :54-71, `SpringState` :39-50, `readSpring` ~:371-374, `Chain` :111-121, discos de polia ~:901-931 e mapa `disks` :814, `readConstraints` :1378)
  - src/sim/simulator.test.ts
  - src/scene/types.ts (`Geometry` :8-31, CM do triângulo :53-58, `Pulley` :82-88, `Spring` :115-124)
  - src/App.tsx (`RecordedFrame` :708-714, `captureFrame` :722-728: uma linha cada)

#### What to build

Nenhum módulo calcula energia hoje; os testes têm helpers inline. Este ticket cria `src/sim/energy.ts` lendo o que a gravação já guarda (cena, `BodyState`, `ConstraintState`) mais duas leituras novas do simulador.

Módulo:

- `momentOfInertia(body: Body): number` — retângulo `m(w²+h²)/12`, círculo `m r²/2`, triângulo em torno do CM (fórmula do triângulo retângulo de base `b` e altura `b·tan α` sobre seu centróide).
- `centerOfMass(body: Body, state: BodyState): Vec2` — posição para retângulo e círculo; para o triângulo, o deslocamento `(2b/3, h/3)` do vértice α rotacionado por `state.rotation`.
- `bodyEnergy(scene, body, state): { Ec, Epg, p: Vec2 }` — `Ec = ½m|v|² + ½Iω²` (o termo em ω é zero quando `scene.constants.particleMode`), `Epg = m·g·y_CM` com g de `scene.constants.g`, `p = m·v`.
- `systemEnergy(scene, states, constraints, pulleys): { Ec, Epg, Eel, Emec, p }` — soma de `bodyEnergy` sobre os corpos não fixos; `Eel = Σ ½k·dx²` das molas (k de `scene.constraints`, dx de `SpringState.dx`) mais `Σ chainKinetic` em `Ec`; discos de polia com massa `½(½MR²)ω²` em `Ec` (M, R de `scene.pulleys`, ω de `PulleyState.angvel`), mantido mesmo em modo partícula; `Emec = Ec + Epg + Eel`.

Simulador:

- `SpringState.chainKinetic?: number` — `½ Σ (mₛ/N) w_i²` dos nós da `Chain` quando a mola tem massa (`chain.w` são as velocidades dos nós ao longo do eixo); ausente na mola ideal.
- `PulleyState { id: string; angvel: number }` e `readPulleys(): PulleyState[]` na interface `Simulator`, uma entrada por polia **com massa** (lê `disks`), ordem do documento.
- `RecordedFrame` ganha `pulleys: PulleyState[]` e `captureFrame` o preenche. Nenhum consumidor ainda (PHY-71).

#### Acceptance criteria

1. `momentOfInertia`: quadrado 0,4 m de 2 kg → `2·(0,16+0,16)/12`; círculo r = 0,5 de 3 kg → `0,375`; triângulo b = 1, α = 45°, m = 1 → valor da fórmula do triângulo retângulo sobre o centróide (±1e-9).
2. `centerOfMass` do triângulo b = 3, α = 30°, rotação 90°, posição (1, 1) → `(1 − h/3, 1 + 2)`, com `h = 3·tan 30°` (±1e-9).
3. `bodyEnergy` de um corpo de 2 kg a 3 m de altura com v = (1, 0) e ω = 2, g = 10: `Ec = 1 + ½·I·4`, `Epg = 60`, `p = (2, 0)`; com `particleMode: true`, `Ec = 1`.
4. `systemEnergy` ignora corpos fixos: chão fixo de 1000 kg não contribui para `Epg` nem `p`.
5. `systemEnergy` com uma mola k = 50, `dx = 0,2` e `chainKinetic = 0,3` → `Eel = 1`, e `Ec` inclui 0,3; com uma polia com massa M = 2, R = 0,5 e `angvel = 4` → `Ec` inclui `½·(½·2·0,25)·16 = 2`, inclusive com `particleMode: true`.
6. `readPulleys()` numa cena com uma polia com massa e uma sem devolve um elemento, com o id da polia com massa; depois de 60 passos no preset `movable-pulley` com massa (ou cena inline equivalente), `angvel ≠ 0`.
7. `readConstraints()` numa mola com `mass` devolve `chainKinetic` finito e ≥ 0; na mola ideal, `chainKinetic` é `undefined`.
8. `RecordedFrame.pulleys` existe e `captureFrame` o preenche (typecheck + um teste em `App.test.ts` só se o simulador falso já for inspecionado por frame; senão, typecheck basta).

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/energy.test.ts`: critérios 1 a 5 chamando o módulo direto; vermelhos hoje porque o módulo não existe.
- `src/sim/simulator.test.ts`: critérios 6 e 7 chamando o simulador direto; vermelhos hoje porque `readPulleys` e `chainKinetic` não existem.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy). Bruno decidiu: módulo puro `src/sim/energy.ts` lendo o `RecordedFrame`, I analítico; simulador expõe `readPulleys()` com `{id, angvel}` e `SpringState.chainKinetic?`.
- Proxy decided: `readPulleys()` só para polias com massa; sistema exclui corpos fixos; termo do disco mantido no modo partícula; E_pg no CM com g de `scene.constants.g`.
- Planner: independente de PHY-67…69; toca `App.tsx` em uma linha de tipo e uma de captura.

- 2026-10-03 Attempt 1 failed: exit 0. Log tail: A PHY-70 ficou bloqueada pelo ambiente: o terminal falhou ao iniciar (`CreateProcessWithLogonW failed: 1909`), e a alternativa de leitura via Node também falhou. /  / Não consegui ler a skill `ticket-flow` nem identificar o `Stage:` do ticket. Nenhum arquivo foi alterado e nenhuma validação foi executada. /  / Restaure o acesso ao terminal nesta sessão para eu continuar a PHY-70.
- 2026-10-03 Stage 2: retomada após falha ambiental; terminal disponível fora do sandbox. Leitura dos consumidores: readSpring só por readConstraints; readConstraints consumido por App e testes; Simulator implementado pelo simulador real e pelo makeFakeSimulator de App.test.ts. Adaptação mínima deste fake incluída em Primary files, sem novo seam. App.tsx também precisa inicializar pulleys: [] no frame inicial; tipo PulleyState será importado diretamente do módulo para preservar o escopo.
- Red antes de produção: `npx vitest run src/sim/energy.test.ts src/sim/simulator.test.ts`: 2 arquivos falharam, 2 testes falharam / 34 passaram. energy.test.ts: Cannot find module './energy'; simulator.test.ts: sim.readPulleys is not a function; chainKinetic esperado 0, recebido undefined. Casos adicionais: cenas vazias, momento em dois eixos, gravidade negativa, compressão, ordem por id/documento, snapshots e replaceScene.
