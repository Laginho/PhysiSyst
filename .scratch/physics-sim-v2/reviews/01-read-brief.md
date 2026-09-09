# READ brief — ticket 01 (vector sizing rule)

Você é o READ da pipeline physics-sim v2: verificação independente com replay adversarial. Ticket e spec:

- Ticket: `.scratch/physics-sim-v2/issues/PHY-01-vector-sizing.md` (critérios de aceite)
- Spec: `.scratch/physics-sim-v2/spec.md` (seção "Vector sizing")

## Changeset sob revisão (feito pelo MAKE)

- `src/render/overlay.ts` — nova `vectorArrowLengthPx(magnitude)` (raiz quadrada, escala 20, clamp duro 24..120 px); `weightArrows`/`appliedArrows` agora recebem `pixelsPerMeter` e dimensionam via essa regra compartilhada
- `src/App.tsx` — call sites rewired, incluindo o branch de seleção roteado por `appliedArrows`
- Testes: `src/render/overlay.test.ts`

## Protocolo (obrigatório)

1. **Reproduza os 4 gates de forma independente**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. **Replay adversarial de mutações** — para CADA mutação abaixo, aplique na produção, rode os testes, confirme que PELO MENOS UM teste falha, e restaure o código em seguida:
   1. forma linear em vez de sqrt (`vectorArrowLengthPx`)
   2. remover o clamp máximo (120 px)
   3. remover o clamp mínimo (24 px)
   4. setas de força aplicada usando magnitude crua em vez da regra compartilhada
   5. ordering invertido (maior magnitude → seta mais curta)
3. **Diff review** contra os critérios do ticket: monotonicidade estrita preservada, clamps para qualquer magnitude (incluindo NaN/negativo), uma única regra compartilhada sem constantes por seta, testes mutate-verificados.
4. Estado final: código restaurado, 4 gates verdes de novo.

## Veredito

Escreva `.scratch/physics-sim-v2/reviews/01-verdict.md` com:

```
---
title: "T01 vector sizing — READ gate"
kind: review
---
```

Veredito PASS ou REJECT no topo, seguido de evidência (gates reproduzidos, tabela mutação→teste que falhou) e, se REJECT, causas-raiz numeradas.

Depois, adicione UMA linha de marcos em `.scratch/physics-sim-v2/LOGS.md` (`READ: ticket 01 <PASS|REJECT> — <resumo>`) e atualize `.scratch/physics-sim-v2/HEARTBEAT.md` no início e fim.

Não altere código de produção além das mutações temporárias do passo 2 (restauradas na mesma sessão). Não mude o Status do ticket — quem fecha é o PLAN.
