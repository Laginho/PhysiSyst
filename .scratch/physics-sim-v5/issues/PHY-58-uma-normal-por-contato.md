# PHY-58: Uma normal por contato
Stage: to-review
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/render/overlay.ts (`normalArrows`)
  - src/render/overlay.test.ts

#### What to build

Um bloco apoiado na mesa mostra duas setas N, uma em cada quina (preset "Bloco na mesa com bloco pendurado"). `Simulator.readContacts()` devolve um `ContactPoint` por ponto do manifold, e `normalArrows` faz uma seta por ponto; a chave do par já é a mesma, então as duas levam o mesmo rótulo, mas são desenhadas as duas.

`normalArrows` passa a devolver uma seta por par de corpos (a chave `normal:<a>|<b>` que já existe): origem na média dos pontos daquele par, direção a normal do primeiro ponto do par, comprimento `NORMAL_LEN` como hoje. A ordem de saída é a ordem em que cada par aparece pela primeira vez.

#### Acceptance criteria

1. Dois `ContactPoint` do mesmo par em (0, 0) e (1, 0), normal (0, 1), dão uma seta só, com origem (0.5, 0) e vetor (0, `NORMAL_LEN`).
2. O par é o mesmo com `aId`/`bId` trocados: os pontos de `a|b` e `b|a` caem na mesma seta.
3. Dois pares diferentes dão duas setas, com chaves diferentes, na ordem em que aparecem.
4. Um par com um ponto só sai como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/overlay.test.ts`: critérios 1 a 3, vermelhos hoje porque `normalArrows` devolve uma seta por ponto. O 4 passa hoje e vai junto. Chama a função direto; não é costura de DOM.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 1, print do bloco na mesa com duas N).

#### Stage 2 (2026-10-02)

- Implementado agrupamento pela chave canônica do par, origem na média dos pontos, normal do primeiro ponto e ordem da primeira ocorrência. Entradas vazias e pares com um ponto preservados.
- Callers inspecionados: `App.tsx` (camada global de normais) e testes de `vectorLabels`; ajustada a expectativa de rótulos para uma seta por par.
- Commit de testes vermelho: `ff9a98b`; 4 falhas e 39 passes em 43 testes, pela emissão de setas duplicadas. Após implementação: 43/43.
- Mutate-verify: acrescentar `pairs.size` à chave interna de busca/inserção desativou o agrupamento. Os três novos testes de `normalArrows` falharam (2 em vez de 1, 2 em vez de 1 e 4 em vez de 2 setas); o teste atualizado de rótulos recebeu `[N_1, N_1, N_2]` em vez de `[N_1, N_2]`. Mutação revertida.
- Gate completo aprovado: 30 arquivos, 944 testes; lint, typecheck e build com exit 0. A primeira execução sob sandbox teve 12 falhas `Chromium disconnected`; a execução fora dele passou integralmente.
- Diff revisado: apenas os dois Primary files e este registro de fluxo; nenhum teste alterado no commit de implementação.
