# PHY-43: O lado tenso de uma polia com massa não cai em queda livre quando o outro afrouxa
Stage: blocked
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (`tautTensions`)
  - `src/sim/acceptance.test.ts` (bloco `pulley with mass (PHY-25)`)

#### What to build

O active set do `tautTensions` tira de uma vez, numa passada, todas as peças cuja tensão saiu ≤ 0. As peças estão acopladas pelo disco (`K` não é diagonal). Assim, a tensão negativa de uma peça frouxa pode empurrar para ≤ 0 também a peça que deveria estar tensa. As duas saem, e o lado tenso fica sem força de corda nenhuma.

O Sonnet reproduziu isto, e eu confirmei com probe no motor real. O cenário é uma Atwood sobre polia com massa: `M = 2`, `m₁ = m₂ = 2`, `R = 0,25`, o bloco `a` lançado para cima a 6 m/s (`vy`) e o `b` parado. A peça 1 (de `a` até a polia) afrouxa, e a peça 2 (da polia até `b`) deveria segurar `b` e girar o disco:
- esperado: `T₂ = M·a/2 ≈ 6,54 N` e `a_b = m·g/(m + M/2) ≈ 6,54 m/s²`;
- medido: `T = [0,00; 0,00]`, `slack`, e `b` em queda livre exata (`vy` cai 0,654 a cada 4 passos). O disco nunca gira.

O Sonnet também mostrou que o laço de re-solve não tem teste: trocar `taut = still` por `return T` deixa os 714 testes verdes. A correção que ele testou foi tirar só a peça mais negativa por iteração, com guarda para o conjunto vazio. Nela `T₂` assenta em 6,58 N e `b.vy = −4,325` no passo 40, contra −4,36 esperado. O início é ruidoso: um pico de 36 N no passo 8 e oscilação até o passo 28.

#### Acceptance criteria

1. No cenário acima, na janela dos passos 30 a 90: a peça 1 mostra `T = 0`; a peça 2 mostra `T` a menos de 3% de `M·a/2`; o `Δv` de `b` na janela fica a menos de 3% de `−m·g/(m + M/2)·Δt_janela`; e a corda não aparece como `slack`
2. Os testes de aceitação existentes da polia com massa (PHY-25) continuam verdes sem mudar tolerância
3. Os testes de regressão são mutate-verified conforme o `AGENTS.md`, incluindo a mutação `taut = still` → `return T`
4. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t PHY-25
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-25: o cenário do critério 1. Vermelho porque hoje as duas peças saem juntas e `b` cai livre.

## Comments

- 2026-09-30 Aberto a partir do F1 do Sonnet no review de benchmark do PR 9. A queda livre foi reproduzida por probe descartável no motor real. O stage 2 registra aqui o transiente do início (o pico e até que passo ele dura) depois da correção. O transiente não é critério; se parecer grande demais, vira um ticket próprio.

- 2026-09-30 Attempt 1 stopped to ask: PHY-43 ficou `blocked`: a folga fecha perto do passo 44, tornando impossível manter T₁ = 0 até o passo 90. /  / Teste vermelho e evidências salvos em `7356ba8` e `20ba572`. Código de produção restaurado. /  / A [skill `ticket-flow`](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. O stage 1 precisa revisar a janela do critério 1.
