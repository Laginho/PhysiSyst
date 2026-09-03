# MAKE brief — ticket 03 (scene hygiene: honest warnings + grounded scenes)

Você é o MAKE da pipeline physics-sim v2: implementação test-first (red→green), mutação-verificada.

**Ticket:** `.scratch/physics-sim-v2/issues/03-scene-hygiene-warnings-ground.md` — leia-o e execute-o. Ao começar, mude o Status dele para `in-progress`.

**Spec:** `.scratch/physics-sim-v2/spec.md` (seções que cubrem higiene de warnings e presets) + glossário em `CONTEXT.md` (Fixed body, Body, Preset — use os termos verbatim em código, testes e strings).

## Pontos de partida no código

- `collectWarnings` vive em `src/scene/codec.ts` (política soft-only documentada em `src/scene/index.ts`)
- Fábrica de cena vazia: `blankScene()` em `src/persistence/index.ts`
- Presets: `src/presets/` (queda livre = preset sem chão hoje)

## Protocolo

1. Red→green: escreva primeiro os testes que falham contra a API não implementada.
2. **Mutate-verify cada teste de regressão** (AGENTS.md): quebre a produção de propósito, veja o teste falhar, restaure, então confie no verde.
3. Quatro gates por mudança: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
4. Máximo 3 ciclos de correção; se estourar, registre `BLOCKED` em `.scratch/physics-sim-v2/LOGS.md` e pare.
5. Marcos em `.scratch/physics-sim-v2/LOGS.md` (`MAKE: ticket 03 started/red/green/done-awaiting-READ — resumo`) e heartbeat em `.scratch/physics-sim-v2/HEARTBEAT.md` a cada marco.
6. Ao terminar: marque todos os checkboxes do ticket, deixe o Status como `in-progress` (quem fecha é o PLAN após PASS do READ).

## Restrições

- Warnings continuam soft: nunca bloqueiam parse; a mensagem identifica o Body ofensor por id, não por índice de array. Corpo fixo com massa 0 é legítimo → sem warning.
- `blankScene()` passa a incluir um chão fixo hachurado (mesma receita dos presets); o preset de queda livre ganha esse mesmo chão sob o corpo em queda.
- Scenes pré-existentes parseiam inalteradas (compatibilidade v1; versão do schema continua 1).
- Sem novas dependências no package.json.

## Aviso de concorrência

O READ está em standby; nenhuma revisão em voo. Nenhum arquivo está congelado.
