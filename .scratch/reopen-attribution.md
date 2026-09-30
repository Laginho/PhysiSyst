# Reopen attribution

Uma linha por achado de cada reabertura, classificada pela rubrica do foreman (`foreman/SKILL.md`, seção 6). `Round` é a N-ésima linha `reopened` do ticket em `run-log.md`; `Implementer` e `Reviewer` como a coluna `Model` de lá. Quando o revisor da rodada é o mesmo modelo do foreman, quem classifica é o GPT-6 Astra (medium, read-only).

| When | ID | Round | Implementer | Reviewer | Label | Finding | Why |
|---|---|---|---|---|---|---|---|
| 2026-09-30 | PHY-41 | 1 | gpt-6.1-sol high | gpt-6.1-sol max | S2-implícito | Cordas colineares tornam `K` singular no solve por grupo; `solveLinear` devolve `null`, as tensões do grupo zeram e a massa sustentada cai 122,7 m em 300 passos (base: parada) | Regressão da própria mudança: o `null` de `solveLinear` já existia e o novo agrupamento passou a acioná-lo; o ticket não citava fios redundantes, mas o conserto (regularizar o pivô singular) pede cuidado, não decisão (ccabb26) |
