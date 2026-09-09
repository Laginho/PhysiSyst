# READ brief — ticket 02 (textbook bodies + mass labels)

Você é o READ da pipeline physics-sim v2: verificação independente com replay adversarial. Ticket e spec:

- Ticket: `.scratch/physics-sim-v2/issues/PHY-02-textbook-bodies-mass-labels.md` (critérios de aceite)
- Spec: `.scratch/physics-sim-v2/spec.md`, seções "Textbook rendering" / "Panel split" (só o que o ticket cobre) + glossário em `CONTEXT.md` (Mass label, Fixed body, Triangle)

## Changeset sob revisão (feito pelo MAKE)

- `src/render/draw.ts` — nova `massLabels(scene)`: `M` para triângulos, `m` para demais formas; subscritos base-26 bijetivos por classe de letra (`m_a`, `m_b`, …, `m_aa`) atribuídos em ordem de criação, recomputados a cada render; `drawScene`: dinâmicos com fill branco + stroke preto sólido, fixos mantêm hachura + borda tracejada, label desenhado em transform próprio NÃO escalado
- Testes: `src/render/draw.test.ts` (10 testes novos, incl. simulação do stack de escala do ctx)
- Schema da Scene intocado (versão continua 1); `overlay.ts`/`overlay.test.ts` intocados

## Protocolo (obrigatório)

1. **Reproduza os 4 gates de forma independente**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. **Replay adversarial de mutações** — para CADA mutação abaixo, aplique na produção, rode os testes, confirme que PELO MENOS UM teste falha, e restaure o código em seguida:
   1. trocar a classe de letra do triângulo (triângulo passa a receber `m`)
   2. remover a atribuição de subscritos (dois corpos da mesma classe ficam com símbolo idêntico)
   3. fill colorido/azul nos dinâmicos em vez de branco
   4. restaurar borda tracejada nos dinâmicos
   5. desenhar o label sob o transform escalado do corpo (tamanho do label passa a variar com o zoom)
   6. atribuir label também a corpos fixos
   7. inverter a ordem de criação na atribuição dos subscritos (`m_b` antes de `m_a`)
3. **Diff review** contra os critérios do ticket: labels derivados apenas em render (schema intacto), corpos fixos sem label, re-flow de subscritos após deleção, hachura preservada nos fixos, nenhum toque em overlay.
4. Estado final: código restaurado, 4 gates verdes de novo.

## Veredito

Escreva `.scratch/physics-sim-v2/reviews/02-verdict.md` com:

```
---
title: "T02 textbook bodies + mass labels — READ gate"
kind: review
---
```

Veredito PASS ou REJECT no topo, seguido de evidência (gates reproduzidos, tabela mutação→teste que falhou) e, se REJECT, causas-raiz numeradas.

Depois, adicione UMA linha de marcos em `.scratch/physics-sim-v2/LOGS.md` (`READ: ticket 02 <PASS|REJECT> — <resumo>`) e atualize `.scratch/physics-sim-v2/HEARTBEAT.md` no início e fim.

Não altere código de produção além das mutações temporárias do passo 2 (restauradas na mesma sessão). Não mude o Status do ticket — quem fecha é o PLAN.
