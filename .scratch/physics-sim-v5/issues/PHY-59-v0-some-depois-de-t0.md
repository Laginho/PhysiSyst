# PHY-59: A seta v₀ só aparece em t = 0
Stage: implementing
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/App.tsx (`paint`: camadas do overlay em ~236 e o ramo de seleção em ~251)
  - src/App.test.ts

#### What to build

A seta de velocidade inicial (`initialVelocityArrows`) é desenhada a partir do documento em todo repaint, então durante o play ela continua presa ao corpo (print do pêndulo com v₀ em pleno movimento). v₀ é uma condição inicial: só faz sentido enquanto o mundo está em t = 0.

`paint` passa a desenhar as setas v₀ (no modo global e no ramo do corpo selecionado) só quando nenhum passo foi dado desde o último reset, o mesmo critério do `structuralLocked` (`stepsTaken > 0`). Escondidas, elas também não entram na numeração de `vectorLabels`.

#### Acceptance criteria

1. Com um corpo de `vx ≠ 0`, em t = 0 (boot ou depois do reset), o overlay global desenha a seta v₀.
2. Depois de um passo (play ou passo único), a seta v₀ não é mais desenhada, no modo global nem com o corpo selecionado.
3. Depois do reset, a seta volta.
4. Os outros vetores não mudam.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: critérios 1 a 3, observando as chamadas de desenho do canvas com a cor da camada v₀ (`#43a047`) ou o rótulo `v_0`. O 2 é vermelho hoje. É uma costura de DOM: o ticket registra, por teste novo, a mutação aplicada no `App.tsx` e a saída vermelha (AGENTS.md, Mutate-verify).

## Comments

- 2026-10-03 Stage 2: `paint` has one caller, `repaint`, shared by transport, selection, document/language changes and resize. The boundary is zero steps (including play before its first frame and reset); empty arrow layers are already supported by `vectorLabels`. No other vector producer changes.
- Red: `npm test -- src/App.test.ts -t PHY-59`: 4 failed, 95 skipped (99 total). Each global/selected × step/play case fails after advancing: `AssertionError: expected true to be false` at the canvas stroke check for `#43a047`. The initial-frame assertions pass, including the unchanged applied force. Tests use the real drawing path and record the current canvas frame.

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 6, print do pêndulo com v₀ durante o movimento).
