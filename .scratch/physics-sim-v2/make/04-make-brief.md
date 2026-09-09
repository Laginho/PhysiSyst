# MAKE brief — ticket 04 (initial velocity core)

Você é o MAKE da pipeline physics-sim v2: implementação test-first (red→green), mutação-verificada.

**Ticket:** `.scratch/physics-sim-v2/issues/PHY-04-initial-velocity-core.md` — leia-o e execute-o. Ao começar, mude o Status dele para `in-progress`.

**Spec:** `.scratch/physics-sim-v2/spec.md` (bullets "Initial velocity" das Implementation Decisions) + glossário em `CONTEXT.md` (Initial velocity, Body, Scene — termos verbatim em código, testes e strings).

## Pontos de partida no código

- Schema de corpo: `src/scene/types.ts`; parse/serialize round-trip: `src/scene/codec.ts` (versão da cena continua **1** — precedente: flag particle-mode additive-optional)
- Aplicação no mundo + rebuilds estruturais: `src/sim/simulator.ts`, carry-over em `src/playback/` (routing/rebuild)
- Painel do corpo: `src/App.tsx`; strings novas nos DOIS catálogos: `src/i18n/pt-BR.ts` + `src/i18n/en.ts` (paridade já testada em `i18n.test.ts`)
- Corpos Fixed não expõem input de velocidade

## Protocolo

1. Red→green: escreva primeiro os testes que falham contra a API não implementada.
2. **Mutate-verify cada teste de regressão** (AGENTS.md): quebre a produção de propósito, veja o teste falhar, restaure, então confie no verde.
3. Quatro gates por mudança: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
4. Máximo 3 ciclos de correção; se estourar, registre `BLOCKED` em `.scratch/physics-sim-v2/LOGS.md` e pare.
5. Marcos em `.scratch/physics-sim-v2/LOGS.md` (`MAKE: ticket 04 started/red/green/done-awaiting-READ — resumo`) e heartbeat em `.scratch/physics-sim-v2/HEARTBEAT.md` a cada marco.
6. Ao terminar: marque todos os checkboxes do ticket, deixe o Status como `in-progress` (quem fecha é o PLAN após PASS do READ).

## Restrições

- Campo additive-optional em corpos dinâmicos (`vx`,`vy` m/s, world frame): cena versão 1 intacta; cenas pré-v2 parseiam e serializam INALTERADAS (round-trip byte-estável — lembre do guard de ordem canônica de chaves descoberto no ticket 03).
- Simulador aplica como linear velocity na construção do mundo; rebuild estrutural durante playback carrega a velocidade sem reiniciar o corpo.
- Nenhuma dependência nova no package.json.
- Sem tocar em presets (ticket 08 cuida deles) nem no painel-split/"ver mais" (ticket 09).

## Aviso de concorrência

Nenhum review em voo; nada congelado. Você tem o codebase para si.
