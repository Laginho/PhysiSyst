---
title: "T02 textbook bodies + mass labels — READ gate"
kind: review
---

PASS

## Evidência

### Gates

Os quatro gates foram reproduzidos antes e depois do replay. O estado final ficou verde:

| Gate | Resultado final |
| --- | --- |
| `npm test` | 20 arquivos, 344/344 testes |
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm run build` | passou; apenas o aviso não bloqueante de chunk acima de 500 kB |

### Replay adversarial

Cada mutação foi aplicada em `src/render/draw.ts`, a suíte completa foi executada, pelo menos um teste falhou e o código foi restaurado na mesma sessão.

| # | Mutação | Evidência de falha |
| --- | --- | --- |
| 1 | Triângulo recebe `m` | 6 falhas / 338 aprovados: `Triangle -> M`, colisão de classes, símbolo único, re-flow, label de triângulo e cena mista |
| 2 | Remoção dos subscritos | 2 falhas / 342 aprovados: colisão de classe e re-flow após exclusão |
| 3 | Fill azul/colorido em dinâmicos | 1 falha / 343 aprovados: `dynamic body: white fill, black stroke, no dashed border` |
| 4 | Borda tracejada em dinâmicos | 1 falha / 343 aprovados: `dynamic body: white fill, black stroke, no dashed border` |
| 5 | Label sob transform escalado | 1 falha / 343 aprovados: `mass label drawn inside the dynamic body, under its own unscaled transform` |
| 6 | Label também em corpos fixos | 3 falhas / 341 aprovados: mapa de labels fixos, fixed-body draw e cena mista |
| 7 | Subscritos em ordem de criação invertida | 2 falhas / 342 aprovados: ordem de colisão e re-flow |

### Diff review

- `massLabels(scene)` é derivado em `draw.ts` durante o render; `Scene` continua na versão 1 e `Body` não ganhou campo de label.
- Triângulos usam `M`; demais corpos dinâmicos usam `m`; subscritos bijetivos base-26 são recalculados em cada render e corpos fixos são excluídos.
- Dinâmicos usam fill branco e stroke preto sólido; fixos preservam fill/hachura e borda tracejada.
- O texto é desenhado depois do `restore()` do transform escalado do corpo, com transform próprio em pixels.
- `overlay.ts` e `overlay.test.ts` permaneceram intocados.
- O Status do ticket permaneceu `in-progress`, conforme solicitado; o fechamento cabe ao PLAN.
