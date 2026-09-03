# READ brief — ticket 04 (initial velocity core)

Você é o READ da pipeline physics-sim v2: verificação independente com replay adversarial. Ticket e spec:

- Ticket: `.scratch/physics-sim-v2/issues/04-initial-velocity-core.md` (critérios de aceite)
- Spec: `.scratch/physics-sim-v2/spec.md`, bullet "Initial velocity" das Implementation Decisions + glossário em `CONTEXT.md` (Initial velocity, Body, Scene)

## Changeset sob revisão (feito pelo MAKE)

- `src/scene/types.ts` + `src/scene/codec.ts` — Body ganha `vx`/`vy` (m/s, world frame) additive-optional; cena versão continua **1**; chaves canônicas no final do corpo para round-trip byte-estável de cenas pré-v2
- `src/sim/simulator.ts` — aplica v₀ via setLinvel na construção do mundo (só dinâmicos); carry de linvel em rebuild estrutural
- `src/playback/routing.ts` — edições de vx/vy classificadas como estruturais (absent-vs-absent permanece live)
- `src/App.tsx` — PropertiesPanel: campos "v0 x"/"v0 y" apenas quando `!body.fixed`
- `src/i18n/pt-BR.ts` + `en.ts` — keys `properties.vx`/`properties.vy`

## Nota do MAKE para verificação por inspeção (política v1 sem automação de UI)

"Fixed bodies expose no velocity field" é garantido pelo gate `!body.fixed` no PropertiesPanel (`src/App.tsx`) — confirme por leitura, não por teste automatizado.

## Protocolo (obrigatório)

1. **Reproduza os 4 gates de forma independente**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. **Replay adversarial de mutações** — para CADA mutação abaixo, aplique na produção, rode os testes, confirme que PELO MENOS UM teste falha, e restaure em seguida:
   1. parser injeta `vy: 0` quando ausente (quebra additive-optionality/byte-stability)
   2. validação de vx removida ou afrouxada
   3. world-build deixa de aplicar v₀
   4. carry de linvel removido do rebuild estrutural
   5. routing ignora edições de vx/vy (classificação errada)
   6. serialização escreve `vx/vy` ANTES das chaves canônicas existentes (deve quebrar byte-stability vs parse)
3. **Diff review** contra os critérios do ticket: cena v1 intocada, pre-v2 parseia/serializa inalterada, fixed sem campo (inspeção), i18n paridade nos dois catálogos, nenhuma dependência nova.
4. Estado final: código restaurado, 4 gates verdes de novo.

## Veredito

Escreva `.scratch/physics-sim-v2/reviews/04-verdict.md` com:

```
---
title: "T04 initial velocity core — READ gate"
kind: review
---
```

Verdict PASS ou REJECT no topo, seguido de evidência (gates reproduzidos, tabela mutação→teste que falhou) e, se REJECT, causas-raiz numeradas.

Depois, adicione UMA linha de marcos em `.scratch/physics-sim-v2/LOGS.md` (`READ: ticket 04 <PASS|REJECT> — <resumo>`) e atualize `.scratch/physics-sim-v2/HEARTBEAT.md` no início e fim.

Não altere código de produção além das mutações temporárias do passo 2 (restauradas na mesma sessão). Não mude o Status do ticket — quem fecha é o PLAN.
