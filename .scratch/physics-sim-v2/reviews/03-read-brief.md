# READ brief — ticket 03 (scene hygiene: honest warnings + grounded scenes)

Você é o READ da pipeline physics-sim v2: verificação independente com replay adversarial. Ticket e spec:

- Ticket: `.scratch/physics-sim-v2/issues/03-scene-hygiene-warnings-ground.md` (critérios de aceite)
- Spec: `.scratch/physics-sim-v2/spec.md`, seção "Warning policy" + item "Ground everywhere" das Implementation Decisions + glossário em `CONTEXT.md` (Fixed body, Body, Preset, Scene)

## Changeset sob revisão (feito pelo MAKE)

- `src/scene/codec.ts` — `collectWarnings`: corpos Fixed isentos do warning de massa positiva; warning de massa dinâmica ≤ 0 identifica o Body por id (`body '<id>': mass should be a positive number`) em vez de índice de array. Formato de índice de forces/contacts intencionalmente intocado.
- `src/persistence/index.ts` — nova `groundBody()` exportada: receita única de chão hachurado (fixed + rectangle + id `'chao'`), usada por `blankScene()`, preset wedge-flagship (dedup) e agora no preset de queda livre. A ordem literal das chaves espelha a saída canônica de `parse()` porque `isDirty` compara strings serializadas. Schema da Scene intocado (versão continua 1); cenas pré-existentes parseiam inalteradas.
- Testes: tabela de warnings (isenção de fixos, nomeação por id), blank scene com chão, free-fall com chão, parse inalterado.

## Atenção: incidentes declarados pelo MAKE (reverifique com rigor extra)

1. Mid-run, um restore escreveu conteúdo de presets em `src/persistence/index.ts`; MAKE afirma ter reconstruído verbatim e re-greenado a suíte antes de continuar.
2. Um fix de encoding esvaziou brevemente o arquivo do ticket; MAKE afirma tê-lo reescrito verbatim do transcript.
3. Bug real encontrado durante o green: `isDirty` (string-compare) quebrava estabilidade de bytes para cenas novas com corpo; resolvido espelhando a ordem canônica de chaves de `parse()` em `groundBody()`.

## Protocolo (obrigatório)

1. **Reproduza os 4 gates de forma independente**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. **Replay adversarial de mutações** — para CADA mutação abaixo, aplique na produção, rode os testes, confirme que PELO MENOS UM teste falha, e restaure o código em seguida:
   1. remover a isenção de Fixed bodies (fixo com massa 0 volta a gerar warning)
   2. trocar a identificação por id por `'?'` ou voltar ao índice de array na mensagem de massa
   3. remover o chão de `blankScene()`
   4. remover o chão do preset de queda livre
   5. mutar o id `'chao'` / a chave de hatch em `groundBody()` (hachura some)
   6. alterar a ordem das chaves em `groundBody()` de forma que a serialização de uma cena recém-criada difira da canonical de `parse()` (deve falhar via isDirty/teste de round-trip, se coberto)
3. **Diff review** contra os critérios do ticket: warnings continuam soft-only (nunca bloqueiam parse), schema versão 1 intacto, nenhuma dependência nova no package.json, `blankScene` + wedge + free-fall todos via a mesma receita `groundBody()`.
4. Estado final: código restaurado, 4 gates verdes de novo.

## Veredito

Escreva `.scratch/physics-sim-v2/reviews/03-verdict.md` com:

```
---
title: "T03 scene hygiene — READ gate"
kind: review
---
```

Verdict PASS ou REJECT no topo, seguido de evidência (gates reproduzidos, tabela mutação→teste que falhou) e, se REJECT, causas-raiz numeradas.

Depois, adicione UMA linha de marcos em `.scratch/physics-sim-v2/LOGS.md` (`READ: ticket 03 <PASS|REJECT> — <resumo>`) e atualize `.scratch/physics-sim-v2/HEARTBEAT.md` no início e fim.

Não altere código de produção além das mutações temporárias do passo 2 (restauradas na mesma sessão). Não mude o Status do ticket — quem fecha é o PLAN.
