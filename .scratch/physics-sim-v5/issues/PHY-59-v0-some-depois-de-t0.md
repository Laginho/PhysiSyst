# PHY-59: A seta v₀ só aparece em t = 0
Stage: done
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

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 6, print do pêndulo com v₀ durante o movimento).

- 2026-10-03 Stage 2: `paint` has one caller, `repaint`, shared by transport, selection, document/language changes and resize. The boundary is zero steps (including play before its first frame and reset); empty arrow layers are already supported by `vectorLabels`. No other vector producer changes.
- Red: `npm test -- src/App.test.ts -t PHY-59`: 4 failed, 95 skipped (99 total). Each global/selected × step/play case fails after advancing: `AssertionError: expected true to be false` at the canvas stroke check for `#43a047`. The initial-frame assertions pass, including the unchanged applied force. Tests use the real drawing path and record the current canvas frame.
- Mutate-verify: temporarily replaced `const showInitialVelocity = (opts?.stepsTaken ?? 0) === 0` in `src/App.tsx` with `const showInitialVelocity = true`, then restored the original source in `finally`. Command: `npm test -- src/App.test.ts -t PHY-59`.

  | New test suffix | Red output with mutation |
  | --- | --- |
  | `global / step` | `AssertionError: expected true to be false`, `src/App.test.ts:298`, after step |
  | `selected / step` | `AssertionError: expected true to be false`, `src/App.test.ts:298`, after step |
  | `global / play` | `AssertionError: expected true to be false`, `src/App.test.ts:298`, after animation frames |
  | `selected / play` | `AssertionError: expected true to be false`, `src/App.test.ts:298`, after animation frames |

  Mutant result: 4 failed, 95 skipped (99 total). Unmutated focused result: 4 passed, 95 skipped (99 total). Each case also checks v₀ at boot and after reset, its canvas label, and the continued presence of the applied-force arrow and label. Play cases check that pause does not restore v₀.
- Green gate: `npm test && npm run lint && npm run typecheck && npm run build` (PowerShell equivalent with exit-code guards): 30 test files passed, 948 tests passed; lint, typecheck and production build all exited 0. The initial sandbox run could not start a Vitest worker; validation succeeded outside that sandbox, including the existing Chromium layout tests. Final diff checked for scope and whitespace errors; only the ticket and its two Primary files changed. Implementation ready for stage 3; no merge performed.

#### Resolution (2026-10-03)

Verdict: Approve

- Standards: 2 apontamentos menores de processo/documentação, nenhum bloqueante. A ordem dos comentários contrariava a convenção de acrescentar histórico ao final (`docs/agents/issue-tracker.md`); corrigida neste fechamento. Os commits `eb00504` e `fcd7b63` citam PHY-59 no assunto, mas não têm o corpo com a justificativa pedido por `ticket-flow`; desvio registrado, sem reescrever o histórico. Nenhum problema de código ou smell identificado. Separação test-first confirmada: `eb00504` altera testes e ticket; `fcd7b63` altera produção e ticket, sem tocar testes.
- Spec: 0 achados. Critérios 1–4 atendidos: v₀ aparece em t = 0, desaparece após passo único ou play nos modos global e selecionado, continua oculta ao pausar e retorna após reset. A camada é esvaziada antes de `vectorLabels`; os demais produtores, caminhos de desenho e numeração por tipo permanecem iguais. Callers de `paint`, transporte e reset inspecionados, sem regressões identificadas.
- Arquivos revisados: `src/App.tsx` e `src/App.test.ts`. Nenhum ajuste de código necessário na revisão. Não há decisões de proxy neste ticket.
- Prova vermelho/verde repetida na revisão: substituir temporariamente o predicado de `showInitialVelocity` por `true` em `App.tsx` fez os quatro casos `global / step`, `selected / step`, `global / play` e `selected / play` falharem em `src/App.test.ts:298:43`, com `AssertionError: expected true to be false` na presença do stroke `#43a047` após avanço. Resultado: 4 falhas, 95 ignorados, 99 no total. Fonte restaurada byte a byte em `finally`; os quatro casos passaram com a implementação no gate completo.
- Gate: `npm test && npm run lint && npm run typecheck && npm run build` (equivalente PowerShell com guardas de exit code), fora do sandbox para permitir Chromium: exit 0; 30 arquivos e 948/948 testes; lint, typecheck e build aprovados. Build mantém o aviso de chunk acima de 500 kB, sem impedir a compilação.
- Branch já atualizada sobre `sweatshop/2026-10-02-2210`; merge local sem squash em `ac62e6f`, com árvore idêntica à implementação validada. Ticket e ledger fechados juntos na branch da sessão; publicação fica com o driver.
