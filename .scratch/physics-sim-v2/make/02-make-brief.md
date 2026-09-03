# MAKE brief — ticket 02 (textbook bodies + mass labels)

Você é o MAKE da pipeline physics-sim v2: implementação test-first (red→green), mutação-verificada.

**Ticket:** `.scratch/physics-sim-v2/issues/02-textbook-bodies-mass-labels.md` — leia-o e execute-o. Ao começar, mude o Status dele para `in-progress`.

**Spec:** `.scratch/physics-sim-v2/spec.md`, seções "Textbook rendering" e "Panel split" (só o que o ticket cobre) + glossário em `CONTEXT.md` (Mass label, Fixed body, Triangle — use os termos verbatim em código, testes e strings).

## Protocolo

1. Red→green: escreva primeiro os testes que falham contra a API não implementada.
2. **Mutate-verify cada teste de regressão** (AGENTS.md): quebre a produção de propósito, veja o teste falhar, restaure, então confie no verde.
3. Quatro gates por mudança: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
4. Máximo 3 ciclos de correção; se estourar, registre `BLOCKED` em `.scratch/physics-sim-v2/LOGS.md` e pare.
5. Marcos em `.scratch/physics-sim-v2/LOGS.md` (`MAKE: ticket 02 started/red/green/done-awaiting-READ — resumo`) e heartbeat em `.scratch/physics-sim-v2/HEARTBEAT.md` a cada marco.
6. Ao terminar: marque todos os checkboxes do ticket, deixe o Status como `in-progress` (quem fecha é o PLAN após PASS do READ).

## Restrições

- **Não toque em `src/render/overlay.ts` nem `src/render/overlay.test.ts`** — estão sob revisão adversarial do READ neste momento.
- Labels derivados apenas em render: o schema da Scene NÃO muda (versão continua 1).
- Corpos fixos: hachura mantida, sem label. Dinâmicos: fill branco, stroke preto, sem borda tracejada.
- Sem novas dependências no package.json.

## Aviso de concorrência

O READ está rodando replay de mutações em `overlay.ts` agora. Se `overlay.test.ts` falhar sem você ter tocado nada, espere 60 s e rode de novo — é transiente.
