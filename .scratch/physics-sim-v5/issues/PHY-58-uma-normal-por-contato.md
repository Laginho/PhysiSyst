# PHY-58: Uma normal por contato
Stage: done
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

#### Resolution (2026-10-02)

Verdict: Approve

- Standards: 0 achados. Revisão independente confirmou escopo nos Primary files, simplicidade do acumulador e separação dos commits: `ff9a98b` contém testes e transição de estágio; `3ee52e8` contém implementação e registro, sem alterar testes.
- Spec: 0 achados. Critérios 1–4 atendidos: uma seta por par canônico, origem média, IDs invertidos agrupados, pares distintos na ordem da primeira ocorrência e ponto único preservado. Normal do primeiro ponto e entrada vazia também verificadas. Callers `App.tsx`, `vectorLabels` e produtor `Simulator.readContacts()` inspecionados, sem regressões identificadas.
- Arquivos de implementação revisados: `src/render/overlay.ts` e `src/render/overlay.test.ts`; nenhum ajuste de código necessário na revisão. Não há decisões de proxy neste ticket.
- Prova vermelho/verde repetida na revisão: substituição temporária de `overlay.ts` pela versão da base `2587ccd` produziu 4 falhas e 39 passes em 43 testes (os três testes novos de agrupamento e o teste atualizado de rótulos). Arquivo restaurado byte a byte; com a implementação, 43/43 passaram no gate completo.
- Gate: `npm test && npm run lint && npm run typecheck && npm run build`, fora do sandbox para permitir Chromium, exit 0. Testes: 30 arquivos, 944/944; lint, typecheck e build aprovados. Diff final sem alterações acidentais ou erros de whitespace.
- Branch já atualizada sobre `sweatshop/2026-10-02-2210`; merge local sem squash em `077d50b`, com árvore idêntica à implementação validada. Ticket e ledger fechados juntos na branch da sessão; publicação fica com o driver.
